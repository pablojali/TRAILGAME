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
  HAIR_STYLES,
  OUTFITS,
  parseAppearance,
  SKIN_TONES,
} from './appearance'

describe('appearance', () => {
  it('offers one body per skin tone (3 women, 4 men), the drawn hair, two tops and the T-shirt colours', () => {
    expect(SKIN_TONES.female).toEqual(['tone-1', 'tone-2', 'tone-3'])
    expect(SKIN_TONES.male).toEqual(['tone-1', 'tone-2', 'tone-3', 'tone-4'])
    expect(HAIR_STYLES).toEqual({ female: ['natural'], male: ['natural'] })
    expect(OUTFITS.slice(0, 2)).toEqual(['none', 'white-tshirt'])
    expect(OUTFITS).toHaveLength(2 + TSHIRT_COLORS.length)
  })

  it('unlocks one T-shirt colour per level from Level 2', () => {
    expect(TSHIRT_COLORS.map((color) => color.level)).toEqual(TSHIRT_COLORS.map((_, i) => i + 2))
    expect(outfitUnlockLevel('none')).toBe(1)
    expect(outfitUnlockLevel('white-tshirt')).toBe(1)
    expect(outfitUnlockLevel('tshirt-red')).toBe(2)
    expect(outfitUnlockLevel('tshirt-black')).toBe(13)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-orange' }, 2)).toBe(false)
    expect(isAppearanceUnlocked({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-orange' }, 3)).toBe(true)
    expect(appearanceUnlocks(1, 3)).toEqual(['Red T-shirt', 'Orange T-shirt'])
    expect(appearanceUnlocks(13, 20)).toEqual([])
    expect(outfitTint('tshirt-red')).toBe('#d6453a')
    expect(outfitTint('white-tshirt')).toBeNull()
  })

  it('keeps a saved T-shirt colour', () => {
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-navy' }, 'male').outfit).toBe('tshirt-navy')
    expect(parseAppearance({ hair: 'natural', skin: 'tone-1', outfit: 'tshirt-gold' }, 'male').outfit).toBe('none')
  })

  it('defaults to the runner as drawn: tone 2, drawn hair, no shirt', () => {
    expect(defaultAppearance('female')).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
    expect(defaultAppearance('male')).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
  })

  it('names the body artwork by sex and tone', () => {
    expect(bodyId('female', 'tone-3')).toBe('female-3')
    expect(bodyId('male', 'tone-4')).toBe('male-4')
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
    expect(parseAppearance(undefined, 'male')).toEqual(defaultAppearance('male'))
    expect(parseAppearance({ skin: 'blue' }, 'female')).toEqual(defaultAppearance('female'))
  })

  it('has no shoes: shoes are equipment, not appearance', () => {
    expect(Object.keys(defaultAppearance('female')).sort()).toEqual(['hair', 'outfit', 'skin'])
  })
})
