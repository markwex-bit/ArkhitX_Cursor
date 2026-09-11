import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3008,
    // Native fs events from a Windows-host bind mount don't reliably reach
    // chokidar inside the Linux container, so HMR silently never fires
    // without polling. Only matters for docker-compose dev; harmless
    // elsewhere.
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8008',
        changeOrigin: true,
      },
    },
  },
})
