import { createContext, useContext } from 'react'
import type { SessionType } from '../../domain/training/sessions'
import type { GameState } from '../../game-engine/gameState'
import type { DayRef, ExecutionResult, TrainingError } from '../../game-engine/training'
import type { LoadStatus } from '../../repositories/gameRepository'

export interface GameContextValue {
  state: GameState
  loadStatus: LoadStatus
  /** True if the most recent change could not be saved. */
  saveFailed: boolean
  /** Result of the most recent execution in this session, for feedback. */
  lastExecution: ExecutionResult | null
  planSession(ref: DayRef, session: SessionType): TrainingError | null
  executeDay(ref: DayRef): TrainingError | null
  resetDemo(): void
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame(): GameContextValue {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside <GameProvider>')
  return value
}
