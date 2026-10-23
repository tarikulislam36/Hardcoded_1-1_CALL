# Testing and validation

## Quick checks

```bash
npm install
npm run lint
npm run build
npm test
```

The six signaling integration tests start actual HTTP/Socket.IO servers on ephemeral loopback ports and connect real Socket.IO clients. They cover:

1. Two roles, idempotent joins and the third-member limit.
2. Offer, answer and candidate forwarding.
3. Nonmember, wrong-role and malformed-message rejection.
4. Call ID rotation and rejection of stale signaling.
5. Disconnection cleanup, role promotion and a replacement participant.
6. HTTP configuration and explicit rejection of relay-only mode without TURN.

These tests do not pretend to send video. Browser tests cover media.

## Browser tests

```bash
npx playwright install chromium
npm run test:e2e
```

Stop a manually running demo before this command. Playwright starts `npm run dev` itself and waits for the health endpoint through Vite. The tests run serially so they cannot compete for the hardcoded room.

The test browser uses synthetic microphone/camera inputs. In the main test, both peers are actual browser pages. The test waits for a connected PC, received audio bytes, decoded video frames, and a rendered remote video size. It then exercises:

- Microphone and camera track toggles.
- Two additional hang-up/re-call rounds.
- Third-tab rejection.
- Ending local capture on Leave.
- Promoting the remaining participant and connecting a replacement.
- Refreshing a participant and manually rejoining/calling again.

Two additional browser tests verify readable permission denial and release of a capture stream that resolves after Leave cancelled a pending permission operation.

The bundled configuration adds Chromium's `--allow-loopback-in-peer-connection` for isolated local test environments. It also uses the fake-device and autoplay testing flags. Those settings are only for the automated browser and do not change the application's RTC configuration.

### Use an already installed Chromium

If necessary, select an installed executable for the test runner:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium npm run test:e2e
```

Normal users can omit that environment variable after installing Playwright's browser. This build was verified with a locally available Chromium 138.0.7204.0 and Playwright 1.64.1. The download endpoint for the default bundled browser returned an invalid archive in the build environment, so an existing Chromium binary was used instead.

## What a passing test does not establish

- Human-audible speaker output.
- Physical microphone/camera quality or driver sharing.
- TURN behavior on your provider, NAT, mobile carrier, or restrictive firewall.
- Safari/Firefox interoperability.
- Native mobile background/incoming-call behavior.
- Automatic network recovery or production scale/security.

## Manual checklist

- Make a desktop two-tab call with headphones.
- Make several calls without reloading.
- Deny permission and recover by allowing it.
- Leave while permission is pending.
- Toggle the microphone and confirm the remote listener hears the change.
- Turn the camera off and confirm the remote view changes.
- Check that Leave ends this page's capture.
- Try two physical devices through trusted HTTPS.
- Add your TURN configuration and test relay-only mode on real networks.
- Stop/restart signaling, then deliberately rejoin and call again.

## Development and logs

Keep a browser console and the Node terminal visible while experimenting. The in-page log shows processing stages, not full SDP or candidate addresses. The development-only `window.__rtcDemo.snapshot()` returns a small state/media summary for inspection.

The machine-readable validation summary is in `validation.json`. Large browser runtime files, node_modules, build output, screenshots and temporary test output are not included in the downloadable source archive.
