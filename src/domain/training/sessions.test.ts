import { describe, expect, it } from 'vitest'
import { isSessionType, SESSION_TYPES, TRAINING_SESSIONS } from './sessions'

describe('TRAINING_SESSIONS', () => {
  it('matches the approved M2 values, with Rest at −2 Fitness and −8 Fatigue (owner decisions)', () => {
    const table = SESSION_TYPES.map((id) => {
      const s = TRAINING_SESSIONS[id]
      return [s.label, s.xp, s.fitnessDelta, s.fatigueDelta]
    })
    expect(table).toEqual([
      ['Easy run', 9, 2, 5],
      ['Intervals', 16, 3, 14],
      ['Hills', 14, 3, 12],
      ['Long run', 18, 3, 16],
      ['Strength', 11, 2, 8],
      ['Trail technique', 11, 2, 6],
      ['Rest', 0, -2, -8],
    ])
  })

  it('keys every definition by its own id', () => {
    for (const id of SESSION_TYPES) expect(TRAINING_SESSIONS[id].id).toBe(id)
  })
})

describe('isSessionType', () => {
  it('accepts known ids and rejects anything else', () => {
    expect(isSessionType('long-run')).toBe(true)
    expect(isSessionType('Long run')).toBe(false)
    expect(isSessionType('toString')).toBe(false)
    expect(isSessionType(42)).toBe(false)
  })
})
