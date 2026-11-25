import { describe, expect, it } from 'vitest'
import { backViewPath, BODY_FRAME, DECOR_SLOTS, replacing } from './engineArt'

describe('Trail Studio: race engine art', () => {
  it('sends heads and shirts named …_back to the engine, and leaves the others for the avatar', () => {
    expect(backViewPath('lvl1_men_head_01_tone2_back.png')).toBe('assets/race/back-view/runner/heads/lvl1_men_head_01_tone2.png')
    expect(backViewPath('lvl3_women_shirt_02_back.png')).toBe('assets/race/back-view/runner/clothing/lvl3_women_shirt_02.png')
    expect(backViewPath('lvl1_men_shirt_01_back_f2.png')).toBe('assets/race/back-view/runner/clothing/lvl1_men_shirt_01_f2.png')
    expect(backViewPath('lvl1_men_head_01_tone2.png')).toBeNull()
    expect(backViewPath('lvl1_men_shirt_01.png')).toBeNull()
  })

  it('accepts body frames named by sex, tone and frame', () => {
    expect(BODY_FRAME.test('men_body_01_tone2_f1.png')).toBe(true)
    expect(BODY_FRAME.test('women_body_01_tone4_f12.png')).toBe(true)
    expect(BODY_FRAME.test('men_body_01_tone2.png')).toBe(false)
    expect(BODY_FRAME.test('men_body_01_tone5_f1.png')).toBe(false)
    expect(DECOR_SLOTS).toHaveLength(12)
  })

  it('a new picture deletes the other format of the same name, which the engine would prefer', () => {
    const existing = [
      { name: 'men_body_01_tone2_f1.webp', path: 'assets/race/back-view/runner/bodies/men_body_01_tone2_f1.webp', url: '' },
      { name: 'men_body_01_tone2_f2.webp', path: 'assets/race/back-view/runner/bodies/men_body_01_tone2_f2.webp', url: '' },
    ]
    expect(Object.keys(replacing('assets/race/back-view/runner/bodies/men_body_01_tone2_f1.png', existing))).toEqual([
      'assets/race/back-view/runner/bodies/men_body_01_tone2_f1.webp',
    ])
    expect(replacing('assets/race/back-view/runner/bodies/men_body_01_tone3_f1.png', existing)).toEqual({})
  })
})
