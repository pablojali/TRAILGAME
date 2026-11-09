/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

/**
 * The announcements table is also published as /announcements.csv, so an open game reads new
 * messages without a reload (src/domain/announcements/announcements.ts).
 */
function publishAnnouncements() {
  return {
    name: 'publish-announcements',
    generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): string }) {
      this.emitFile({ type: 'asset', fileName: 'announcements.csv', source: readFileSync('src/data/announcements.csv', 'utf8') })
    },
  }
}

export default defineConfig({
  plugins: [react(), publishAnnouncements()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
