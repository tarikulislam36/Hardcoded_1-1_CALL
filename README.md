# Hardcoded 1-to-1 WebRTC call — React JavaScript learning demo

A complete small project based on **create-vite 9.3.1**, **React JavaScript**, **ESLint**, and **Vite 8.3.5**. The interface is intentionally plain so you can follow the browser APIs and signaling messages.

## What you can do

- Open a camera/microphone preview.
- Join one hardcoded room, limited to two participants.
- Start an audio/video call: first participant offers, second answers automatically.
- Mute/unmute, turn video off/on, hang up and call again without refreshing.
- Leave and release the camera/microphone.
- Watch readable SDP, ICE, room and media events in the learning log.
- Configure your own STUN/TURN servers.
- Run signaling tests and real-browser WebRTC tests.

No accounts, database, PeerJS, LiveKit, or CSS framework. The media layer uses native browser `RTCPeerConnection`.

## 1. Start the complete project

Use **Node 24** (recommended), or Node **22.13+ within the 22.x release line**. The verified runtime was Node 24.19.0. If `node --version` shows an older version, update Node before installing.

Stop the Vite process you already have running with **Ctrl+C**. This demo deliberately uses strict ports so a hidden fallback to 5174 cannot confuse the two tabs.

Extract the ZIP. It contains a folder named `Hardcoded_1-1_CALL`.

```bash
cd /path/to/Hardcoded_1-1_CALL
npm install
npm run dev
```

`npm run dev` starts **both** processes:

| Process | Address | Job |
| --- | --- | --- |
| Vite / React | http://localhost:5173 | Serves the interface |
| Node / Socket.IO | http://127.0.0.1:3001 | Relays signaling and serves ICE configuration |

Open **http://localhost:5173** in two tabs. Use the same hostname in both tabs. The Vite terminal may print `127.0.0.1`; either loopback hostname works, but do not mix origins during a test.

You do not need a `.env` file for the basic two-tab test. The message `.env not found. Continuing without it.` is informational.

### Using this in your existing Vite folder

Your folder is:

```text
/home/tarikul/Desktop/MyRepo/1-1call_Hardcoded/dev01/Hardcoded_1-1_CALL
```

Make a backup first, especially if you already changed the scaffold. Copy the demo's files into that folder, including `package.json`, `package-lock.json`, `vite.config.js`, `eslint.config.js`, `index.html`, `src`, `server`, `shared`, `tests`, `docs`, and the dotfiles. Then:

```bash
cd /home/tarikul/Desktop/MyRepo/1-1call_Hardcoded/dev01/Hardcoded_1-1_CALL
npm install
npm run dev
```

Your old `npm run dev` only started Vite. The supplied package script starts signaling too. Do not keep the old package/config files while copying only `App.jsx`.

The included lockfile records the tested dependencies. In a fresh extracted folder, `npm ci` is also available for an exact install.

## 2. Make your first call

Use headphones or lower your speakers to avoid acoustic feedback between two tabs.

1. **Tab A:** click **Start camera** and allow both camera and microphone. Your local preview appears.
2. **Tab A:** click **Join room**. Its role is **caller**. It waits for a second participant.
3. **Tab B:** click **Start camera**, allow permission, and click **Join room**. Its role is **callee**.
4. **Tab A:** click **Start call**. Tab B answers automatically.
5. Both tabs should show peer connection **connected** and remote video.
6. Try **Mute microphone**, **Turn camera off**, then turn them back on.
7. Click **Hang up**. The peer connections close, but both people stay in the room with their previews.
8. The caller can click **Start call** again.
9. Click **Leave / stop camera** to leave the room and stop capture. To join again, start the camera again first.

A third participant gets a clear room-full message. If the first participant leaves, the remaining participant becomes the new caller.

## 3. Read the explanation in this order

1. [Learning guide](docs/LEARNING_GUIDE.md): concepts, architecture, numbered code walkthrough, and exercises.
2. `shared/protocol.js`: event names and the hardcoded room.
3. `server/createServer.js`: room membership and forwarding.
4. `src/rtc/CallController.js`: capture, SDP, ICE, media and cleanup.
5. `src/useCall.js`: React lifecycle ownership.
6. `src/App.jsx`: the small interface.
7. [Troubleshooting](docs/TROUBLESHOOTING.md) when something fails.
8. [Testing](docs/TESTING.md) for commands and the exact validation scope.

## 4. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start backend and frontend together |
| `npm run server` | Start only Node/Socket.IO |
| `npm run server:watch` | Restart backend after server edits |
| `npm run client` | Start only Vite |
| `npm run lint` | Check JavaScript/React with ESLint |
| `npm test` | Test real Socket.IO signaling connections |
| `npm run test:e2e` | Test browser calling with synthetic camera/microphone |
| `npm run build` | Build the React frontend into `dist` |
| `npm run preview` | Preview frontend build; Node signaling must also be running |

For browser tests, install the test browser once with `npx playwright install chromium`. Stop a manually running demo before `npm run test:e2e`; its configuration starts a clean server itself.

Changing frontend code triggers Vite updates. If you change server code while using the combined `npm run dev`, restart that command, or use the separate `server:watch` / `client` commands.

## 5. Why two tabs work but a phone on another network might not

Two independent requirements exist:

- **Secure page:** localhost is usable for local camera development. A phone visiting `http://192.168.x.x:5173` is not visiting its own localhost. Camera access normally requires a trusted HTTPS page.
- **Reachable media path:** STUN helps discover paths. Some networks need TURN to relay media. A public STUN entry alone does not guarantee that every pair connects.

First make the local two-tab example work. For phone testing, serve the frontend and proxied signaling through trusted HTTPS. One approach is to point an HTTPS development tunnel at Vite's port 5173 and allow that tunnel's exact hostname in Vite's `server.allowedHosts` if required. Keep the Socket.IO and `/api` paths proxied. Vite configuration has the local proxy routes; HTTPS can terminate at your tunnel/reverse proxy.

This hardcoded room has no access control, so use a temporary private learning environment. It is not a public production calling service.

## 6. Optional TURN configuration

```bash
cp .env.example .env
```

Edit `.env` with the URLs and browser credentials issued by your TURN service:

```dotenv
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:your-turn-host:3478?transport=udp,turns:your-turn-host:5349?transport=tcp
TURN_USERNAME=your-issued-username
TURN_CREDENTIAL=your-issued-credential
ICE_TRANSPORT_POLICY=all
```

Restart `npm run dev`. For a deliberate relay experiment set `ICE_TRANSPORT_POLICY=relay`; a working TURN service is then required. This demo rejects relay-only configuration without a TURN URL.

Do not put a TURN shared authentication secret in browser code. The static browser credentials in this learning setup are necessarily sent to the client; production systems should issue appropriately scoped, temporary credentials. `.env` is excluded from the archive and Git.

Default backend port is 3001. If you change `PORT`, update the matching target in `vite.config.js` as well.

## 7. Scope

This project teaches a fixed caller/callee flow. It does not implement automatic room restoration, automatic ICE restart, offer collision handling, screen sharing, recording, or native mobile background calling. If signaling disconnects, peer resources are closed; after the socket reconnects, join the room again. A transient media-only interruption may recover in the browser; a failed connection can be hung up and called again.

The tests verify real local peer connections and decoding using synthetic media, not human-audible sound or physical webcam quality. TURN paths, physical phones, Firefox and Safari require your own testing. See docs/TESTING.md.
