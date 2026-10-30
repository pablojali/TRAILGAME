import { describe, expect, it } from 'vitest'
import {
  appearanceForSex,
  appearanceUnlocks,
  isAppearanceUnlocked,
  outfitTint,
  outfitUnlockLevel,
  TSHIRT_COLORS,
  bodyId,
  defaultAppearance,
  hairStyleLabel,
  hairStyles,
  hairUnlockLevel,
  OUTFITS,
  parseAppearance,
  SKIN_TONES,
} from './appearance'

describe('appearance', () => {
  it('offers one body per skin tone (3 women, 4 men), the basic head, two tops and the T-shirt colours', () => {
    expect(SKIN_TONES.female).toEqual(['tone-1', 'tone-2', 'tone-3'])
    expect(SKIN_TONES.male).toEqual(['tone-1', 'tone-2', 'tone-3', 'tone-4'])
    for (const sex of ['female', 'male'] as const) {
      for (const skin of SKIN_TONES[sex]) expect(hairStyles(sex, skin)[0]).toBe('natural')
    }
    expect(hairStyleLabel('female', 'natural')).toBe('Basic')
    expect(OUTFITS.slice(0, 2)).toEqual(['none', 'white-tshirt'])
    expect(OUTFITS).toHaveLength(2 + TSHIRT_COLORS.length)
  })

  it('unlocks one T-shirt colour per level from Level 2', () => {
    expect(TSHIRT_COLORS.map((color) => color.level)).toEqual(TSHIRT_COLORS.map((_, i) => i + 2))
    expect(outfitUnlockLevel('none')).toBe(1)
    expect(outfitUnlockLevel('white-tshirt')).toBe(1)
    expect(outfitUnlockLevel('tshirt-red')).toBe(2)
    expect(outfitUnlockLevel('tshirt-black')).toBe(13)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-orange' }, 2, 'male')).toBe(false)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-orange' }, 3, 'male')).toBe(true)
    // Men tone 4 has no head art yet: only outfits unlock.
    expect(appearanceUnlocks(1, 3, 'male', 'tone-4')).toEqual(['Red T-shirt', 'Orange T-shirt'])
    expect(appearanceUnlocks(13, 20, 'male', 'tone-4')).toEqual([])
    expect(outfitTint('tshirt-red')).toBe('#d6453a')
    expect(outfitTint('white-tshirt')).toBeNull()
  })

  it('keeps a saved T-shirt colour', () => {
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-navy' }, 'male').outfit).toBe('tshirt-navy')
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-gold' }, 'male').outfit).toBe('none')
  })

  it('defaults to the basic head, tone 2, no shirt', () => {
    expect(defaultAppearance()).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
    expect(defaultAppearance()).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
  })

  it('names the body artwork by sex and tone', () => {
    expect(bodyId('female', 'tone-3')).toBe('female-3')
    expect(bodyId('male', 'tone-4')).toBe('male-4')
  })

  it('offers the current head art: one Level 1 head for women, in every tone (owner art, 30 October 2026)', () => {
    for (const skin of SKIN_TONES.female) expect(hairStyles('female', skin)).toEqual(['natural', 'head-l1-01'])
    for (const skin of SKIN_TONES.male) expect(hairStyles('male', skin)).toEqual(['natural'])
    expect(hairStyleLabel('female', 'head-l1-01')).toBe('Hairstyle 1')
    expect(hairUnlockLevel('female', 'head-l1-01')).toBe(1)
    expect(isAppearanceUnlocked({ hair: 'head-l1-01', skin: 'tone-1', outfit: 'none' }, 1, 'female')).toBe(true)
    expect(appearanceUnlocks(1, 2, 'female', 'tone-2')).toEqual(['Red T-shirt'])
  })

  it('loads saves with heads that no longer exist as the basic head', () => {
    // Heads removed by the owner on 30 October 2026, possibly chosen in existing careers.
    for (const hair of ['head-l1-03', 'head-l1-05', 'head-l2-01', 'head-l2-02', 'head-l2-03']) {
      expect(parseAppearance({ hair, skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('natural')
    }
    expect(parseAppearance({ hair: 'head-l1-01', skin: 'tone-2', outfit: 'none' }, 'male').hair).toBe('natural')
    expect(parseAppearance({ hair: 'head-l1-01', skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('head-l1-01')
    expect(appearanceForSex({ hair: 'head-l1-01', skin: 'tone-3', outfit: 'none' }, 'male').hair).toBe('natural')
  })

  it('keeps a valid tone when the sex changes', () => {
    expect(appearanceForSex({ hair: 'natural', skin: 'tone-4', outfit: 'white-tshirt' }, 'female')).toEqual({
      hair: 'natural',
      skin: 'tone-3',
      outfit: 'white-tshirt',
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
    expect(parseAppearance({ hair: 'natural', skin: 'tone-4', outfit: 'white-tshirt' }, 'male')).toEqual({
      hair: 'natural',
      skin: 'tone-4',
      outfit: 'white-tshirt',
    })
    expect(parseAppearance(undefined, 'male')).toEqual(defaultAppearance())
    expect(parseAppearance({ skin: 'blue' }, 'female')).toEqual(defaultAppearance())
  })

  it('has no shoes: shoes are equipment, not appearance', () => {
    expect(Object.keys(defaultAppearance()).sort()).toEqual(['hair', 'outfit', 'skin'])
  })
})
