import { describe, expect, it } from 'vitest'
import { ATHLETE_NAME_MAX_LENGTH, cleanAthleteName, isSex, SEXES } from './athlete'

describe('cleanAthleteName', () => {
  it.each([
    ['Marta', 'Marta'],
    ['  Leo  ', 'Leo'],
    ['A', 'A'],
    ['Sixteen chars ok', 'Sixteen chars ok'],
  ])('accepts %j as %j', (input, expected) => {
    expect(cleanAthleteName(input)).toBe(expected)
  })

  it.each(['', '   ', 'Seventeen chars!!'])('rejects %j', (input) => {
    expect(cleanAthleteName(input)).toBeNull()
  })

  it('allows at most 16 characters', () => {
    expect(ATHLETE_NAME_MAX_LENGTH).toBe(16)
    expect(cleanAthleteName('x'.repeat(16))).toBe('x'.repeat(16))
    expect(cleanAthleteName('x'.repeat(17))).toBeNull()
  })
})

describe('sex', () => {
  it('has exactly two cosmetic values', () => {
    expect(SEXES).toEqual(['female', 'male'])
    expect(isSex('female')).toBe(true)
    expect(isSex('male')).toBe(true)
    expect(isSex('Female')).toBe(false)
    expect(isSex(undefined)).toBe(false)
  })
})
