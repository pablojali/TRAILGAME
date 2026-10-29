import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AttributeId, ProfileId } from '../../domain/athlete/athlete'
import type { SessionType } from '../../domain/training/sessions'
import { allocateAttributePoint } from '../../game-engine/attributes'
import { applyFitnessDecay } from '../../game-engine/fitnessDecay'
import { createInitialGameState, type AthleteIdentity, type GameState } from '../../game-engine/gameState'
import { enterRace, raceCurrentDay } from '../../game-engine/races'
import * as engine from '../../game-engine/training'
import type { DayRef, ExecutionResult } from '../../game-engine/training'
import { createLocalStorageGameRepository, type GameRepository } from '../../repositories/gameRepository'
import { GameContext, type DecayNotice, type GameContextValue, type GamePhase } from './gameContext'

interface GameProviderProps {
  children: ReactNode
  /** Override for tests; defaults to localStorage. */
  repository?: GameRepository
  /** Current time in epoch ms. Override for tests; defaults to Date.now. */
  clock?: () => number
}

interface InitialLoad {
  phase: GamePhase
  decay: DecayNotice | null
}

function loadInitial(repo: GameRepository, now: number): InitialLoad {
  const result = repo.load(now)
  if (result.status === 'empty') return { phase: { kind: 'new-career', replacing: null }, decay: null }
  if (result.status === 'incompatible') {
    return { phase: { kind: 'incompatible', reason: result.reason }, decay: null }
  }
  const decayed = applyFitnessDecay(result.state, now)
  return {
    phase: { kind: 'playing', state: decayed.state },
    decay: decayed.periods > 0 ? { periods: decayed.periods, fitnessLost: decayed.fitnessLost } : null,
  }
}

export function GameProvider({ children, repository, clock = Date.now }: GameProviderProps) {
  const [repo] = useState(() => repository ?? createLocalStorageGameRepository())
  const [initial] = useState(() => loadInitial(repo, clock()))
  const [phase, setPhase] = useState<GamePhase>(initial.phase)
  const [saveFailed, setSaveFailed] = useState(false)
  const [decayNotice, setDecayNotice] = useState<DecayNotice | null>(initial.decay)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)

  // Latest phase, read synchronously so rapid repeated actions see each other's result.
  const phaseRef = useRef(phase)
  const clockRef = useRef(clock)
  useEffect(() => {
    clockRef.current = clock
  }, [clock])

  const commit = useCallback(
    (next: GamePhase) => {
      phaseRef.current = next
      setPhase(next)
      if (next.kind === 'playing') setSaveFailed(!repo.save(next.state))
    },
    [repo],
  )

  /** Current career with any due Fitness decay applied (and announced), or null. */
  const currentState = useCallback((): GameState | null => {
    const current = phaseRef.current
    if (current.kind !== 'playing') return null
    const decayed = applyFitnessDecay(current.state, clockRef.current())
    if (decayed.state !== current.state) {
      commit({ kind: 'playing', state: decayed.state })
      if (decayed.periods > 0) {
        setDecayNotice({ periods: decayed.periods, fitnessLost: decayed.fitnessLost })
      }
    }
    return decayed.state
  }, [commit])

  // Persist decay applied while loading, once.
  useEffect(() => {
    if (initial.phase.kind === 'playing' && initial.decay) {
      setSaveFailed(!repo.save(initial.phase.state))
    }
  }, [initial, repo])

  // Apply decay when the player returns to the app.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') currentState()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [currentState])

  const startCareer = useCallback(
    (profile: ProfileId, identity: AthleteIdentity) => {
      setLastExecution(null)
      setDecayNotice(null)
      commit({ kind: 'playing', state: createInitialGameState(profile, clockRef.current(), identity) })
    },
    [commit],
  )

  const beginRestart = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'incompatible') return
    const next: GamePhase = { kind: 'new-career', replacing: current.reason }
    phaseRef.current = next
    setPhase(next)
  }, [])

  const resetCareer = useCallback(() => {
    repo.clear()
    const next: GamePhase = { kind: 'new-career', replacing: null }
    phaseRef.current = next
    setPhase(next)
    setSaveFailed(false)
    setDecayNotice(null)
    setLastExecution(null)
  }, [repo])

  const planSession = useCallback(
    (ref: DayRef, session: SessionType) => {
      const state = currentState()
      if (!state) return 'wrong-week' as const
      const result = engine.planSession(state, ref, session)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.value })
      return null
    },
    [commit, currentState],
  )

  const executeDay = useCallback(
    (ref: DayRef) => {
      const state = currentState()
      if (!state) return 'wrong-week' as const
      const result = engine.executeCurrentDay(state, ref, clockRef.current())
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.value.state })
      setLastExecution(result.value)
      return null
    },
    [commit, currentState],
  )

  const allocate = useCallback(
    (attribute: AttributeId, expectedSpent: number) => {
      const state = currentState()
      if (!state) return 'stale-request' as const
      const result = allocateAttributePoint(state, attribute, expectedSpent)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState],
  )

  const enter = useCallback(
    (raceId: string, confirmedFee: number) => {
      const state = currentState()
      if (!state) return 'unknown-race' as const
      const result = enterRace(state, raceId, confirmedFee, clockRef.current())
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState],
  )

  const race = useCallback(
    (ref: DayRef, entryId: string) => {
      const state = currentState()
      if (!state) return { ok: false as const, error: 'wrong-week' as const }
      const result = raceCurrentDay(state, ref, entryId, clockRef.current())
      if (!result.ok) return result
      commit({ kind: 'playing', state: result.value.state })
      // The last training feedback no longer describes the latest day.
      setLastExecution(null)
      return result
    },
    [commit, currentState],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      phase,
      saveFailed,
      decayNotice,
      dismissDecayNotice: () => setDecayNotice(null),
      lastExecution,
      startCareer,
      beginRestart,
      resetCareer,
      planSession,
      executeDay,
      allocateAttributePoint: allocate,
      enterRace: enter,
      raceDay: race,
    }),
    [
      phase,
      saveFailed,
      decayNotice,
      lastExecution,
      startCareer,
      beginRestart,
      resetCareer,
      planSession,
      executeDay,
      allocate,
      enter,
      race,
    ],
  )

  return <GameContext value={value}>{children}</GameContext>
}
