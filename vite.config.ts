//vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('firebase')) {
            return 'vendor-firebase'
          }

          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }

          if (id.includes('react-router')) {
            return 'vendor-router'
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react'
          }

          if (id.includes('date-fns')) {
            return 'vendor-dates'
          }

          if (id.includes('lucide-react') || id.includes('@headlessui')) {
            return 'vendor-ui'
          }
        }
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true, // Fail if port is already in use instead of using next available port
    host: true,
    open: false,
    watch: {
      ignored: ['**/.env', '**/.env.*']
    }
  }
})
