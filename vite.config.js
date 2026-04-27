import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wsRelayPlugin from './vite-ws-relay-plugin.js'
import pipelinePlugin from './vite-pipeline-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wsRelayPlugin(),
    pipelinePlugin(),
  ],
  server: {
    host: true, // expose on LAN (0.0.0.0)
    // Vite 7 blocks unknown Host headers as a DNS-rebinding defence.
    // Allow:
    //  - any *.trycloudflare.com subdomain (npm run dev:tunnel rotates
    //    the hostname every restart, so a wildcard is the only way to
    //    avoid editing this file each time);
    //  - any *.ngrok-free.app / *.ngrok.io / *.ngrok.app for the
    //    common alternative tunnel.
    allowedHosts: [
      '.trycloudflare.com',
      '.ngrok-free.app',
      '.ngrok.io',
      '.ngrok.app',
    ],
  },
})
