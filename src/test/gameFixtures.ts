import type { ProfileId } from '../domain/athlete/athlete'
import type { SessionType } from '../domain/training/sessions'
import { createInitialGameState, type AthleteIdentity, type GameState } from '../game-engine/gameState'
import { executeCurrentDay, planSession, type DayRef } from '../game-engine/training'

/** Fixed creation time used by engine tests. */
export const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)

/** Identity used by tests unless a test needs another one. */
export const TEST_IDENTITY: AthleteIdentity = { name: 'Demo Runner', sex: 'female' }

export function newGame(
  profile: ProfileId = 'all-rounder',
  now = T0,
  identity: AthleteIdentity = TEST_IDENTITY,
): GameState {
  return createInitialGameState(profile, now, identity)
}

export function currentRef(state: GameState): DayRef {
  return { week: state.week.number, dayIndex: state.week.currentDayIndex }
}

export function execute(state: GameState, now = T0) {
  const result = executeCurrentDay(state, currentRef(state), now)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

export function withSession(state: GameState, session: SessionType): GameState {
  const result = planSession(state, currentRef(state), session)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

export function withAthlete(state: GameState, overrides: Partial<GameState['athlete']>): GameState {
  return { ...state, athlete: { ...state.athlete, ...overrides } }
}

/**
 * Moves the career to Sunday (race day) of the current week, marking Monday–Saturday as completed
 * with no effect, so athlete values stay as given.
 */
export function onSunday(state: GameState): GameState {
  return {
    ...state,
    week: {
      ...state.week,
      currentDayIndex: 6,
      days: state.week.days.map((day, index) =>
        index < 6 ? { ...day, outcome: day.outcome ?? { xpGained: 0, fitnessChange: 0, fatigueChange: 0 } } : day,
      ),
    },
  }
}
