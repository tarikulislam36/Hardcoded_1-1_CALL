import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The browser uses one origin; Vite forwards only signaling and configuration to Node.
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001' }
    }
  }
})
