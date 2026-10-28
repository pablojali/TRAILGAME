import type { ProfileId } from '../domain/athlete/athlete'
import type { SessionType } from '../domain/training/sessions'
import { createInitialGameState, type GameState } from '../game-engine/gameState'
import { executeCurrentDay, planSession, type DayRef } from '../game-engine/training'

/** Fixed creation time used by engine tests. */
export const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)

export function newGame(profile: ProfileId = 'all-rounder', now = T0): GameState {
  return createInitialGameState(profile, now)
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
