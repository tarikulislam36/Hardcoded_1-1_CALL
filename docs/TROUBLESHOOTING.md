# Troubleshooting the demo

Work from top to bottom: page → camera → signaling → room → SDP → ICE → media playback.

## Page does not open / port is already in use

Stop the old Vite command with Ctrl+C. This project's `npm run dev` starts Vite on 5173 and signaling on 3001. Both ports must be free. Use `ss -ltnp` to identify a process listening on those ports before deciding to stop it; do not kill unrelated Node processes.

The Vite script uses strictPort so it will report a conflict instead of silently switching to 5174.

## npm / Node errors

Check `node --version`. Use Node 24 or Node 22.13+ within 22.x; the project was verified with Node 24.19.0. Run `npm install` after copying the project. The lockfile belongs beside package.json. Do not combine the demo source with an unrelated old package.json.

If a root-owned old node_modules causes permission errors, fix ownership of your own project directory rather than running the development server with sudo.

## Signaling says disconnected

1. Run `npm run dev`, not only `npm run client`.
2. Read the SIGNAL terminal output for startup/port errors.
3. Open http://localhost:5173/api/health. It should return JSON with `ok: true`.
4. Check that vite.config.js proxies `/api` and `/socket.io` to port 3001.
5. If you changed the backend PORT, change the proxy target too.

The default server binds to 127.0.0.1. The Vite proxy connects to it on the same machine. Do not replace the backend target with a browser client's localhost address when using a tunnel.

## Camera permission was denied

Use the browser's site permissions to allow camera and microphone for the exact origin. Reload if needed, then click Start camera. We display the browser's NotAllowedError as a readable message.

Make sure the page is localhost or trusted HTTPS. A desktop's HTTP LAN IP is not a secure localhost context for a visiting phone. Do not disable browser security to hide the problem.

## No camera / device is busy

The first lesson requests both audio and video. Check that your OS/browser can see both devices. Another application or a hardware limitation may prevent two tabs opening the camera. Test with another device after setting up trusted HTTPS, or close the competing capture application.

Start with a Chromium-based desktop browser. The included automated tests use synthetic devices; they do not prove every physical webcam driver can share capture between tabs.

## Join button is disabled

The browser must have a successful local capture stream and an active signaling connection. Start camera first. Accept both permission prompts if the browser presents them separately.

## Start call button is disabled

Both participants must have joined. Only the tab marked caller can start. The callee answers automatically. If a peer connection already exists, use Hang up before starting another call.

## Third tab shows room full

This is expected. Leave from one of the first two tabs, or close that tab and wait for Socket.IO to report its disconnection. Then join from the third tab again.

A member who remains after the original caller leaves is promoted to caller.

## Local video works, remote video does not

Use the learning log and state fields:

| Observation | Check next |
| --- | --- |
| No local offer message | Caller role, second member joined, Start call clicked |
| Offer sent but no remote offer/answer | Signaling forwarding and browser/server errors |
| SDP signaling is stable but ICE/connection stays new | Candidate gathering and network accessibility |
| ICE reaches checking/failed | Candidate paths, TURN settings, firewall and connectivity |
| Connected and remote track exists but picture does not move | Playback, decoded frames, remote camera state |
| Local or remote track is ended | Start a new capture / new call as appropriate |

A remote track event can occur before packets are decoded. In development, use the console command `await window.__rtcDemo.snapshot()` to inspect packet and decoded-frame counters. This helper is not included in production builds.

Do not paste arbitrary SDP manipulation or random public TURN credentials into the project as a first response. Confirm which stage fails.

## Video appears but no sound

The local preview is intentionally muted. It prevents hearing yourself. Inspect the remote video element and microphone toggle instead.

If the browser blocks playback, click Play remote audio/video when offered. Check OS output volume/device and the remote microphone state. Use headphones to avoid feedback. A packet counter proves receipt, not audible output at your speakers.

## Different networks do not connect

Configure a working TURN service in `.env`, then restart the backend. A STUN server alone cannot guarantee connectivity for every network pair. To deliberately verify relaying, set `ICE_TRANSPORT_POLICY=relay`. This setting will fail without a working TURN service; that is expected.

The API endpoint supplies browser-facing TURN credentials, not a server authentication secret. Never put a long-term shared TURN secret in frontend code.

## I refreshed / lost signaling

This small demo closes peer resources after signaling disconnects. Socket.IO may reconnect its transport, but you must Join room again. If the page reloaded, Start camera first too. The remaining member stays in the room and receives an updated role.

Automatic reconnection with media recovery is a later learning milestone. It is intentionally not claimed here.

## Hang up versus Leave

Hang up ends the call but retains capture for the preview and next call. Leave / stop camera also stops local tracks. If the camera is still active after Hang up, that matches the documented behavior.

## Changes to server files are not appearing

`npm run dev` uses the non-watching server command for a predictable two-process startup. Stop and restart it after backend changes. Alternatively use two terminals: `npm run server:watch` and `npm run client`.

## Build/preview works but signaling is missing

`npm run build` produces frontend assets only. Run `npm run server` alongside `npm run preview` for a local build check. Vite preview uses the configured proxy. Real hosting needs the Node process and `/socket.io`/`/api` reverse-proxy routes as well as HTTPS.

## Browser tests fail

Stop the running manual demo first; test:e2e starts its own clean server. Install the test browser with `npx playwright install chromium`. If your machine lacks Linux browser libraries, follow Playwright's installation guidance.

The test-only browser configuration uses fake media devices and permits loopback ICE candidates. That does not mock RTCPeerConnection: offer/answer exchange, ICE, media transport and video decoding still run in Chromium. Do not copy test flags into normal browser instructions.
