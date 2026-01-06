//vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
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