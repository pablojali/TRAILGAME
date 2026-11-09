import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Trail Studio (owner request, 9 November 2026): the designer's editor for the game's tables, a
 * separate site (Cloudflare Pages project trailgame-studio: build `npm run build:studio`, output
 * `dist-studio`). See docs/STUDIO.md.
 */
export default defineConfig({
  root: 'studio',
  publicDir: false,
  plugins: [react()],
  build: { outDir: '../dist-studio', emptyOutDir: true, chunkSizeWarningLimit: 1000 },
  server: { fs: { allow: ['..'] } },
})
