import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/browser-results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: [
        '--allow-loopback-in-peer-connection',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    }
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/api/health',
    timeout: 30_000,
    reuseExistingServer: false,
    // Host candidates are enough for these loopback tests. They need no public STUN service.
    env: { STUN_URLS: '', TURN_URLS: '', ICE_TRANSPORT_POLICY: 'all' }
  }
})
