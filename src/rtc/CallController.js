import { io } from 'socket.io-client'
import { EVENTS, ROOM_ID } from '../../shared/protocol.js'

export const initialState = {
  roomId: ROOM_ID,
  socketConnected: false,
  joined: false,
  role: null,
  participantCount: 0,
  peerPresent: false,
  callId: null,
  localStream: null,
  remoteStream: null,
  mediaPending: false,
  joinPending: false,
  callPending: false,
  hasPeerConnection: false,
  phase: 'idle',
  connectionState: 'not created',
  iceState: 'not created',
  signalingState: 'not created',
  microphoneEnabled: true,
  cameraEnabled: true,
  error: ''
}

/** One instance owns one tab's socket, capture stream and peer connection.
 * React renders snapshots; rerendering never constructs another peer connection.
 * Numbered comments match docs/LEARNING_GUIDE.md.
 */
export class CallController {
  constructor(onState, onLog) {
    this.onState = onState
    this.onLog = onLog
    this.state = { ...initialState }
    this.session = null
    this.pendingCandidates = []
    this.signalQueue = Promise.resolve()
    this.revision = 0
    this.mediaRequest = 0
    this.joinRequest = 0
    this.callRequest = 0
    this.disposed = false
    this.socket = io({ autoConnect: false })
    this.socket.on('connect', () => {
      this.update({ socketConnected: true })
      this.log('SIGNAL', 'Connected to the signaling server.')
    })
    this.socket.on('connect_error', () =>
      this.update({
        error:
          'Cannot reach signaling. Run npm run dev and check the SIGNAL terminal output.'
      })
    )
    this.socket.on('disconnect', (reason) => {
      this.joinRequest += 1
      this.closePeer()
      this.update({
        socketConnected: false,
        joined: false,
        joinPending: false,
        role: null,
        peerPresent: false,
        participantCount: 0,
        callId: null,
        phase: 'offline'
      })
      this.log(
        'SIGNAL',
        `Disconnected (${reason}). After signaling returns, join the room again.`
      )
    })
    this.socket.on(EVENTS.STATE, (room) => this.receiveRoomState(room))
    this.socket.on(EVENTS.PEER_LEFT, ({ reason }) => {
      this.closePeer()
      this.log(
        'ROOM',
        `The other participant ${reason}. Your preview stays on.`
      )
    })
    this.socket.on(EVENTS.CALL_ENDED, ({ callId }) => {
      if (callId !== this.state.callId) return
      this.closePeer()
      this.log(
        'CALL',
        'Call ended. Both participants can stay in the room and call again.'
      )
    })
    // Applying SDP must finish before subsequent ICE is handled.
    this.socket.on(EVENTS.DESCRIPTION, (message) =>
      this.enqueue(() => this.receiveDescription(message))
    )
    this.socket.on(EVENTS.CANDIDATE, (message) =>
      this.enqueue(() => this.receiveCandidate(message))
    )
    this.socket.on(EVENTS.ERROR, ({ error }) =>
      this.reportError(new Error(error))
    )
    this.socket.connect()
  }

  update(changes) {
    if (this.disposed) return
    this.state = { ...this.state, ...changes }
    this.onState(this.state)
  }

  log(kind, message) {
    if (!this.disposed)
      this.onLog({ at: new Date().toLocaleTimeString(), kind, message })
  }

  reportError(error) {
    if (this.disposed || error.name === 'AbortError') return
    const friendly =
      {
        NotAllowedError:
          'Camera/microphone permission was denied. Allow it in the browser, then try again.',
        NotFoundError:
          'A camera or microphone was not found. Connect both devices and try again.',
        NotReadableError:
          'The camera/microphone could not be opened. Another application may be using it.'
      }[error.name] ||
      error.message ||
      'An unexpected error occurred.'
    this.update({ error: friendly })
    this.log('ERROR', friendly)
  }

  enqueue(operation) {
    this.signalQueue = this.signalQueue
      .then(operation)
      .catch((error) => this.reportError(error))
  }

  async request(event, payload = {}) {
    const response = await this.socket
      .timeout(5_000)
      .emitWithAck(event, payload)
    if (!response?.ok)
      throw new Error(response?.error || 'The server rejected the request.')
    return response
  }

  // [1] Permission and capture. No call or room exists yet.
  async startCamera() {
    if (this.state.localStream || this.state.mediaPending) return
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        'Camera access requires HTTPS or localhost. A phone visiting an HTTP LAN IP is not localhost.'
      )
    const requestId = ++this.mediaRequest
    this.update({ mediaPending: true, error: '' })
    this.log('MEDIA', 'Requesting camera and microphone permission…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 640 }, height: { ideal: 360 } }
      })
      // Permission may resolve after Leave/unmount; release late capture immediately.
      if (this.disposed || requestId !== this.mediaRequest) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.update({
        localStream: stream,
        microphoneEnabled: true,
        cameraEnabled: true,
        phase: 'preview'
      })
      this.log(
        'MEDIA',
        `Preview ready (${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video track).`
      )
    } finally {
      if (requestId === this.mediaRequest) this.update({ mediaPending: false })
    }
  }

  // [2] Room membership and the media connection have separate lifetimes.
  async joinRoom() {
    if (this.state.joined || this.state.joinPending) return
    if (!this.state.socketConnected)
      throw new Error('Wait for the signaling server to connect.')
    if (!this.state.localStream) throw new Error('Start your camera first.')
    const requestId = ++this.joinRequest
    this.update({ joinPending: true, error: '' })
    try {
      const room = await this.request(EVENTS.JOIN)
      if (this.disposed || requestId !== this.joinRequest) return
      this.receiveRoomState(room)
      this.log('ROOM', `Joined ${ROOM_ID} as ${room.role}.`)
    } catch (error) {
      if (requestId === this.joinRequest) this.socket.emit(EVENTS.LEAVE, {})
      throw error
    } finally {
      if (requestId === this.joinRequest) this.update({ joinPending: false })
    }
  }

  receiveRoomState(room) {
    if (this.disposed || (!this.state.joined && !this.state.joinPending)) return
    if (room.callId !== this.state.callId) this.closePeer()
    this.update({
      joined: room.joined,
      role: room.role,
      participantCount: room.participantCount,
      peerPresent: room.peerPresent,
      callId: room.callId,
      phase: this.session
        ? this.state.phase
        : room.peerPresent
          ? 'ready'
          : 'waiting'
    })
    this.log(
      'ROOM',
      `${room.participantCount}/2 participants. ${room.peerPresent ? 'Caller can start the call.' : 'Waiting for the other tab.'}`
    )
  }

  current(session) {
    return (
      !this.disposed &&
      this.session === session &&
      this.state.callId === session.callId
    )
  }

  assertCurrent(session) {
    if (!this.current(session))
      throw new DOMException('The call was cancelled.', 'AbortError')
  }

  // [3] Attach captured tracks to a real browser peer connection.
  async createPeer(callId) {
    if (this.session) return this.session
    const revision = this.revision
    const response = await fetch('/api/ice-servers')
    const config = await response.json()
    if (!response.ok)
      throw new Error(config.error || 'Could not load ICE server settings.')
    if (
      this.disposed ||
      revision !== this.revision ||
      callId !== this.state.callId ||
      !this.state.joined
    )
      throw new DOMException('The call was cancelled.', 'AbortError')
    const pc = new RTCPeerConnection(config)
    const session = { pc, callId, remoteStream: new MediaStream() }
    this.session = session
    this.update({
      hasPeerConnection: true,
      phase: 'connecting',
      connectionState: pc.connectionState,
      iceState: pc.iceConnectionState,
      signalingState: pc.signalingState
    })
    this.log(
      'RTC',
      `Created RTCPeerConnection (ICE policy: ${config.iceTransportPolicy}).`
    )
    pc.onicecandidate = ({ candidate }) => {
      if (!this.current(session)) return
      if (candidate) {
        this.socket.emit(EVENTS.CANDIDATE, {
          callId,
          candidate: candidate.toJSON()
        })
        this.log('ICE →', `Sent a ${candidate.type || 'network'} candidate.`)
      } else this.log('ICE', 'Candidate gathering complete.')
    }
    pc.ontrack = ({ track }) => {
      if (!this.current(session)) return
      if (
        !session.remoteStream
          .getTracks()
          .some((existing) => existing.id === track.id)
      )
        session.remoteStream.addTrack(track)
      this.update({ remoteStream: session.remoteStream })
      this.log(
        'MEDIA ←',
        `Received a remote ${track.kind} track. Decode/playout may begin after packets arrive.`
      )
    }
    pc.onconnectionstatechange = () => {
      if (!this.current(session)) return
      this.update({
        connectionState: pc.connectionState,
        phase: pc.connectionState
      })
      this.log('RTC', `Connection: ${pc.connectionState}`)
      if (pc.connectionState === 'failed')
        this.update({
          error:
            'Media connection failed. Check TURN/network settings. Hang up, then start another call.'
        })
    }
    pc.oniceconnectionstatechange = () => {
      if (this.current(session))
        this.update({ iceState: pc.iceConnectionState })
    }
    pc.onsignalingstatechange = () => {
      if (this.current(session))
        this.update({ signalingState: pc.signalingState })
    }
    for (const track of this.state.localStream.getTracks())
      pc.addTrack(track, this.state.localStream)
    return session
  }

  // [4] Exactly one initial offerer. Simultaneous offers are a later exercise.
  async startCall() {
    if (this.state.callPending || this.session) return
    if (
      !this.state.joined ||
      !this.state.peerPresent ||
      this.state.role !== 'caller'
    )
      throw new Error(
        'Both participants must join; only the caller starts this demo.'
      )
    const callId = this.state.callId
    const requestId = ++this.callRequest
    this.update({ callPending: true, error: '' })
    try {
      const session = await this.createPeer(callId)
      const offer = await session.pc.createOffer()
      this.assertCurrent(session)
      await session.pc.setLocalDescription(offer)
      this.assertCurrent(session)
      this.log('SDP →', 'Local offer set. Sending the offer through Socket.IO.')
      await this.request(EVENTS.DESCRIPTION, {
        callId,
        description: {
          type: session.pc.localDescription.type,
          sdp: session.pc.localDescription.sdp
        }
      })
    } finally {
      if (requestId === this.callRequest) this.update({ callPending: false })
    }
  }

  // [5] Apply the offer, then create an answer; the caller applies the answer.
  async receiveDescription({ callId, description }) {
    if (callId !== this.state.callId || !this.state.joined) return
    const session =
      description.type === 'offer'
        ? await this.createPeer(callId)
        : this.session
    if (!session || !this.current(session)) return
    await session.pc.setRemoteDescription(description)
    this.assertCurrent(session)
    this.log('SDP ←', `Applied the remote ${description.type}.`)
    await this.flushCandidates(session)
    if (description.type === 'offer') {
      const answer = await session.pc.createAnswer()
      this.assertCurrent(session)
      await session.pc.setLocalDescription(answer)
      this.assertCurrent(session)
      await this.request(EVENTS.DESCRIPTION, {
        callId,
        description: {
          type: session.pc.localDescription.type,
          sdp: session.pc.localDescription.sdp
        }
      })
      this.log('SDP →', 'Local answer set and sent to the caller.')
    }
  }

  // [6] ICE may arrive first. Wait until the peer has the remote description.
  async receiveCandidate({ callId, candidate }) {
    if (callId !== this.state.callId || !this.state.joined) return
    const session = this.session
    if (!session?.pc.remoteDescription) {
      if (this.pendingCandidates.length >= 256)
        throw new Error('Too many pending ICE candidates.')
      this.pendingCandidates.push(candidate)
      this.log(
        'ICE ←',
        'Queued candidate until the remote description is ready.'
      )
      return
    }
    await session.pc.addIceCandidate(candidate)
    this.assertCurrent(session)
    this.log('ICE ←', 'Added a remote network candidate.')
  }

  async flushCandidates(session) {
    while (this.pendingCandidates.length) {
      this.assertCurrent(session)
      await session.pc.addIceCandidate(this.pendingCandidates.shift())
    }
  }

  toggleMicrophone() {
    const enabled = !this.state.microphoneEnabled
    this.state.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled
    })
    this.update({ microphoneEnabled: enabled })
    this.log(
      'MEDIA',
      enabled
        ? 'Microphone unmuted.'
        : 'Microphone muted (track.enabled = false).'
    )
  }

  toggleCamera() {
    const enabled = !this.state.cameraEnabled
    this.state.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled
    })
    this.update({ cameraEnabled: enabled })
    this.log(
      'MEDIA',
      enabled ? 'Camera enabled.' : 'Camera disabled (track.enabled = false).'
    )
  }

  async hangUp() {
    const callId = this.state.callId
    this.closePeer()
    if (this.state.joined && this.state.peerPresent && callId)
      await this.request(EVENTS.END_CALL, { callId })
  }

  // [7] Hang up closes media transport, but keeps capture and room membership.
  closePeer() {
    this.callRequest += 1
    this.revision += 1
    const previous = this.session
    this.session = null
    this.pendingCandidates = []
    if (previous) {
      previous.pc.ontrack = null
      previous.pc.onicecandidate = null
      previous.pc.onconnectionstatechange = null
      previous.pc.oniceconnectionstatechange = null
      previous.pc.onsignalingstatechange = null
      previous.pc.close()
      previous.remoteStream.getTracks().forEach((track) => track.stop())
    }
    this.update({
      remoteStream: null,
      hasPeerConnection: false,
      callPending: false,
      connectionState: 'not created',
      iceState: 'not created',
      signalingState: 'not created',
      phase: this.state.joined ? 'waiting' : 'idle'
    })
  }

  // [8] Leave also stops capture and invalidates permission/join continuations.
  leaveRoom() {
    this.mediaRequest += 1
    this.joinRequest += 1
    this.socket.emit(EVENTS.LEAVE, {})
    this.closePeer()
    this.state.localStream?.getTracks().forEach((track) => track.stop())
    this.update({ ...initialState, socketConnected: this.socket.connected })
    this.log('ROOM', 'Left the room. Camera and microphone tracks stopped.')
  }

  async debugSnapshot() {
    const pc = this.session?.pc
    const media = []
    if (pc && pc.connectionState !== 'closed') {
      const report = await pc.getStats()
      report.forEach((entry) => {
        if (entry.type === 'inbound-rtp')
          media.push({
            kind: entry.kind,
            bytesReceived: entry.bytesReceived,
            packetsReceived: entry.packetsReceived,
            framesDecoded: entry.framesDecoded,
            totalAudioEnergy: entry.totalAudioEnergy
          })
      })
    }
    return {
      role: this.state.role,
      joined: this.state.joined,
      callId: this.state.callId,
      connectionState: this.state.connectionState,
      localTracks:
        this.state.localStream
          ?.getTracks()
          .map((track) => ({
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState
          })) || [],
      inbound: media
    }
  }

  dispose() {
    if (this.disposed) return
    this.leaveRoom()
    this.disposed = true
    this.socket.removeAllListeners()
    this.socket.disconnect()
  }
}
