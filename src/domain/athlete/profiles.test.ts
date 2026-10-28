import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './athlete'
import { PROFILE_ATTRIBUTE_TOTAL, PROFILE_IDS, PROFILES } from './profiles'

describe('PROFILES', () => {
  it('defines exactly the four approved profiles', () => {
    expect(PROFILE_IDS).toEqual(['climber', 'sprinter', 'all-rounder', 'endurance'])
    expect(Object.keys(PROFILES).sort()).toEqual([...PROFILE_IDS].sort())
  })

  it('matches the approved attribute matrix', () => {
    const matrix = ATTRIBUTE_IDS.map((id) => [id, ...PROFILE_IDS.map((p) => PROFILES[p].attributes[id])])
    expect(matrix).toEqual([
      ['endurance', 16, 13, 16, 20],
      ['climbing', 20, 12, 16, 15],
      ['speed', 13, 20, 16, 14],
      ['technical', 18, 17, 16, 13],
      ['recovery', 14, 16, 16, 18],
      ['consistency', 15, 18, 16, 16],
    ])
  })

  it.each(PROFILE_IDS)('%s totals 96 points with every attribute in 12–20', (id) => {
    const values = Object.values(PROFILES[id].attributes)
    expect(values).toHaveLength(6)
    expect(values.reduce((a, b) => a + b, 0)).toBe(PROFILE_ATTRIBUTE_TOTAL)
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(12)
      expect(v).toBeLessThanOrEqual(20)
    }
  })
})
