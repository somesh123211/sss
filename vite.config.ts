import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  optimizeDeps: {
    include: [
      'deck.gl',
      '@deck.gl/react',
      '@deck.gl/layers',
      '@deck.gl/aggregation-layers',
      '@deck.gl/geo-layers',
      // react-map-gl is subpath-only in v8 — don't include root here
    ],
  },
})
