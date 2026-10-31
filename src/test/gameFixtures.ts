import type { ProfileId } from '../domain/athlete/athlete'
import { getLevel } from '../domain/athlete/levels'
import type { SessionType } from '../domain/training/sessions'
import { createInitialGameState, type AthleteIdentity, type GameState, type PendingRaceEntry } from '../game-engine/gameState'
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

/**
 * A pending race entry made without the entry rules (level), for tests about race day, results
 * and saves rather than about entering. Free, like every entry since 1 November 2026.
 */
export function withEntry(state: GameState, raceId: string, enteredAt = T0): { state: GameState; entry: PendingRaceEntry } {
  const entry: PendingRaceEntry = {
    id: `entry-${state.raceEntries.length + 1}`,
    raceId,
    entryType: 'free',
    feePaid: 0,
    levelAtEntry: getLevel(state.athlete.xp),
    enteredAt,
    status: 'pending',
  }
  return { state: { ...state, raceEntries: [...state.raceEntries, entry] }, entry }
}
