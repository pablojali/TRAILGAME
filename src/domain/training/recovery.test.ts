import { describe, expect, it } from 'vitest'
import { PROFILES } from '../athlete/profiles'
import { getRestFatigueDelta, getRestRecoveryBonus, getSessionFatigueDelta, levelFatigueSaving } from './recovery'
import { getLevel } from '../athlete/levels'

function athlete(profile: 'climber' | 'endurance', recovery: number) {
  return { profile, attributes: { ...PROFILES[profile].attributes, recovery } }
}

describe('Recovery bonus on Rest', () => {
  it('adds −2 Fatigue to Rest for every 3 Recovery points above the profile start', () => {
    // Climber starts with Recovery 14.
    expect([14, 15, 16, 17, 19, 20, 23].map((r) => getRestFatigueDelta(athlete('climber', r)))).toEqual([
      -8, -8, -8, -10, -10, -12, -14,
    ])
  })

  it('starts from each profile’s own Recovery', () => {
    // Endurance starts with Recovery 18: 20 is only 2 above.
    expect(getRestRecoveryBonus(athlete('endurance', 18))).toBe(0)
    expect(getRestRecoveryBonus(athlete('endurance', 20))).toBe(0)
    expect(getRestRecoveryBonus(athlete('endurance', 21))).toBe(2)
  })
})

describe('training tires less with the level (owner decision, 10 November 2026)', () => {
  it('saves 3% of a session’s Fatigue at level 30, 5% at 50, 10% at 100, linear between', () => {
    expect(levelFatigueSaving(1)).toBe(0)
    expect(levelFatigueSaving(30)).toBeCloseTo(0.03, 9)
    expect(levelFatigueSaving(40)).toBeCloseTo(0.04, 9)
    expect(levelFatigueSaving(50)).toBeCloseTo(0.05, 9)
    expect(levelFatigueSaving(100)).toBeCloseTo(0.1, 9)
    expect(levelFatigueSaving(150)).toBeCloseTo(0.1, 9)
  })

  it('applies to training sessions only, not to Rest', () => {
    const athlete = { profile: 'all-rounder' as const, attributes: { ...PROFILES['all-rounder'].attributes }, xp: 0 }
    let xp = 0
    while (getLevel(xp) < 50) xp += 100
    const veteran = { ...athlete, xp }
    expect(getSessionFatigueDelta(athlete, 'intervals')).toBe(14)
    expect(getSessionFatigueDelta(veteran, 'intervals')).toBe(13.3)
    expect(getSessionFatigueDelta(veteran, 'rest')).toBe(getSessionFatigueDelta(athlete, 'rest'))
  })
})
