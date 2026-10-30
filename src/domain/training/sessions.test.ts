import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_GAIN_PER_SESSION, isSessionType, SESSION_TYPES, TRAINING_SESSIONS } from './sessions'

describe('TRAINING_SESSIONS', () => {
  it('matches the approved values: XP and Fatigue (M2 and later), Fitness and trained attribute (30 October 2026)', () => {
    const table = SESSION_TYPES.map((id) => {
      const s = TRAINING_SESSIONS[id]
      return [s.label, s.xp, s.fitnessDelta, s.fatigueDelta, s.attribute ?? null]
    })
    expect(table).toEqual([
      ['Easy run', 9, 0.5, 5, 'endurance'],
      ['Intervals', 16, 0.75, 14, 'speed'],
      ['Hills', 14, 0.5, 12, 'climbing'],
      ['Long run', 18, 1, 16, 'endurance'],
      ['Strength', 11, 0.5, 4, 'recovery'],
      ['Trail technique', 11, 0.25, 3, 'technical'],
      ['Rest', 0, -2, -8, null],
    ])
    expect(ATTRIBUTE_GAIN_PER_SESSION).toBe(0.1)
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
