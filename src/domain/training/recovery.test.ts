import { describe, expect, it } from 'vitest'
import { PROFILES } from '../athlete/profiles'
import { getRestFatigueDelta, getRestRecoveryBonus } from './recovery'

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
