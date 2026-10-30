import { describe, expect, it } from 'vitest'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../domain/training/injury'
import { currentRef, execute, newGame, T0, withAthlete, withSession } from '../test/gameFixtures'
import type { GameState } from './gameState'
import { planSession, previewSession } from './training'

function atDay(state: GameState, dayIndex: number): GameState {
  let s = state
  while (s.week.currentDayIndex < dayIndex) s = execute(withSession(s, 'rest')).state
  return s
}

describe('injury rule', () => {
  it('uses the approved values', () => {
    expect([INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS]).toEqual([95, 15, 5])
  })

  it('is measured after training: ending at exactly 95 is safe, above 95 injures', () => {
    // Intervals: +14 Fatigue.
    expect(previewSession(withAthlete(newGame(), { fatigue: 81 }), 'intervals')).toEqual({
      xpGained: 16,
      fitnessChange: 0.75,
      fatigueChange: 14,
      attributeGain: { attribute: 'speed', amount: 0.1 },
    })
    expect(previewSession(withAthlete(newGame(), { fatigue: 82 }), 'intervals')).toEqual({
      xpGained: 0,
      fitnessChange: -15,
      fatigueChange: 14,
      injured: true,
    })
  })

  it('counts clamped fatigue: from 96, any training session injures', () => {
    expect(previewSession(withAthlete(newGame(), { fatigue: 96 }), 'trail-technique').injured).toBe(true)
  })

  it('never applies to Rest', () => {
    expect(previewSession(withAthlete(newGame(), { fatigue: 100 }), 'rest')).toEqual({
      xpGained: 0,
      fitnessChange: -2,
      fatigueChange: -8,
    })
  })

  it('injures on completion: no XP, −15 Fitness, fatigue cost applied, 5 forced Rest days', () => {
    const before = withSession(withAthlete(newGame(), { xp: 95, fitness: 40, fatigue: 90 }), 'long-run')
    const result = execute(before, T0 + 1000)
    expect(result.injured).toBe(true)
    expect(result.state.athlete).toMatchObject({ xp: 95, fitness: 25, fatigue: 100 })
    expect(result.levelAfter).toBe(result.levelBefore)
    expect(result.attributePointsAwarded).toBe(0)
    expect(result.state.forcedRestDays).toBe(5)
    expect(result.state.week.days[0]!.outcome).toEqual({
      xpGained: 0,
      fitnessChange: -15,
      fatigueChange: 10,
      injured: true,
    })
    // The session was completed, so it still counts as training for Fitness decay.
    expect(result.state.fitnessDecayReference).toBe(T0 + 1000)
  })

  it('never takes Fitness below 0', () => {
    const result = execute(withSession(withAthlete(newGame(), { fitness: 6, fatigue: 99 }), 'easy-run'))
    expect(result.state.athlete.fitness).toBe(0)
    expect(result.outcome.fitnessChange).toBe(-6)
  })

  it('forces the next 5 days to Rest across the week boundary, then restores the plan', () => {
    // Injury on day 4 (Thursday).
    let state = withAthlete(atDay(newGame(), 3), { fatigue: 90 })
    state = execute(withSession(state, 'hills')).state
    expect(state.week.days.slice(4).map((d) => d.session)).toEqual(['rest', 'rest', 'rest'])

    const remaining: number[] = []
    for (let i = 0; i < 3; i++) {
      expect(planSession(state, currentRef(state), 'easy-run')).toEqual({ ok: false, error: 'forced-rest' })
      state = execute(state).state
      remaining.push(state.forcedRestDays)
    }
    expect(remaining).toEqual([4, 3, 2])
    expect(state.week.number).toBe(2)
    expect(state.week.days.map((d) => d.session)).toEqual([
      'rest',
      'rest',
      'rest',
      'hills',
      'rest',
      'long-run',
      'rest',
    ])

    state = execute(state).state
    state = execute(state).state
    expect(state.forcedRestDays).toBe(0)
    expect(state.week.currentDayIndex).toBe(2)
    expect(planSession(state, currentRef(state), 'easy-run').ok).toBe(true)
  })

  it('forces the first 5 days of the next week when injured on Sunday', () => {
    let state = withAthlete(atDay(newGame(), 6), { fatigue: 100 })
    state = execute(withSession(state, 'easy-run')).state
    expect(state.week.number).toBe(2)
    expect(state.forcedRestDays).toBe(5)
    expect(state.week.days.map((d) => d.session)).toEqual([
      'rest',
      'rest',
      'rest',
      'rest',
      'rest',
      'long-run',
      'rest',
    ])
  })

  it('the unchanged default plan (4 training, 3 rest days) adds 23 Fatigue a week and injures on Saturday of week 4', () => {
    let state = newGame()
    for (let i = 0; i < 21; i++) state = execute(state).state
    expect(state.athlete.fatigue).toBe(69)
    for (let i = 0; i < 5; i++) state = execute(state).state // Monday–Friday: 84
    expect(state.athlete.fatigue).toBe(84)
    expect(previewSession(state, 'long-run').injured).toBe(true)
  })
})
