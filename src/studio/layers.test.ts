import { describe, expect, it } from 'vitest'
import { layerColumn, layerLabel, layerSources, layerStem } from './uploads'

describe('runner layer uploads (Studio › Equipment)', () => {
  it('keeps the name the item already has, with or without folder and extension', () => {
    expect(layerStem('poles-2', 'poles', '2', 'accessories/lvl2_poles_01')).toBe('lvl2_poles_01')
    expect(layerStem('poles-2', 'poles', '2', 'accessories/lvl2_poles_01.webp')).toBe('lvl2_poles_01')
    expect(layerStem('pack-x', 'pack', '1', 'accessories/lvl1_{sex}_back_01.webp')).toBe('lvl1_{sex}_back_01')
  })

  it('names a new layer after the level, type and item', () => {
    expect(layerStem('poles-3', 'poles', '3', '')).toBe('lvl3_poles_poles-3')
    expect(layerStem('Gel Max', 'gel', '', '')).toBe('lvl1_gel_gel_max')
  })

  it('asks one PNG, or one per sex, in the folder the art script reads', () => {
    expect(layerSources('lvl2_poles_01')).toEqual([{ sex: null, tone: null, path: 'assets/runner/accesories/lvl2_poles_01.png' }])
    expect(layerSources('lvl1_{sex}_back_01')).toEqual([
      { sex: 'men', tone: null, path: 'assets/runner/accesories/lvl1_men_back_01.png' },
      { sex: 'women', tone: null, path: 'assets/runner/accesories/lvl1_women_back_01.png' },
    ])
    // A cap with its face: one per sex and skin tone, eight in all.
    const cap = layerSources(layerStem('cap-red', 'cap', '4', ''))
    expect(cap).toHaveLength(8)
    expect(cap[0]).toEqual({ sex: 'men', tone: 1, path: 'assets/runner/accesories/lvl4_men_cap_cap-red_tone1.png' })
    expect(cap[7]!.path).toBe('assets/runner/accesories/lvl4_women_cap_cap-red_tone4.png')
    expect(layerLabel('women', 3)).toBe('Upload (women, tone 3)')
    expect(layerStem('watch-1', 'watch', '5', '')).toBe('lvl5_{sex}_watch_watch-1')
    expect(layerColumn('lvl2_poles_01')).toBe('accessories/lvl2_poles_01.webp')
  })
})
