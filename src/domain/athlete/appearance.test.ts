import { describe, expect, it } from 'vitest'
import {
  appearanceForSex,
  appearanceUnlocks,
  isAppearanceUnlocked,
  outfitLabel,
  outfits,
  outfitUnlockLevel,
  bodyId,
  defaultAppearance,
  hairStyleLabel,
  hairStyles,
  hairUnlockLevel,
  parseAppearance,
  SKIN_TONES,
} from './appearance'

describe('appearance', () => {
  it('offers one body per skin tone (3 women, 4 men), the basic head, and no shirt or the sex\'s shirts', () => {
    expect(SKIN_TONES.female).toEqual(['tone-1', 'tone-2', 'tone-3'])
    expect(SKIN_TONES.male).toEqual(['tone-1', 'tone-2', 'tone-3', 'tone-4'])
    for (const sex of ['female', 'male'] as const) {
      for (const skin of SKIN_TONES[sex]) expect(hairStyles(sex, skin)[0]).toBe('natural')
    }
    expect(hairStyleLabel('female', 'natural')).toBe('Basic')
    expect(outfits('male')).toEqual(['none', 'shirt-l1-01', 'shirt-l2-01', 'shirt-l3-01', 'shirt-l3-02'])
    expect(outfits('female')).toEqual(['none', 'shirt-l1-01', 'shirt-l2-01', 'shirt-l3-01'])
    expect(outfitLabel('male', 'none')).toBe('No shirt')
    expect(outfitLabel('male', 'shirt-l1-01')).toBe('Charcoal T-shirt')
    expect(outfitLabel('female', 'shirt-l1-01')).toBe('Blue tank top')
  })

  it('unlocks shirts at the level in their file name (owner art, 31 October 2026)', () => {
    expect(outfitUnlockLevel('male', 'none')).toBe(1)
    expect(outfitUnlockLevel('male', 'shirt-l1-01')).toBe(1)
    expect(outfitUnlockLevel('male', 'shirt-l2-01')).toBe(2)
    expect(outfitUnlockLevel('female', 'shirt-l3-01')).toBe(3)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'shirt-l3-02' }, 2, 'male')).toBe(false)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'shirt-l3-02' }, 3, 'male')).toBe(true)
    expect(appearanceUnlocks(1, 3, 'male', 'tone-4')).toEqual(['Navy T-shirt', 'Burgundy T-shirt', 'Green T-shirt'])
    expect(appearanceUnlocks(1, 2, 'female', 'tone-1')).toEqual(['Coral tank top'])
    expect(appearanceUnlocks(3, 20, 'male', 'tone-4')).toEqual([])
  })

  it('keeps a saved shirt of the runner\'s sex and gives retired T-shirts the level-1 shirt', () => {
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'shirt-l3-02' }, 'male').outfit).toBe('shirt-l3-02')
    // Women have no second level-3 shirt.
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'shirt-l3-02' }, 'female').outfit).toBe('none')
    // The white and dyed T-shirts were replaced by the owner's shirts (31 October 2026).
    for (const outfit of ['white-tshirt', 'tshirt-red', 'tshirt-black']) {
      expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit }, 'male').outfit).toBe('shirt-l1-01')
      expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit }, 'female').outfit).toBe('shirt-l1-01')
    }
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'cape' }, 'male').outfit).toBe('none')
  })

  it('defaults to the basic head, tone 2, no shirt', () => {
    expect(defaultAppearance()).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
    expect(defaultAppearance()).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
  })

  it('names the body artwork by sex and tone', () => {
    expect(bodyId('female', 'tone-3')).toBe('female-3')
    expect(bodyId('male', 'tone-4')).toBe('male-4')
  })

  it('offers the current head art (owner art, 30 and 31 October 2026)', () => {
    expect(hairStyles('female', 'tone-1')).toEqual(['natural', 'head-l1-01', 'head-l1-02'])
    expect(hairStyles('female', 'tone-2')).toEqual(['natural', 'head-l1-01', 'head-l1-02'])
    expect(hairStyles('female', 'tone-3')).toEqual(['natural', 'head-l1-01', 'head-l5-01'])
    for (const skin of SKIN_TONES.male) expect(hairStyles('male', skin)).toEqual(['natural', 'head-l1-01'])
    expect(hairStyleLabel('female', 'head-l1-01')).toBe('Hairstyle 1')
    expect(hairStyleLabel('female', 'head-l5-01')).toBe('Hairstyle 3')
    expect(hairUnlockLevel('female', 'head-l5-01')).toBe(5)
    expect(isAppearanceUnlocked({ hair: 'head-l1-01', skin: 'tone-1', outfit: 'none' }, 1, 'female')).toBe(true)
    expect(isAppearanceUnlocked({ hair: 'head-l5-01', skin: 'tone-3', outfit: 'none' }, 4, 'female')).toBe(false)
    expect(appearanceUnlocks(4, 5, 'female', 'tone-3')).toEqual(['Hairstyle 3'])
    expect(appearanceUnlocks(4, 5, 'female', 'tone-2')).toEqual([])
  })

  it('loads saves with heads that no longer exist as the basic head', () => {
    // Heads removed by the owner on 30 October 2026, possibly chosen in existing careers.
    for (const hair of ['head-l1-03', 'head-l1-05', 'head-l2-01', 'head-l2-02', 'head-l2-03']) {
      expect(parseAppearance({ hair, skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('natural')
    }
    expect(parseAppearance({ hair: 'head-l1-02', skin: 'tone-2', outfit: 'none' }, 'male').hair).toBe('natural')
    expect(parseAppearance({ hair: 'head-l1-02', skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('head-l1-02')
    expect(appearanceForSex({ hair: 'head-l1-02', skin: 'tone-3', outfit: 'none' }, 'female').hair).toBe('natural')
  })

  it('keeps a valid tone when the sex changes', () => {
    expect(appearanceForSex({ hair: 'natural', skin: 'tone-4', outfit: 'shirt-l1-01' }, 'female')).toEqual({
      hair: 'natural',
      skin: 'tone-3',
      outfit: 'shirt-l1-01',
    })
    expect(appearanceForSex({ hair: 'natural', skin: 'tone-1', outfit: 'none' }, 'male').skin).toBe('tone-1')
  })

  it('reads older or invalid saved appearances field by field, never failing', () => {
    // Stage A placeholder values (hairstyles and the "basic" kit) no longer exist.
    expect(parseAppearance({ hair: 'ponytail', skin: 'tone-4', outfit: 'basic' }, 'female')).toEqual({
      hair: 'natural',
      skin: 'tone-3',
      outfit: 'none',
    })
    expect(parseAppearance({ hair: 'natural', skin: 'tone-4', outfit: 'shirt-l2-01' }, 'male')).toEqual({
      hair: 'natural',
      skin: 'tone-4',
      outfit: 'shirt-l2-01',
    })
    expect(parseAppearance(undefined, 'male')).toEqual(defaultAppearance())
    expect(parseAppearance({ skin: 'blue' }, 'female')).toEqual(defaultAppearance())
  })

  it('has no shoes: shoes are equipment, not appearance', () => {
    expect(Object.keys(defaultAppearance()).sort()).toEqual(['hair', 'outfit', 'skin'])
  })
})
