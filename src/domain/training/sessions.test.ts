import { describe, expect, it } from 'vitest'
import { isSessionType, SESSION_TYPES, TRAINING_SESSIONS } from './sessions'

describe('TRAINING_SESSIONS', () => {
  it('matches the approved M1 values', () => {
    const table = SESSION_TYPES.map((id) => {
      const s = TRAINING_SESSIONS[id]
      return [s.label, s.xp, s.fitnessDelta, s.fatigueDelta]
    })
    expect(table).toEqual([
      ['Easy run', 10, 3, 5],
      ['Intervals', 18, 5, 14],
      ['Hills', 16, 5, 12],
      ['Long run', 20, 6, 16],
      ['Strength', 12, 3, 8],
      ['Trail technique', 12, 3, 6],
      ['Rest', 0, 0, -12],
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
