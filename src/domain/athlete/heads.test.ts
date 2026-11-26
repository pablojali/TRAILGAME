import { describe, expect, it } from 'vitest'
import { buildHeadCatalog, getHead, HEADS, headFile } from './heads'

describe('head catalog', () => {
  it('keeps the saved head ids, levels and labels', () => {
    expect(HEADS.map((h) => `${h.sex} ${h.id} lvl${h.level} ${h.label} tones ${Object.keys(h.files)}`)).toEqual([
      'male head-l1-01 lvl1 Hairstyle 1 tones 1,2,3,4',
      'female head-l1-01 lvl1 Hairstyle 1 tones 1,2,3,4',
      'female head-l2-01 lvl2 Hairstyle 2 tones 1,2,3,4',
      'male head-l2-01 lvl2 Hairstyle 2 tones 1,2,3,4',
      'female head-l3-01 lvl3 Hairstyle 3 tones 1,2,3,4',
      'male head-l3-01 lvl3 Hairstyle 3 tones 1,2,3,4',
      'female head-l5-01 lvl5 Hairstyle 4 tones 1,2,3,4',
      'male head-l5-01 lvl5 Hairstyle 4 tones 1,2,3,4',
      'female head-l8-01 lvl8 Hairstyle 5 tones 1,2,3,4',
      'male head-l8-01 lvl8 Hairstyle 5 tones 1,2,3,4',
    ])
    expect(headFile('female', 'head-l1-01', 2)).toBe('lvl1_women_head_01_tone2')
    expect(headFile('female', 'head-l1-01', 4)).toBe('lvl1_women_head_01_tone4')
    expect(headFile('female', 'head-l1-02', 1)).toBeUndefined()
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

describe('art named without a design number (owner decision, 26 November 2026)', () => {
  it('reads a head with no design number as design 01, so saved heads keep their id', () => {
    const [head] = buildHeadCatalog(['lvl1_men_head_tone1', 'lvl1_men_head_tone3'])
    expect(head).toMatchObject({ id: 'head-l1-01', sex: 'male', level: 1, files: { 1: 'lvl1_men_head_tone1', 3: 'lvl1_men_head_tone3' } })
  })

  it('reads a shirt with no design number as design 01', async () => {
    const { buildShirtCatalog } = await import('./shirts')
    expect(buildShirtCatalog([{ file: 'lvl3_men_shirt', label: 'New shirt' }])).toMatchObject([{ id: 'shirt-l3-01', sex: 'male', level: 3, file: 'lvl3_men_shirt' }])
  })
})
