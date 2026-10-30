import { describe, expect, it } from 'vitest'
import { PROFILE_IDS, PROFILES } from '../domain/athlete/profiles'
import type { SessionType } from '../domain/training/sessions'
import { defaultAppearance } from '../domain/athlete/appearance'
import { createInitialGameState, DEFAULT_WEEK_PLAN, getDayStatus } from './gameState'
import { currentRef, execute, newGame, T0, TEST_IDENTITY, withAthlete, withSession } from '../test/gameFixtures'
import { executeCurrentDay, planSession, previewSession, summarizeWeek } from './training'

const HOUR = 60 * 60 * 1000
/** Default plan: 9 + 16 + 0 + 14 + 0 + 18 + 0. */
const WEEK_XP = 57

describe('createInitialGameState', () => {
  it.each(PROFILE_IDS)('creates a %s career with the approved initial state', (profile) => {
    const { athlete, week, fitnessDecayReference } = createInitialGameState(profile, T0, TEST_IDENTITY)
    expect(athlete).toEqual({
      name: 'Demo Runner',
      sex: 'female',
      appearance: defaultAppearance('female'),
      profile,
      xp: 0,
      fitness: 20,
      fatigue: 0,
      attributes: PROFILES[profile].attributes,
      spentAttributePoints: 0,
    })
    expect(fitnessDecayReference).toBe(T0)
    expect(week.number).toBe(1)
    expect(week.currentDayIndex).toBe(0)
    expect(week.days.map((d) => d.session)).toEqual(DEFAULT_WEEK_PLAN)
    expect(week.days.every((d) => d.outcome === null)).toBe(true)
  })

  it('makes sex, appearance and name cosmetic: every other value is identical', () => {
    for (const profile of PROFILE_IDS) {
      const female = createInitialGameState(profile, T0, { name: 'A', sex: 'female' })
      const male = createInitialGameState(profile, T0, {
        name: 'B',
        sex: 'male',
        appearance: { hair: 'natural', skin: 'tone-4', outfit: 'white-tshirt' },
      })
      expect(male.athlete.appearance).toEqual({ hair: 'natural', skin: 'tone-4', outfit: 'white-tshirt' })
      const strip = (s: typeof female) => ({
        ...s,
        athlete: { ...s.athlete, sex: null, name: null, appearance: null },
      })
      expect(strip(female)).toEqual(strip(male))
      // Training outcomes are identical too.
      expect(strip(execute(female).state)).toEqual(strip(execute(male).state))
    }
  })

  it('copies profile attributes instead of sharing them', () => {
    const state = newGame('climber')
    state.athlete.attributes.climbing = 99
    expect(PROFILES.climber.attributes.climbing).toBe(20)
  })

  it('keeps the approved weekly plan: 4 training days and 3 rest days, without Trail technique', () => {
    expect(DEFAULT_WEEK_PLAN).toEqual(['easy-run', 'intervals', 'rest', 'hills', 'rest', 'long-run', 'rest'])
    expect(DEFAULT_WEEK_PLAN).not.toContain('trail-technique')
  })
})

describe('executeCurrentDay', () => {
  it.each<[SessionType, number, number, number]>([
    ['easy-run', 9, 22, 5],
    ['intervals', 16, 23, 14],
    ['hills', 14, 23, 12],
    ['long-run', 18, 23, 16],
    ['strength', 11, 22, 4],
    ['trail-technique', 11, 22, 3],
    ['rest', 0, 18, 0],
  ])('applies %s: XP %i, fitness %i, fatigue %i', (session, xp, fitness, fatigue) => {
    const result = execute(withSession(newGame(), session))
    expect(result.state.athlete).toMatchObject({ xp, fitness, fatigue })
  })

  it('rest reduces fatigue by 8 and Fitness by 2, and grants no XP', () => {
    const state = withSession(withAthlete(newGame(), { xp: 40, fitness: 60, fatigue: 30 }), 'rest')
    const result = execute(state)
    expect(result.state.athlete).toMatchObject({ xp: 40, fitness: 58, fatigue: 22 })
    expect(result.outcome).toEqual({ xpGained: 0, fitnessChange: -2, fatigueChange: -8 })
  })

  it('clamps fatigue at 0 on rest', () => {
    const result = execute(withSession(withAthlete(newGame(), { fatigue: 5 }), 'rest'))
    expect(result.state.athlete.fatigue).toBe(0)
    expect(result.outcome.fatigueChange).toBe(-5)
  })

  it('clamps fitness at 100', () => {
    const result = execute(withSession(withAthlete(newGame(), { fitness: 99 }), 'long-run'))
    expect(result.state.athlete.fitness).toBe(100)
    expect(result.outcome).toEqual({ xpGained: 18, fitnessChange: 1, fatigueChange: 16 })
  })

  it('keeps stats within 0–100 over many weeks of any session', () => {
    for (const session of ['long-run', 'rest'] as const) {
      let state = newGame()
      for (let i = 0; i < 70; i++) {
        // Forced Rest days after an injury cannot be re-planned.
        if (state.forcedRestDays === 0) state = withSession(state, session)
        state = execute(state).state
        for (const v of [state.athlete.fitness, state.athlete.fatigue]) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('never changes attributes automatically', () => {
    let state = newGame('sprinter')
    for (let i = 0; i < 28; i++) state = execute(state).state
    expect(state.athlete.attributes).toEqual(PROFILES.sprinter.attributes)
    expect(state.athlete.spentAttributePoints).toBe(0)
  })

  it('marks the day completed with its outcome and advances to the next day', () => {
    const result = execute(newGame())
    const { week } = result.state
    expect(week.currentDayIndex).toBe(1)
    expect(week.days[0]!.outcome).toEqual({ xpGained: 9, fitnessChange: 2, fatigueChange: 5 })
    expect(getDayStatus(week, 0)).toBe('completed')
    expect(getDayStatus(week, 1)).toBe('current')
    expect(getDayStatus(week, 2)).toBe('upcoming')
    expect(result.executed).toEqual({ week: 1, dayIndex: 0, session: 'easy-run' })
    expect(result.weekCompleted).toBe(false)
  })

  it('does not mutate the input state', () => {
    const state = newGame()
    const snapshot = structuredClone(state)
    execute(state)
    expect(state).toEqual(snapshot)
  })

  it('rejects executing the same day twice', () => {
    const state = newGame()
    const ref = currentRef(state)
    const first = executeCurrentDay(state, ref, T0)
    if (!first.ok) throw new Error(first.error)
    expect(executeCurrentDay(first.value.state, ref, T0)).toEqual({ ok: false, error: 'day-completed' })
  })

  it('rejects executing a future day', () => {
    expect(executeCurrentDay(newGame(), { week: 1, dayIndex: 2 }, T0)).toEqual({
      ok: false,
      error: 'day-not-current',
    })
  })

  it('rejects a request for a different week', () => {
    let state = newGame()
    for (let i = 0; i < 7; i++) state = execute(state).state
    expect(executeCurrentDay(state, { week: 1, dayIndex: 0 }, T0)).toEqual({ ok: false, error: 'wrong-week' })
  })

  it('reports level changes and awards 2 attribute points per level', () => {
    const below = execute(withSession(withAthlete(newGame(), { xp: 90 }), 'easy-run'))
    expect(below.state.athlete.xp).toBe(99)
    expect(below.attributePointsAwarded).toBe(0)

    const result = execute(withSession(withAthlete(newGame(), { xp: 91 }), 'easy-run'))
    expect(result.state.athlete.xp).toBe(100)
    expect(result.levelBefore).toBe(1)
    expect(result.levelAfter).toBe(2)
    expect(result.attributePointsAwarded).toBe(2)
  })

  it('reaches level 5 at exactly 700 XP', () => {
    const result = execute(withSession(withAthlete(newGame(), { xp: 682 }), 'long-run'))
    expect(result.state.athlete.xp).toBe(700)
    expect(result.levelAfter).toBe(5)
    expect(result.attributePointsAwarded).toBe(2)
  })

  it('starts a new week after day 7 without resetting progression', () => {
    let state = newGame()
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
    expect(state.athlete.xp).toBe(WEEK_XP)
    // Default plan: +2 +3, then each Rest follows a training day (recovery Rest keeps Fitness): +0 +3 +0 +3 +0.
    expect(state.athlete.fitness).toBe(20 + 11)
  })

  it('accumulates XP across weeks and never decreases it', () => {
    let state = newGame()
    let previousXp = 0
    for (let i = 0; i < 14; i++) {
      state = execute(state).state
      expect(state.athlete.xp).toBeGreaterThanOrEqual(previousXp)
      previousXp = state.athlete.xp
    }
    expect(state.week.number).toBe(3)
    expect(state.athlete.xp).toBe(WEEK_XP * 2)
    // Default plan: +23 Fatigue per week (5 + 14 − 8 + 12 − 8 + 16 − 8).
    expect(state.athlete.fatigue).toBe(46)
  })

  describe('fitness decay reference', () => {
    it('moves to the completion time after a non-rest session', () => {
      const result = execute(newGame(), T0 + 30 * HOUR)
      expect(result.state.fitnessDecayReference).toBe(T0 + 30 * HOUR)
    })

    it('moves to the completion time after Rest too (owner decision, 30 October 2026)', () => {
      const result = execute(withSession(newGame(), 'rest'), T0 + 30 * HOUR)
      expect(result.state.fitnessDecayReference).toBe(T0 + 30 * HOUR)
    })

    it('causes no decay from advancing the simulated week', () => {
      let state = newGame()
      for (let i = 0; i < 7; i++) state = execute(withSession(state, 'rest'), T0 + i).state
      expect(state.week.number).toBe(2)
      expect(state.fitnessDecayReference).toBe(T0 + 6)
      // Only the Rest effect (−2 per day: no active day before any of them), no decay.
      expect(state.athlete.fitness).toBe(20 - 7 * 2)
    })
  })

  describe('recovery Rest (owner decision, 30 October 2026)', () => {
    it('keeps Fitness right after a training day; a second Rest in a row loses 2', () => {
      const trained = execute(newGame()).state // Easy run: Fitness 22
      expect(trained.previousDayActive).toBe(true)
      expect(previewSession(trained, 'rest').fitnessChange).toBe(0)
      const rested = execute(withSession(trained, 'rest')).state
      expect(rested.athlete.fitness).toBe(22)
      expect(rested.previousDayActive).toBe(false)
      expect(previewSession(rested, 'rest').fitnessChange).toBe(-2)
      expect(execute(withSession(rested, 'rest')).state.athlete.fitness).toBe(20)
    })

    it('gives no bonus at the start of a career or on forced Rest after an injury', () => {
      expect(newGame().previousDayActive).toBe(false)
      expect(previewSession(newGame(), 'rest').fitnessChange).toBe(-2)
      const injured = { ...newGame(), previousDayActive: true, forcedRestDays: 3 }
      expect(previewSession(injured, 'rest').fitnessChange).toBe(-2)
    })

    it('counts across weeks: Monday Rest after a Sunday session is a recovery Rest', () => {
      let state = newGame()
      for (let i = 0; i < 6; i++) state = execute(state).state
      state = execute(withSession(state, 'long-run')).state // Sunday
      expect(state.week.number).toBe(2)
      expect(state.previousDayActive).toBe(true)
      expect(previewSession(state, 'rest').fitnessChange).toBe(0)
    })
  })
})

describe('planSession', () => {
  it('changes the current day only and allows Trail technique', () => {
    const state = newGame()
    const result = planSession(state, { week: 1, dayIndex: 0 }, 'trail-technique')
    if (!result.ok) throw new Error(result.error)
    expect(result.value.week.days.map((d) => d.session)).toEqual([
      'trail-technique',
      ...DEFAULT_WEEK_PLAN.slice(1),
    ])
    expect(state.week.days[0]!.session).toBe('easy-run')
  })

  it('does not change athlete stats or the decay reference', () => {
    const state = newGame()
    const result = planSession(state, currentRef(state), 'intervals')
    if (!result.ok) throw new Error(result.error)
    expect(result.value.athlete).toEqual(state.athlete)
    expect(result.value.fitnessDecayReference).toBe(state.fitnessDecayReference)
  })

  it('rejects changing a completed day', () => {
    const state = execute(newGame()).state
    expect(planSession(state, { week: 1, dayIndex: 0 }, 'rest')).toEqual({ ok: false, error: 'day-completed' })
  })

  it('rejects changing a future day', () => {
    expect(planSession(newGame(), { week: 1, dayIndex: 3 }, 'rest')).toEqual({
      ok: false,
      error: 'day-not-current',
    })
  })

  it('rejects unknown sessions', () => {
    const state = newGame()
    expect(planSession(state, currentRef(state), 'sprint' as SessionType)).toEqual({
      ok: false,
      error: 'unknown-session',
    })
  })
})

describe('previewSession', () => {
  it('matches what execution applies', () => {
    const state = withSession(withAthlete(newGame(), { fitness: 98, fatigue: 92 }), 'intervals')
    expect(previewSession(state, 'intervals')).toEqual(execute(state).outcome)
  })
})

describe('summarizeWeek', () => {
  it('counts completed days and XP for the current week', () => {
    let state = newGame()
    expect(summarizeWeek(state)).toEqual({ completedDays: 0, totalDays: 7, xpGained: 0 })
    state = execute(state).state
    state = execute(state).state
    expect(summarizeWeek(state)).toEqual({ completedDays: 2, totalDays: 7, xpGained: 25 })
  })
})

describe('Rest with the Recovery bonus (owner decision)', () => {
  it('recovers 2 more Fatigue per 3 Recovery points above the start, on planned and forced Rest days', () => {
    // All-rounder starts with Recovery 16; 22 is 6 above: −8 − 4 = −12.
    const state = withAthlete(newGame(), { fatigue: 50, fitness: 40 })
    const trained = { ...state, athlete: { ...state.athlete, attributes: { ...state.athlete.attributes, recovery: 22 } } }
    const rested = execute(withSession(trained, 'rest'))
    expect(rested.outcome).toEqual({ xpGained: 0, fitnessChange: -2, fatigueChange: -12 })
    // Starting Recovery: unchanged −8.
    expect(execute(withSession(state, 'rest')).outcome.fatigueChange).toBe(-8)
    // Forced Rest after an injury uses the bonus too.
    const injured = execute({ ...trained, athlete: { ...trained.athlete, fatigue: 95 } }).state
    expect(injured.forcedRestDays).toBe(5)
    expect(execute(injured).outcome.fatigueChange).toBe(-12)
    // Fatigue never goes below 0.
    expect(execute(withSession({ ...trained, athlete: { ...trained.athlete, fatigue: 5 } }, 'rest')).outcome.fatigueChange).toBe(-5)
  })
})
