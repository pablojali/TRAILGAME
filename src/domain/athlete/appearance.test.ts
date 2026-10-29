import { describe, expect, it } from 'vitest'
import {
  appearanceForSex,
  bodyId,
  defaultAppearance,
  HAIR_STYLES,
  OUTFITS,
  parseAppearance,
  SKIN_TONES,
} from './appearance'

describe('appearance', () => {
  it('offers one body per skin tone (3 women, 4 men), the drawn hair and two tops', () => {
    expect(SKIN_TONES.female).toEqual(['tone-1', 'tone-2', 'tone-3'])
    expect(SKIN_TONES.male).toEqual(['tone-1', 'tone-2', 'tone-3', 'tone-4'])
    expect(HAIR_STYLES).toEqual({ female: ['natural'], male: ['natural'] })
    expect(OUTFITS).toEqual(['none', 'white-tshirt'])
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
