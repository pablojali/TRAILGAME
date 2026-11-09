import { describe, expect, it } from 'vitest'
import { clipPath, isMp4, racePhotoPath, thumbnailFile } from './media'

describe('Studio uploads', () => {
  it('names files the way the game looks for them', () => {
    expect(racePhotoPath('RACE-005')).toBe('assets/ui/races/RACE-005.jpg')
    expect(clipPath('RACE-005', 2, 'mp4')).toBe('assets/race/clips/RACE-005/segment-2.mp4')
    expect(clipPath('RACE-005', 2, 'jpg')).toBe('assets/race/clips/RACE-005/segment-2.jpg')
    expect(thumbnailFile('trail-shoes-3')).toBe('thumb_trail-shoes-3.png')
  })

  it('accepts only real MP4 videos (the checks refuse anything else)', () => {
    const mp4 = new Uint8Array(30_000)
    mp4.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])
    expect(isMp4(mp4)).toBe(true)
    expect(isMp4(mp4.subarray(0, 100))).toBe(false)
    expect(isMp4(new Uint8Array(30_000))).toBe(false)
  })
})
