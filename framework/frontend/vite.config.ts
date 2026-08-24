import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In Docker: VITE_API_TARGET=http://backend:8000 (set in docker-compose.yml)
// Local dev:  falls back to http://localhost:8000
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          // Rewrite absolute Location headers on redirects so the browser
          // follows them back through the Vite proxy instead of hitting the
          // backend host directly (which is unreachable from the browser in Docker).
          proxy.on('proxyRes', (proxyRes) => {
            const location = proxyRes.headers['location']
            if (typeof location === 'string' && location.startsWith(API_TARGET)) {
              proxyRes.headers['location'] = location.slice(API_TARGET.length)
            }
          })
        },
      },
    },
  },
})
