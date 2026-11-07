import { describe, expect, it } from 'vitest'

// Every clip the owner uploads, read as text: enough to check its size and its header.
const CLIPS = import.meta.glob<string>('/assets/race/clips/*/*.{mp4,webm}', { query: '?raw', import: 'default', eager: true })

describe('clip files (owner uploads)', () => {
  it('are real videos named segment-N: a rename on GitHub once left a 2-byte file instead of the video', () => {
    expect(Object.keys(CLIPS).length).toBeGreaterThan(0)
    for (const [path, content] of Object.entries(CLIPS)) {
      expect(path, path).toMatch(/\/RACE-\d{3}\/segment-\d+\.(mp4|webm)$/)
      expect(content.length, path).toBeGreaterThan(20_000)
      // An MP4 has its "ftyp" box at byte 4; a WebM starts with the EBML header.
      const ok = path.endsWith('.mp4') ? content.slice(4, 8) === 'ftyp' : content.charCodeAt(0) === 0x1a
      expect(ok, `${path} is not a playable video`).toBe(true)
    }
  })
})
