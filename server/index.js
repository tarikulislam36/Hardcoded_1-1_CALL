import { createSignalingServer } from './createServer.js'

// Node loads .env through the --env-file-if-exists flag in package.json.
const splitUrls = (value) =>
  (value || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
const iceServers = []
const stunUrls = splitUrls(
  process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302'
)
if (stunUrls.length) iceServers.push({ urls: stunUrls })
const turnUrls = splitUrls(process.env.TURN_URLS)
if (turnUrls.length) {
  iceServers.push({
    urls: turnUrls,
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || ''
  })
}

const demo = createSignalingServer({
  iceServers,
  iceTransportPolicy:
    process.env.ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all'
})
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
demo.httpServer.on('error', (error) => {
  console.error(`Could not start signaling server: ${error.message}`)
  process.exitCode = 1
})
demo.httpServer.listen(port, host, () =>
  console.log(`Signaling server: http://${host}:${port}`)
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await demo.close()
    process.exit(0)
  })
}
