import { describe, expect, it } from 'vitest'
import { getLevelRewards } from './levelRewards'

describe('level rewards', () => {
  it('lists the attribute points, looks and races of the levels gained', () => {
    // Women, tone 2: the Coral tank top unlocks at Level 2; no race opens at 2 (the first two open at 1).
    const two = getLevelRewards(1, 2, 'female', 'tone-2')
    expect(two.attributePoints).toBe(2)
    expect(two.looks).toEqual(['Coral tank top'])
    expect(two.races).toEqual([])
    // Several levels at once (a race win): points and unlocks of every level gained.
    const many = getLevelRewards(1, 4, 'male', 'tone-1')
    expect(many.attributePoints).toBe(6)
    expect(many.looks).toEqual(['Navy T-shirt', 'Burgundy T-shirt', 'Green T-shirt'])
    // Pine Loop Challenge opens at Level 3 (5 below its recommended Level 8).
    expect(many.races.map((r) => r.id)).toEqual(['RACE-003'])
  })

  it('has only points when nothing else unlocks', () => {
    expect(getLevelRewards(20, 21, 'female', 'tone-1')).toEqual({ attributePoints: 2, looks: [], races: [] })
  })
})
