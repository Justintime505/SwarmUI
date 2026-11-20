import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where the SwarmUI server runs during development. */
const SWARM = process.env.SWARM_URL || 'http://localhost:7801'

// Built output goes into SwarmUI's static web root, so SwarmUI serves it at /mobile/index.html.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    outDir: '../src/wwwroot/mobile',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/API': { target: SWARM, ws: true, changeOrigin: true },
      '/View': SWARM,
      '/ViewSpecial': SWARM,
      '/Output': SWARM,
      '/imgs': SWARM,
    },
  },
})
