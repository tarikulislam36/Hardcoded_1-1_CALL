import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { EVENTS, MAX_PARTICIPANTS, ROOM_ID } from '../shared/protocol.js'

/**
 * Signaling only: this process never receives microphone/camera media.
 * Exporting a factory lets the tests start an isolated server on a random port.
 */
export function createSignalingServer({
  iceServers = [],
  iceTransportPolicy = 'all',
  logger = console
} = {}) {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, { maxHttpBufferSize: 100_000 })
  // Insertion order determines the roles. This is an in-memory learning demo.
  const members = new Map()
  let callId = null

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, room: ROOM_ID, participants: members.size })
  })
  app.get('/api/ice-servers', (_request, response) => {
    if (
      iceTransportPolicy === 'relay' &&
      !iceServers.some((s) =>
        [].concat(s.urls).some((url) => /^turns?:/.test(url))
      )
    ) {
      response
        .status(503)
        .json({ error: 'Relay-only mode requires a configured TURN server.' })
      return
    }
    response
      .set('Cache-Control', 'no-store')
      .json({ iceServers, iceTransportPolicy })
  })

  function view(socketId) {
    const ids = [...members.keys()]
    return {
      roomId: ROOM_ID,
      joined: members.has(socketId),
      role: ids[0] === socketId ? 'caller' : 'callee',
      participantCount: members.size,
      peerPresent: members.size === MAX_PARTICIPANTS,
      callId
    }
  }

  function broadcastState() {
    for (const id of members.keys()) io.to(id).emit(EVENTS.STATE, view(id))
  }

  function removeMember(socket, reason) {
    if (!members.delete(socket.id)) return
    const previousCallId = callId
    callId = null
    socket.leave(ROOM_ID)
    // The remaining participant stays in the room and can call a new arrival.
    io.to(ROOM_ID).emit(EVENTS.PEER_LEFT, { callId: previousCallId, reason })
    broadcastState()
    logger.info?.(`[room] ${socket.id} left (${reason}); ${members.size}/2`)
  }

  function validatePair(socket, payload) {
    if (!members.has(socket.id)) return 'Join the demo room first.'
    if (members.size !== 2 || !callId) return 'Wait for the second participant.'
    if (payload?.callId !== callId)
      return 'This message belongs to an old call.'
    return null
  }

  function reply(acknowledgement, value) {
    if (typeof acknowledgement === 'function') acknowledgement(value)
  }

  function reject(socket, acknowledgement, error) {
    if (typeof acknowledgement === 'function')
      acknowledgement({ ok: false, error })
    else socket.emit(EVENTS.ERROR, { error })
  }

  io.on('connection', (socket) => {
    socket.on(EVENTS.JOIN, (_payload, acknowledgement) => {
      if (!members.has(socket.id)) {
        if (members.size >= MAX_PARTICIPANTS) {
          reject(
            socket,
            acknowledgement,
            'The room is full. Only two participants are allowed.'
          )
          return
        }
        members.set(socket.id, true)
        socket.join(ROOM_ID)
        if (members.size === 2) callId = randomUUID()
        logger.info?.(`[room] ${socket.id} joined; ${members.size}/2`)
      }
      reply(acknowledgement, { ok: true, ...view(socket.id) })
      broadcastState()
    })

    socket.on(EVENTS.DESCRIPTION, (payload, acknowledgement) => {
      let error = validatePair(socket, payload)
      const description = payload?.description
      const role = view(socket.id).role
      if (
        !error &&
        (!description ||
          !['offer', 'answer'].includes(description.type) ||
          typeof description.sdp !== 'string' ||
          description.sdp.length > 90_000)
      ) {
        error = 'Invalid session description.'
      }
      if (
        !error &&
        ((description.type === 'offer' && role !== 'caller') ||
          (description.type === 'answer' && role !== 'callee'))
      ) {
        error =
          'Only the caller sends offers; only the callee sends answers in this demo.'
      }
      if (error) return reject(socket, acknowledgement, error)
      socket.to(ROOM_ID).emit(EVENTS.DESCRIPTION, { callId, description })
      reply(acknowledgement, { ok: true })
    })

    socket.on(EVENTS.CANDIDATE, (payload, acknowledgement) => {
      let error = validatePair(socket, payload)
      const candidate = payload?.candidate
      if (
        !error &&
        (!candidate ||
          typeof candidate.candidate !== 'string' ||
          candidate.candidate.length > 8_000)
      ) {
        error = 'Invalid ICE candidate.'
      }
      if (error) return reject(socket, acknowledgement, error)
      socket.to(ROOM_ID).emit(EVENTS.CANDIDATE, { callId, candidate })
      reply(acknowledgement, { ok: true })
    })

    socket.on(EVENTS.END_CALL, (payload, acknowledgement) => {
      const error = validatePair(socket, payload)
      if (error) return reject(socket, acknowledgement, error)
      io.to(ROOM_ID).emit(EVENTS.CALL_ENDED, { callId })
      // Every call round gets a fresh identifier. Late old ICE/SDP cannot leak into the next.
      callId = randomUUID()
      broadcastState()
      reply(acknowledgement, { ok: true })
    })

    socket.on(EVENTS.LEAVE, (_payload, acknowledgement) => {
      removeMember(socket, 'left the room')
      reply(acknowledgement, { ok: true })
    })
    socket.on('disconnect', () =>
      removeMember(socket, 'signaling disconnected')
    )
  })

  return {
    app,
    httpServer,
    io,
    close: () => new Promise((resolve) => io.close(resolve))
  }
}
