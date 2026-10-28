import { describe, expect, it } from 'vitest'
import type { SessionType } from '../domain/training/sessions'
import { createInitialGameState, DEFAULT_WEEK_PLAN, getDayStatus, type GameState } from './gameState'
import { executeCurrentDay, planSession, previewSession, summarizeWeek, type DayRef } from './training'

function currentRef(state: GameState): DayRef {
  return { week: state.week.number, dayIndex: state.week.currentDayIndex }
}

function execute(state: GameState) {
  const result = executeCurrentDay(state, currentRef(state))
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function withAthlete(overrides: Partial<GameState['athlete']>): GameState {
  const state = createInitialGameState()
  return { ...state, athlete: { ...state.athlete, ...overrides } }
}

function withSession(state: GameState, session: SessionType): GameState {
  const result = planSession(state, currentRef(state), session)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('createInitialGameState', () => {
  it('creates the All-rounder demo athlete', () => {
    const { athlete, week } = createInitialGameState()
    expect(athlete).toEqual({
      name: 'Demo Runner',
      archetype: 'all-rounder',
      xp: 0,
      fitness: 50,
      fatigue: 10,
      attributes: { endurance: 50, speed: 50, power: 50, technique: 50, strength: 50, recovery: 50 },
    })
    expect(week.number).toBe(1)
    expect(week.currentDayIndex).toBe(0)
    expect(week.days.map((d) => d.session)).toEqual(DEFAULT_WEEK_PLAN)
    expect(week.days.every((d) => d.outcome === null)).toBe(true)
  })

  it('is deterministic and returns independent copies', () => {
    const a = createInitialGameState()
    const b = createInitialGameState()
    expect(a).toEqual(b)
    a.week.days[0]!.session = 'rest'
    expect(b.week.days[0]!.session).toBe('easy-run')
  })

  it('plans a mix of training and rest', () => {
    expect(DEFAULT_WEEK_PLAN).toHaveLength(7)
    expect(DEFAULT_WEEK_PLAN).toContain('rest')
    expect(DEFAULT_WEEK_PLAN.filter((s) => s !== 'rest').length).toBeGreaterThan(3)
  })
})

describe('executeCurrentDay', () => {
  it.each<[SessionType, number, number, number]>([
    ['easy-run', 10, 53, 15],
    ['intervals', 18, 55, 24],
    ['hills', 16, 55, 22],
    ['long-run', 20, 56, 26],
    ['strength', 12, 53, 18],
    ['trail-technique', 12, 53, 16],
    ['rest', 0, 50, 0],
  ])('applies %s: XP %i, fitness %i, fatigue %i', (session, xp, fitness, fatigue) => {
    const result = execute(withSession(createInitialGameState(), session))
    expect(result.state.athlete).toMatchObject({ xp, fitness, fatigue })
  })

  it('rest reduces fatigue by 12 and grants no XP or fitness', () => {
    const state = withSession(withAthlete({ xp: 40, fitness: 60, fatigue: 30 }), 'rest')
    const result = execute(state)
    expect(result.state.athlete).toMatchObject({ xp: 40, fitness: 60, fatigue: 18 })
    expect(result.outcome).toEqual({ xpGained: 0, fitnessChange: 0, fatigueChange: -12 })
  })

  it('clamps fatigue at 0 on rest', () => {
    const result = execute(withSession(withAthlete({ fatigue: 5 }), 'rest'))
    expect(result.state.athlete.fatigue).toBe(0)
    expect(result.outcome.fatigueChange).toBe(-5)
  })

  it('clamps fitness and fatigue at 100', () => {
    const result = execute(withSession(withAthlete({ fitness: 98, fatigue: 95 }), 'long-run'))
    expect(result.state.athlete.fitness).toBe(100)
    expect(result.state.athlete.fatigue).toBe(100)
    expect(result.outcome).toEqual({ xpGained: 20, fitnessChange: 2, fatigueChange: 5 })
  })

  it('keeps stats within 0–100 over many weeks of any session', () => {
    for (const session of ['long-run', 'rest'] as const) {
      let state = createInitialGameState()
      for (let i = 0; i < 70; i++) {
        state = execute(withSession(state, session)).state
        expect(state.athlete.fitness).toBeGreaterThanOrEqual(0)
        expect(state.athlete.fitness).toBeLessThanOrEqual(100)
        expect(state.athlete.fatigue).toBeGreaterThanOrEqual(0)
        expect(state.athlete.fatigue).toBeLessThanOrEqual(100)
      }
    }
  })

  it('never changes the six attributes', () => {
    let state = createInitialGameState()
    const before = state.athlete.attributes
    for (let i = 0; i < 14; i++) state = execute(state).state
    expect(state.athlete.attributes).toEqual(before)
  })

  it('marks the day completed with its outcome and advances to the next day', () => {
    const result = execute(createInitialGameState())
    const { week } = result.state
    expect(week.currentDayIndex).toBe(1)
    expect(week.days[0]!.outcome).toEqual({ xpGained: 10, fitnessChange: 3, fatigueChange: 5 })
    expect(getDayStatus(week, 0)).toBe('completed')
    expect(getDayStatus(week, 1)).toBe('current')
    expect(getDayStatus(week, 2)).toBe('upcoming')
    expect(result.executed).toEqual({ week: 1, dayIndex: 0, session: 'easy-run' })
    expect(result.weekCompleted).toBe(false)
  })

  it('does not mutate the input state', () => {
    const state = createInitialGameState()
    const snapshot = structuredClone(state)
    execute(state)
    expect(state).toEqual(snapshot)
  })

  it('rejects executing the same day twice', () => {
    const state = createInitialGameState()
    const ref = currentRef(state)
    const first = executeCurrentDay(state, ref)
    if (!first.ok) throw new Error(first.error)
    const second = executeCurrentDay(first.value.state, ref)
    expect(second).toEqual({ ok: false, error: 'day-completed' })
  })

  it('rejects executing a future day', () => {
    const state = createInitialGameState()
    expect(executeCurrentDay(state, { week: 1, dayIndex: 2 })).toEqual({
      ok: false,
      error: 'day-not-current',
    })
  })

  it('rejects a request for a different week', () => {
    let state = createInitialGameState()
    for (let i = 0; i < 7; i++) state = execute(state).state
    expect(executeCurrentDay(state, { week: 1, dayIndex: 0 })).toEqual({
      ok: false,
      error: 'wrong-week',
    })
  })

  it('reports level changes', () => {
    const result = execute(withSession(withAthlete({ xp: 90 }), 'easy-run'))
    expect(result.levelBefore).toBe(1)
    expect(result.levelAfter).toBe(2)
    expect(result.state.athlete.xp).toBe(100)
  })

  it('starts a new week after day 7 without resetting progression', () => {
    let state = createInitialGameState()
    let last
    for (let i = 0; i < 7; i++) {
      last = execute(state)
      state = last.state
    }
    expect(last!.weekCompleted).toBe(true)
    expect(last!.executed).toEqual({ week: 1, dayIndex: 6, session: 'rest' })
    expect(state.week.number).toBe(2)
    expect(state.week.currentDayIndex).toBe(0)
    expect(state.week.days.map((d) => d.session)).toEqual(DEFAULT_WEEK_PLAN)
    expect(state.week.days.every((d) => d.outcome === null)).toBe(true)
    // Default plan: 10 + 18 + 12 + 0 + 16 + 20 + 0
    expect(state.athlete.xp).toBe(76)
  })

  it('accumulates XP across weeks and never decreases it', () => {
    let state = createInitialGameState()
    let previousXp = 0
    for (let i = 0; i < 21; i++) {
      state = execute(state).state
      expect(state.athlete.xp).toBeGreaterThanOrEqual(previousXp)
      previousXp = state.athlete.xp
    }
    expect(state.week.number).toBe(4)
    expect(state.athlete.xp).toBe(76 * 3)
  })
})

describe('planSession', () => {
  it('changes the current day only', () => {
    const state = createInitialGameState()
    const result = planSession(state, { week: 1, dayIndex: 0 }, 'long-run')
    if (!result.ok) throw new Error(result.error)
    expect(result.value.week.days.map((d) => d.session)).toEqual([
      'long-run',
      ...DEFAULT_WEEK_PLAN.slice(1),
    ])
    expect(state.week.days[0]!.session).toBe('easy-run')
  })

  it('does not change athlete stats', () => {
    const state = createInitialGameState()
    const result = planSession(state, currentRef(state), 'intervals')
    expect(result.ok && result.value.athlete).toEqual(state.athlete)
  })

  it('rejects changing a completed day', () => {
    const state = execute(createInitialGameState()).state
    expect(planSession(state, { week: 1, dayIndex: 0 }, 'rest')).toEqual({
      ok: false,
      error: 'day-completed',
    })
  })

  it('rejects changing a future day', () => {
    expect(planSession(createInitialGameState(), { week: 1, dayIndex: 3 }, 'rest')).toEqual({
      ok: false,
      error: 'day-not-current',
    })
  })

  it('rejects unknown sessions', () => {
    const state = createInitialGameState()
    expect(planSession(state, currentRef(state), 'sprint' as SessionType)).toEqual({
      ok: false,
      error: 'unknown-session',
    })
  })
})

describe('previewSession', () => {
  it('matches what execution applies', () => {
    const state = withSession(withAthlete({ fitness: 97, fatigue: 92 }), 'intervals')
    expect(previewSession(state, 'intervals')).toEqual(execute(state).outcome)
  })
})

describe('summarizeWeek', () => {
  it('counts completed days and XP for the current week', () => {
    let state = createInitialGameState()
    expect(summarizeWeek(state)).toEqual({ completedDays: 0, totalDays: 7, xpGained: 0 })
    state = execute(state).state
    state = execute(state).state
    expect(summarizeWeek(state)).toEqual({ completedDays: 2, totalDays: 7, xpGained: 28 })
  })
})
