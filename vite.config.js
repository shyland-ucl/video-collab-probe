import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wsRelayPlugin from './vite-ws-relay-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wsRelayPlugin(),
  ],
  server: {
    host: true, // expose on LAN (0.0.0.0)
  },
})
