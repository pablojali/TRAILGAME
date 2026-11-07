import { describe, expect, it } from 'vitest'

describe('clip files (owner uploads)', () => {
  it('are real videos: a rename on GitHub once left a 2-byte file instead of the video', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs')
    const root = 'assets/race/clips'
    for (const race of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const file of readdirSync(`${root}/${race.name}`).filter((f) => /\.(mp4|webm)$/.test(f))) {
        const path = `${root}/${race.name}/${file}`
        expect(statSync(path).size, path).toBeGreaterThan(20_000)
        // An MP4 has an "ftyp" box near the start; a WebM starts with the EBML header.
        const head = readFileSync(path).subarray(0, 16)
        const ok = file.endsWith('.mp4') ? head.subarray(4, 8).toString('latin1') === 'ftyp' : head.readUInt32BE(0) === 0x1a45dfa3
        expect(ok, `${path} is not a playable ${file.split('.').pop()}`).toBe(true)
        expect(file, path).toMatch(/^segment-\d+\.(mp4|webm)$/)
      }
    }
  })
})
