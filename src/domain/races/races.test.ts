import { describe, expect, it } from 'vitest'
import { getEntryFee, getGrossPrizes, getRewardMultiplier, getShortfall } from './access'
import { GROSS_PRIZES, PRIZE_BANDS, RACE_CATEGORY_CONFIG } from './categories'
import { getRace, isRaceId, RACES, type Race } from './races'

function race(id: string): Race {
  return getRace(id)!
}

describe('race catalog', () => {
  it('has the 12 initial races with unique stable ids, as specified', () => {
    expect(RACES).toHaveLength(12)
    expect(RACES.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `RACE-${String(i + 1).padStart(3, '0')}`))
    expect(RACES.map((r) => [r.name, r.category, r.distanceKm, r.elevationGainM, r.recommendedLevel])).toEqual([
      // Recommended levels: owner decision of 29 October 2026 (Open 1–10, Trail 11–20, Mountain 21–30, Elite 31–50).
      ['Forest First Steps', 'open', 5, 120, 1],
      ['Riverside Trail', 'open', 8, 220, 4],
      ['Pine Loop Challenge', 'open', 10, 350, 8],
      ['Ridge Runner', 'trail', 12, 550, 11],
      ['Stone Path Classic', 'trail', 15, 750, 14],
      ['Wildwood Ascent', 'trail', 18, 950, 18],
      ['Summit Quest', 'mountain', 22, 1300, 21],
      ['Alpine Traverse', 'mountain', 28, 1700, 25],
      ['Sky Ridge Ultra', 'mountain', 35, 2200, 28],
      ['High Peaks Challenge', 'elite', 42, 2800, 31],
      ['Legends of the Crest', 'elite', 55, 3600, 40],
      ['Beyond the Skyline', 'elite', 70, 4800, 50],
    ])
    expect(RACES.every((r) => r.terrain.length > 0)).toBe(true)
    expect(isRaceId('RACE-001')).toBe(true)
    expect(isRaceId('RACE-013')).toBe(false)
  })

  it('uses the category fees halved by the owner (29 October 2026)', () => {
    expect(RACE_CATEGORY_CONFIG).toEqual({
      open: { label: 'Open', recommendedLevel: 1, standardFee: 0, earlyEntryFee: 0 },
      trail: { label: 'Trail', recommendedLevel: 11, standardFee: 50, earlyEntryFee: 125 },
      mountain: { label: 'Mountain', recommendedLevel: 21, standardFee: 125, earlyEntryFee: 300 },
      elite: { label: 'Elite', recommendedLevel: 31, standardFee: 300, earlyEntryFee: 700 },
    })
  })

  it('uses the specified gross prizes by finishing position', () => {
    expect(PRIZE_BANDS.map((b) => b.label)).toEqual(['1st', '2nd', '3rd', '4th–10th', '11th or lower'])
    expect(GROSS_PRIZES).toEqual({
      open: [100, 70, 50, 25, 10],
      trail: [300, 210, 150, 75, 30],
      mountain: [700, 490, 350, 175, 70],
      elite: [1500, 1050, 750, 375, 150],
    })
    expect(getGrossPrizes(race('RACE-007'))).toBe(GROSS_PRIZES.mountain)
  })
})

describe('entry fees', () => {
  it('keeps Open races free at any level, including below the recommended level', () => {
    expect(getEntryFee(race('RACE-001'), 1)).toEqual({ type: 'free', fee: 0 })
    expect(getEntryFee(race('RACE-003'), 1)).toEqual({ type: 'free', fee: 0 })
  })

  it('charges the standard fee at or above the recommended level', () => {
    expect(getEntryFee(race('RACE-004'), 11)).toEqual({ type: 'standard', fee: 50 })
    expect(getEntryFee(race('RACE-004'), 20)).toEqual({ type: 'standard', fee: 50 })
  })

  it('charges the early-entry fee below the recommended level, with no level lock (Elite included)', () => {
    expect(getEntryFee(race('RACE-006'), 11)).toEqual({ type: 'early', fee: 125 })
    expect(getEntryFee(race('RACE-009'), 20)).toEqual({ type: 'early', fee: 300 })
    expect(getEntryFee(race('RACE-012'), 1)).toEqual({ type: 'early', fee: 700 })
  })

  it('reports the shortfall', () => {
    expect(getShortfall(250, 100)).toBe(150)
    expect(getShortfall(100, 100)).toBe(0)
    expect(getShortfall(0, 0)).toBe(0)
  })
})

describe('anti-farming multipliers', () => {
  it.each([
    [9, -2, 1],
    [11, 0, 1],
    [12, 1, 0.75],
    [13, 2, 0.4],
  ])('level %i in a level-11 race: difference %i, multiplier %d', (level, difference, multiplier) => {
    expect(getRewardMultiplier(race('RACE-004'), level)).toEqual({
      levelDifference: difference,
      xp: multiplier,
      coins: multiplier,
    })
  })

  it('gives 0 % at 3 or more levels above the recommendation', () => {
    expect(getRewardMultiplier(race('RACE-001'), 4)).toMatchObject({ levelDifference: 3, xp: 0, coins: 0 })
    expect(getRewardMultiplier(race('RACE-001'), 5)).toMatchObject({ levelDifference: 4, xp: 0, coins: 0 })
  })
})
