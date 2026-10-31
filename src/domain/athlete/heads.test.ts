import { describe, expect, it } from 'vitest'
import { buildHeadCatalog, getHead, HEADS, headFile } from './heads'

describe('head catalog', () => {
  it('keeps the saved head ids, levels and labels', () => {
    expect(HEADS.map((h) => `${h.sex} ${h.id} lvl${h.level} ${h.label} tones ${Object.keys(h.files)}`)).toEqual([
      'male head-l1-01 lvl1 Hairstyle 1 tones 1,2,3,4',
      'female head-l1-01 lvl1 Hairstyle 1 tones 1,2,3',
      'female head-l1-02 lvl1 Hairstyle 2 tones 1,2',
      'female head-l5-01 lvl5 Hairstyle 3 tones 3',
    ])
    expect(headFile('female', 'head-l1-01', 2)).toBe('lvl1_women_head_01_tone2')
    expect(headFile('female', 'head-l1-01', 4)).toBeUndefined()
    expect(headFile('male', 'head-l1-01', 4)).toBe('lvl1_men_head_01_tone4')
    expect(getHead('male', 'head-l1-02')).toBeUndefined()
  })

  it('builds labels, levels and tones from file names', () => {
    const heads = buildHeadCatalog([
      'lvl2_women_head_02_tone3',
      'lvl1_men_head_01_tone1',
      'lvl1_women_head_04_tone2',
      'lvl1_women_head_04_tone3',
      'not_a_head',
    ])
    expect(heads.map((h) => `${h.sex} ${h.id} lvl${h.level} ${h.label} tones ${Object.keys(h.files)}`)).toEqual([
      'male head-l1-01 lvl1 Hairstyle 1 tones 1',
      'female head-l1-04 lvl1 Hairstyle 1 tones 2,3',
      'female head-l2-02 lvl2 Hairstyle 2 tones 3',
    ])
  })
})
