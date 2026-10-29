import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '../domain/economy/coins'
import { execute, newGame, T0, withAthlete } from '../test/gameFixtures'
import type { GameState } from './gameState'
import { enterRace, getPendingEntry } from './races'

/** Level 3 needs 250 XP. */
function atLevel3(coins: number): GameState {
  return { ...withAthlete(newGame(), { xp: 250, spentAttributePoints: 0 }), coins }
}

describe('enterRace', () => {
  it('starts a new career with no coins and no entries', () => {
    expect(STARTING_COINS).toBe(0)
    expect(newGame()).toMatchObject({ coins: 0, raceEntries: [] })
  })

  it('enters a free Open race without changing the balance', () => {
    const result = enterRace(newGame(), 'RACE-001', 0, T0 + 5)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.coins).toBe(0)
    expect(result.entry).toEqual({
      id: 'entry-1',
      raceId: 'RACE-001',
      entryType: 'free',
      feePaid: 0,
      levelAtEntry: 1,
      enteredAt: T0 + 5,
      status: 'pending',
    })
    expect(getPendingEntry(result.state, 'RACE-001')).toEqual(result.entry)
  })

  it('charges the standard fee exactly once', () => {
    const first = enterRace(atLevel3(500), 'RACE-004', 100, T0)
    if (!first.ok) throw new Error(first.error)
    expect(first.state.coins).toBe(400)
    expect(first.entry).toMatchObject({ entryType: 'standard', feePaid: 100, levelAtEntry: 3 })
    // A repeated confirmation (double tap, reload) is rejected and charges nothing.
    expect(enterRace(first.state, 'RACE-004', 100, T0)).toEqual({ ok: false, error: 'already-entered' })
  })

  it('charges the early-entry fee below the recommended level and allows several races', () => {
    const first = enterRace(atLevel3(1000), 'RACE-006', 250, T0)
    if (!first.ok) throw new Error(first.error)
    expect(first.entry).toMatchObject({ entryType: 'early', feePaid: 250 })
    const second = enterRace(first.state, 'RACE-007', 600, T0)
    if (!second.ok) throw new Error(second.error)
    expect(second.state.coins).toBe(150)
    expect(second.state.raceEntries.map((e) => e.id)).toEqual(['entry-1', 'entry-2'])
  })

  it('rejects entry without enough coins and never makes the balance negative', () => {
    const state = atLevel3(99)
    expect(enterRace(state, 'RACE-004', 100, T0)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(enterRace(newGame(), 'RACE-012', 1400, T0)).toEqual({ ok: false, error: 'insufficient-coins' })
  })

  it('rejects a fee that no longer applies, and unknown races', () => {
    expect(enterRace(atLevel3(500), 'RACE-004', 250, T0)).toEqual({ ok: false, error: 'fee-changed' })
    expect(enterRace(newGame(), 'RACE-999', 0, T0)).toEqual({ ok: false, error: 'unknown-race' })
  })

  it('does not change athlete, training or decay values', () => {
    const state = atLevel3(500)
    const result = enterRace(state, 'RACE-004', 100, T0 + 1000)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.athlete).toEqual(state.athlete)
    expect(result.state.week).toEqual(state.week)
    expect(result.state.fitnessDecayReference).toBe(state.fitnessDecayReference)
    expect(result.state.forcedRestDays).toBe(state.forcedRestDays)
  })

  it('keeps coins and entries when a training day is completed', () => {
    const entered = enterRace(atLevel3(500), 'RACE-004', 100, T0)
    if (!entered.ok) throw new Error(entered.error)
    const after = execute(entered.state).state
    expect(after.coins).toBe(400)
    expect(after.raceEntries).toEqual(entered.state.raceEntries)
  })
})
