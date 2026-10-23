import { useEffect, useRef, useState } from 'react'
import { useCall } from './useCall.js'
import './App.css'

function VideoPanel({ stream, local = false }) {
  const video = useRef(null)
  const [playBlocked, setPlayBlocked] = useState(false)

  useEffect(() => {
    const element = video.current
    element.srcObject = stream
    let cancelled = false
    if (stream)
      element
        .play()
        .then(() => {
          if (!cancelled) setPlayBlocked(false)
        })
        .catch(() => {
          if (!cancelled) setPlayBlocked(true)
        })
    return () => {
      cancelled = true
      element.srcObject = null
    }
  }, [stream])

  async function play() {
    try {
      await video.current.play()
      setPlayBlocked(false)
    } catch {
      setPlayBlocked(true)
    }
  }

  return (
    <section className="video-panel">
      <h2>{local ? 'Your camera' : 'Remote participant'}</h2>
      <video
        ref={video}
        data-testid={local ? 'local-video' : 'remote-video'}
        autoPlay
        playsInline
        muted={local}
      />
      {!stream && (
        <p>
          {local
            ? 'Start your camera to see a preview.'
            : 'Remote video appears after the call connects.'}
        </p>
      )}
      {!local && playBlocked && (
        <button onClick={play}>Play remote audio/video</button>
      )}
    </section>
  )
}

export default function App() {
  const { state: s, logs, perform, clearLogs } = useCall()
  const logBox = useRef(null)
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [logs])
  const canCall =
    s.joined &&
    s.peerPresent &&
    s.role === 'caller' &&
    !s.hasPeerConnection &&
    !s.callPending

  return (
    <main>
      <h1>Hardcoded 1-to-1 call</h1>
      <p>
        React JavaScript + Socket.IO + browser WebRTC. One room, two
        participants.
      </p>
      <ol className="instructions">
        <li>
          Open this page in <strong>two tabs</strong>. Allow camera and
          microphone in both.
        </li>
        <li>
          Click <strong>Start camera</strong>, then <strong>Join room</strong>{' '}
          in each tab.
        </li>
        <li>
          The tab marked <strong>caller</strong> clicks{' '}
          <strong>Start call</strong>. The other answers automatically.
        </li>
      </ol>
      <section className="status" aria-label="Call status">
        <span>
          Signaling:{' '}
          <strong data-testid="socket-status">
            {s.socketConnected ? 'connected' : 'disconnected'}
          </strong>
        </span>
        <span>
          Room: <strong>{s.roomId}</strong> ({s.participantCount}/2)
        </span>
        <span>
          Your role:{' '}
          <strong data-testid="role">{s.joined ? s.role : 'not joined'}</strong>
        </span>
        <span>
          Call: <strong data-testid="call-state">{s.phase}</strong>
        </span>
        <span>
          Peer connection:{' '}
          <strong data-testid="pc-state">{s.connectionState}</strong>
        </span>
        <span>
          ICE: <strong>{s.iceState}</strong>
        </span>
        <span>
          SDP signaling: <strong>{s.signalingState}</strong>
        </span>
      </section>
      <div className="controls">
        <button
          onClick={() => perform('startCamera')}
          disabled={Boolean(s.localStream) || s.mediaPending}
        >
          {s.mediaPending ? 'Waiting for permission…' : 'Start camera'}
        </button>
        <button
          onClick={() => perform('joinRoom')}
          disabled={
            !s.socketConnected || !s.localStream || s.joined || s.joinPending
          }
        >
          {s.joinPending ? 'Joining…' : 'Join room'}
        </button>
        <button onClick={() => perform('startCall')} disabled={!canCall}>
          {s.callPending ? 'Starting…' : 'Start call'}
        </button>
        <button
          onClick={() => perform('toggleMicrophone')}
          disabled={!s.localStream}
        >
          {s.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        </button>
        <button
          onClick={() => perform('toggleCamera')}
          disabled={!s.localStream}
        >
          {s.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        </button>
        <button
          onClick={() => perform('hangUp')}
          disabled={!s.hasPeerConnection && !s.callPending}
        >
          Hang up
        </button>
        <button onClick={() => perform('leaveRoom')}>
          Leave / stop camera
        </button>
      </div>
      {s.error && (
        <p className="error" role="alert">
          {s.error}
        </p>
      )}
      {s.joined && s.role === 'callee' && !s.hasPeerConnection && (
        <p>Wait for the caller to click Start call.</p>
      )}
      <div className="videos">
        <VideoPanel stream={s.localStream} local />
        <VideoPanel stream={s.remoteStream} />
      </div>
      <p className="note">
        Local preview is muted to prevent echo. Hang up keeps your preview;
        Leave stops capture. Use headphones when testing two tabs.
      </p>
      <section className="logs">
        <div className="log-heading">
          <h2>Learning log</h2>
          <button onClick={clearLogs}>Clear log</button>
        </div>
        <pre ref={logBox} aria-label="Learning log">
          {logs.length
            ? logs
                .map((entry) => `${entry.at} [${entry.kind}] ${entry.message}`)
                .join('\n')
            : 'Events will appear here.'}
        </pre>
      </section>
      <details>
        <summary>What is being hardcoded?</summary>
        <p>
          The room name is in <code>shared/protocol.js</code>. The first
          participant is the caller, the second is the callee. There are no
          accounts, database, manual SDP boxes, or media-server SDKs. Socket.IO
          carries setup messages; the browser peer connection carries
          audio/video directly or through TURN.
        </p>
      </details>
    </main>
  )
}
