import { describe, expect, it } from 'vitest'
import { formatFatigue, formatFatigueDelta } from './format'

describe('Fatigue is always shown as a whole number (owner request, 12 November 2026)', () => {
  it('rounds the value and the change, with a true minus sign', () => {
    expect(formatFatigue(23.45)).toBe('23')
    expect(formatFatigue(23.5)).toBe('24')
    expect(formatFatigue(-0.2)).toBe('0')
    expect(formatFatigueDelta(4.6)).toBe('+5')
    expect(formatFatigueDelta(-3.4)).toBe('−3')
    expect(formatFatigueDelta(0.3)).toBe('0')
  })
})
