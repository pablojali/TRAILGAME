import { describe, expect, it } from 'vitest'
import {
  defaultAppearance,
  hairForSex,
  HAIR_STYLE_LABELS,
  HAIR_STYLES,
  parseAppearance,
  SKIN_TONES,
} from './appearance'

describe('appearance', () => {
  it('offers three hairstyles per sex and four skin tones, all labelled', () => {
    expect(HAIR_STYLES.female).toHaveLength(3)
    expect(HAIR_STYLES.male).toHaveLength(3)
    expect(SKIN_TONES).toHaveLength(4)
    for (const hair of [...HAIR_STYLES.female, ...HAIR_STYLES.male]) expect(HAIR_STYLE_LABELS[hair]).toBeTruthy()
  })

  it('defaults to the first hairstyle for the sex, a mid skin tone and the basic kit', () => {
    expect(defaultAppearance('female')).toEqual({ hair: 'ponytail', skin: 'tone-2', outfit: 'basic' })
    expect(defaultAppearance('male')).toEqual({ hair: 'short', skin: 'tone-2', outfit: 'basic' })
  })

  it('keeps the hairstyle position when the sex changes', () => {
    expect(hairForSex('braid', 'male')).toBe('curly')
    expect(hairForSex('curly', 'female')).toBe('braid')
    expect(hairForSex('bob', 'female')).toBe('bob')
  })

  it('reads a saved appearance field by field, falling back to the defaults', () => {
    expect(parseAppearance({ hair: 'buzz', skin: 'tone-4', outfit: 'basic' }, 'male')).toEqual({
      hair: 'buzz',
      skin: 'tone-4',
      outfit: 'basic',
    })
    expect(parseAppearance(undefined, 'male')).toEqual(defaultAppearance('male'))
    expect(parseAppearance({ hair: 'buzz', skin: 'tone-9' }, 'female')).toEqual({
      hair: 'ponytail',
      skin: 'tone-2',
      outfit: 'basic',
    })
  })

  it('has no shoes: shoes are equipment, not appearance', () => {
    expect(Object.keys(defaultAppearance('female')).sort()).toEqual(['hair', 'outfit', 'skin'])
  })
})
