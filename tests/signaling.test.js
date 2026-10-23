import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { io } from 'socket.io-client'
import { createSignalingServer } from '../server/createServer.js'
import { EVENTS } from '../shared/protocol.js'

async function fixture(t, options = {}) {
  const demo = createSignalingServer({ logger: {}, ...options })
  demo.httpServer.listen(0, '127.0.0.1')
  await once(demo.httpServer, 'listening')
  const url = `http://127.0.0.1:${demo.httpServer.address().port}`
  const clients = []
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect())
    await demo.close()
  })
  async function client() {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2_000
    })
    clients.push(socket)
    await once(socket, 'connect')
    return socket
  }
  const request = (socket, event, payload = {}) =>
    socket.timeout(2_000).emitWithAck(event, payload)
  return { client, request, url }
}

test('two members get distinct roles; repeated join is idempotent; third join is rejected', async (t) => {
  const { client, request } = await fixture(t)
  const a = await client(),
    b = await client(),
    c = await client()
  assert.equal((await request(a, EVENTS.JOIN)).role, 'caller')
  assert.equal((await request(a, EVENTS.JOIN)).participantCount, 1)
  const joined = await request(b, EVENTS.JOIN)
  assert.equal(joined.role, 'callee')
  assert.equal(joined.peerPresent, true)
  assert.equal(typeof joined.callId, 'string')
  assert.match((await request(c, EVENTS.JOIN)).error, /full/)
})

test('offer, answer and ICE are relayed to the paired participant', async (t) => {
  const { client, request } = await fixture(t)
  const a = await client(),
    b = await client()
  await request(a, EVENTS.JOIN)
  const { callId } = await request(b, EVENTS.JOIN)
  const offerReceived = once(b, EVENTS.DESCRIPTION)
  assert.equal(
    (
      await request(a, EVENTS.DESCRIPTION, {
        callId,
        description: { type: 'offer', sdp: 'example offer' }
      })
    ).ok,
    true
  )
  assert.equal((await offerReceived)[0].description.sdp, 'example offer')
  const answerReceived = once(a, EVENTS.DESCRIPTION)
  await request(b, EVENTS.DESCRIPTION, {
    callId,
    description: { type: 'answer', sdp: 'example answer' }
  })
  assert.equal((await answerReceived)[0].description.type, 'answer')
  const candidateReceived = once(b, EVENTS.CANDIDATE)
  await request(a, EVENTS.CANDIDATE, {
    callId,
    candidate: { candidate: 'candidate:example', sdpMid: '0' }
  })
  assert.equal((await candidateReceived)[0].callId, callId)
})

test('nonmembers, wrong roles and malformed signaling are rejected', async (t) => {
  const { client, request } = await fixture(t)
  const a = await client(),
    b = await client(),
    outsider = await client()
  await request(a, EVENTS.JOIN)
  const { callId } = await request(b, EVENTS.JOIN)
  const offer = { callId, description: { type: 'offer', sdp: 'example' } }
  assert.match(
    (await request(outsider, EVENTS.DESCRIPTION, offer)).error,
    /Join/
  )
  assert.match(
    (await request(b, EVENTS.DESCRIPTION, offer)).error,
    /Only the caller/
  )
  assert.equal(
    (await request(a, EVENTS.DESCRIPTION, { callId, description: {} })).ok,
    false
  )
  assert.equal(
    (
      await request(a, EVENTS.CANDIDATE, {
        callId,
        candidate: { candidate: 123 }
      })
    ).ok,
    false
  )
})

test('hang up rotates the call ID; late SDP/ICE from the old round is rejected', async (t) => {
  const { client, request } = await fixture(t)
  const a = await client(),
    b = await client()
  await request(a, EVENTS.JOIN)
  const { callId } = await request(b, EVENTS.JOIN)
  const ended = once(b, EVENTS.CALL_ENDED)
  await request(a, EVENTS.END_CALL, { callId })
  assert.equal((await ended)[0].callId, callId)
  const next = await request(a, EVENTS.JOIN)
  assert.notEqual(next.callId, callId)
  assert.equal(next.participantCount, 2)
  assert.match(
    (
      await request(a, EVENTS.CANDIDATE, {
        callId,
        candidate: { candidate: 'old' }
      })
    ).error,
    /old call/
  )
  assert.match(
    (
      await request(a, EVENTS.DESCRIPTION, {
        callId,
        description: { type: 'offer', sdp: 'old' }
      })
    ).error,
    /old call/
  )
})

test('disconnect releases a slot; remaining callee becomes caller for the next arrival', async (t) => {
  const { client, request } = await fixture(t)
  const a = await client(),
    b = await client(),
    c = await client()
  await request(a, EVENTS.JOIN)
  await request(b, EVENTS.JOIN)
  const peerLeft = once(b, EVENTS.PEER_LEFT)
  a.disconnect()
  await peerLeft
  const remaining = await request(b, EVENTS.JOIN)
  assert.equal(remaining.role, 'caller')
  assert.equal(remaining.callId, null)
  assert.equal((await request(c, EVENTS.JOIN)).role, 'callee')
})

test('ICE configuration is available through HTTP; relay-only without TURN fails explicitly', async (t) => {
  const first = await fixture(t, {
    iceServers: [{ urls: 'stun:example.org:3478' }]
  })
  const configuration = await (
    await fetch(`${first.url}/api/ice-servers`)
  ).json()
  assert.deepEqual(configuration.iceServers, [
    { urls: 'stun:example.org:3478' }
  ])
  const second = await fixture(t, { iceTransportPolicy: 'relay' })
  const response = await fetch(`${second.url}/api/ice-servers`)
  assert.equal(response.status, 503)
})
