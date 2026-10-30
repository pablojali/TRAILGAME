import { describe, expect, it } from 'vitest'
import { getHead, HEADS, headFile } from './heads'

describe('head catalog', () => {
  it('keeps the saved head ids, levels and labels', () => {
    expect(HEADS.map((h) => `${h.sex} ${h.id} lvl${h.level} ${h.label} tones ${Object.keys(h.files)}`)).toEqual([
      'male head-l1-01 lvl1 Hairstyle 1 tones 1,2,3',
      'female head-l1-03 lvl1 Hairstyle 1 tones 2,3',
      'female head-l1-05 lvl1 Hairstyle 2 tones 3',
      'female head-l2-01 lvl2 Hairstyle 3 tones 2,3',
      'female head-l2-02 lvl2 Hairstyle 4 tones 2,3',
      'female head-l2-03 lvl2 Hairstyle 5 tones 3',
    ])
    expect(headFile('female', 'head-l2-01', 3)).toBe('lvl2_women_head_01_tone3')
    expect(headFile('female', 'head-l2-01', 1)).toBeUndefined()
    expect(getHead('male', 'head-l2-01')).toBeUndefined()
  })
})
