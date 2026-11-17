import { describe, expect, it } from 'vitest'
import { focusPosition } from './campArt'


describe('focusPosition', () => {
  it('centres the shop thumbnail on the focus, kept inside the picture', () => {
    expect(focusPosition(0.5, 4)).toBeCloseTo(50)
    expect(focusPosition(0, 4)).toBe(0)
    expect(focusPosition(1, 4)).toBeCloseTo(100)
    expect(focusPosition(0.3, 1)).toBe(50)
  })
})
