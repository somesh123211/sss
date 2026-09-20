import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

export default defineConfig(({ mode }) => ({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: mode !== 'production',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-three':    ['three'],
          'vendor-maplibre': ['maplibre-gl'],
          'vendor-deck':     ['deck.gl', '@deck.gl/react', '@deck.gl/layers'],
          'vendor-charts':   ['recharts'],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'deck.gl',
      '@deck.gl/react',
      '@deck.gl/layers',
      '@deck.gl/aggregation-layers',
      '@deck.gl/geo-layers',
    ],
  },
}))
