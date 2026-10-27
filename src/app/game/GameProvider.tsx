import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionType } from '../../domain/training/sessions'
import type { GameState } from '../../game-engine/gameState'
import * as engine from '../../game-engine/training'
import type { DayRef, ExecutionResult } from '../../game-engine/training'
import {
  createLocalStorageGameRepository,
  type GameRepository,
  type LoadStatus,
} from '../../repositories/gameRepository'
import { GameContext, type GameContextValue } from './gameContext'

interface GameProviderProps {
  children: ReactNode
  /** Override for tests; defaults to localStorage. */
  repository?: GameRepository
}

export function GameProvider({ children, repository }: GameProviderProps) {
  const [repo] = useState(() => repository ?? createLocalStorageGameRepository())
  const [initial] = useState(() => repo.load())
  const [state, setState] = useState<GameState>(initial.state)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(initial.status)
  const [saveFailed, setSaveFailed] = useState(false)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)

  // Latest state, read synchronously so rapid repeated actions see each other's result.
  const stateRef = useRef(state)

  const commit = useCallback(
    (next: GameState) => {
      stateRef.current = next
      setState(next)
      setSaveFailed(!repo.save(next))
    },
    [repo],
  )

  const planSession = useCallback(
    (ref: DayRef, session: SessionType) => {
      const result = engine.planSession(stateRef.current, ref, session)
      if (!result.ok) return result.error
      commit(result.value)
      return null
    },
    [commit],
  )

  const executeDay = useCallback(
    (ref: DayRef) => {
      const result = engine.executeCurrentDay(stateRef.current, ref)
      if (!result.ok) return result.error
      commit(result.value.state)
      setLastExecution(result.value)
      return null
    },
    [commit],
  )

  const resetDemo = useCallback(() => {
    repo.clear()
    const fresh = repo.load()
    stateRef.current = fresh.state
    setState(fresh.state)
    setLoadStatus(fresh.status)
    setSaveFailed(false)
    setLastExecution(null)
  }, [repo])

  const value = useMemo<GameContextValue>(
    () => ({ state, loadStatus, saveFailed, lastExecution, planSession, executeDay, resetDemo }),
    [state, loadStatus, saveFailed, lastExecution, planSession, executeDay, resetDemo],
  )

  return <GameContext value={value}>{children}</GameContext>
}
