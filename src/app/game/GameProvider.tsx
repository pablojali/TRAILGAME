import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AttributeId, ProfileId } from '../../domain/athlete/athlete'
import type { SessionType } from '../../domain/training/sessions'
import { allocateAttributePoint } from '../../game-engine/attributes'
import { applyFitnessDecay } from '../../game-engine/fitnessDecay'
import { createInitialGameState, type AthleteIdentity, type GameState } from '../../game-engine/gameState'
import type { Appearance } from '../../domain/athlete/appearance'
import { setAppearance } from '../../game-engine/appearance'
import { buyItem, setItemEquipped } from '../../game-engine/equipment'
import { enterRace, raceCurrentDay } from '../../game-engine/races'
import * as engine from '../../game-engine/training'
import type { DayRef, ExecutionResult } from '../../game-engine/training'
import {
  createLocalStorageGameRepository,
  IncompatibleSaveError,
  type GameRepository,
} from '../../repositories/gameRepository'
import type { CloudSync } from '../../repositories/cloudSync'
import { createSaveQueue } from '../../repositories/saveQueue'
import { getCloudSync } from '../../repositories/supabase/cloudSave'
import { getPlayerIdentity, type PlayerIdentity } from '../../repositories/supabase/playerIdentity'
import { GameContext, type CloudNotice, type DecayNotice, type GameContextValue, type GamePhase } from './gameContext'

/** With no career on this device, how long the game waits for one in the cloud before offering a new career. */
export const CLOUD_RESTORE_WAIT_MS = 3_000

interface GameProviderProps {
  children: ReactNode
  /** Override for tests; defaults to localStorage. */
  repository?: GameRepository
  /** Current time in epoch ms. Override for tests; defaults to Date.now. */
  clock?: () => number
  /**
   * The player's Supabase identity; defaults to the configured one, or none (null) without
   * Supabase. It runs beside the game and never blocks it or touches the local save.
   */
  identity?: PlayerIdentity | null
  /** Cloud saves; defaults to the configured ones, or none (null) without Supabase. */
  cloud?: CloudSync | null
}

export function GameProvider({ children, repository, clock = Date.now, identity, cloud }: GameProviderProps) {
  // Latest clock, also read by the repository (decay reference fallback when loading).
  const clockRef = useRef(clock)
  useEffect(() => {
    clockRef.current = clock
  }, [clock])
  const [repo] = useState(() => repository ?? createLocalStorageGameRepository(undefined, () => clockRef.current()))
  const [phase, setPhase] = useState<GamePhase>({ kind: 'loading' })
  const [saveFailed, setSaveFailed] = useState(false)
  const [decayNotice, setDecayNotice] = useState<DecayNotice | null>(null)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [player] = useState(() => (identity === undefined ? getPlayerIdentity() : identity))
  const [sync] = useState(() => (cloud === undefined ? getCloudSync() : cloud))
  const [syncView, setSyncView] = useState(() => ({ status: sync ? sync.status() : ('off' as const), conflict: sync?.conflict() ?? null }))
  const [cloudNotice, setCloudNotice] = useState<CloudNotice | null>(null)
  // One queue for the provider's lifetime: saves never overlap and keep their order. Every career
  // stored on this device is then uploaded by the cloud sync (local first, cloud after).
  const [queue] = useState(() =>
    createSaveQueue(repo, (saved, state) => {
      setSaveFailed(!saved)
      if (saved) sync?.localSaved(state)
    }),
  )
  useEffect(() => () => queue.dispose(), [queue])

  // Anonymous sign-in in the background (Phase 2A): reuses the stored session, never blocks play.
  useEffect(() => {
    void player?.start()
    return () => player?.stop()
  }, [player])

  // Latest phase, read synchronously so rapid repeated actions see each other's result.
  const phaseRef = useRef(phase)

  const setPhaseNow = useCallback((next: GamePhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const commit = useCallback(
    (next: GamePhase) => {
      setPhaseNow(next)
      if (next.kind === 'playing') queue.save(next.state)
    },
    [queue, setPhaseNow],
  )

  /** Plays a career that came from the cloud (restored, chosen, or newer from another device). */
  const adoptCloudCareer = useCallback(
    (state: GameState, notice: CloudNotice) => {
      const decayed = applyFitnessDecay(state, clockRef.current())
      setLastExecution(null)
      setDecayNotice(decayed.periods > 0 ? { periods: decayed.periods, fitnessLost: decayed.fitnessLost } : null)
      commit({ kind: 'playing', state: decayed.state })
      setCloudNotice(notice)
    },
    [commit],
  )

  useEffect(() => {
    sync?.connect({
      adopt: (state) => adoptCloudCareer(state, phaseRef.current.kind === 'playing' ? 'updated' : 'restored'),
      changed: () => setSyncView({ status: sync.status(), conflict: sync.conflict() }),
    })
    function onOnline() {
      sync?.retry()
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      sync?.stop()
    }
  }, [sync, adoptCloudCareer])

  // Initial load. Game actions are refused until it finishes (no career is being played yet).
  useEffect(() => {
    let cancelled = false
    repo.load().then(
      async (state) => {
        if (cancelled) return
        if (state === null) {
          // No career here: a career saved in the cloud is restored (adopt) if it arrives soon;
          // otherwise the player can start one, and the cloud keeps being checked.
          if (sync) {
            await Promise.race([sync.start(null), new Promise((resolve) => setTimeout(resolve, CLOUD_RESTORE_WAIT_MS))])
            if (cancelled || phaseRef.current.kind !== 'loading') return
          }
          setPhaseNow({ kind: 'new-career', replacing: null })
          return
        }
        const decayed = applyFitnessDecay(state, clockRef.current())
        if (decayed.periods > 0) {
          setDecayNotice({ periods: decayed.periods, fitnessLost: decayed.fitnessLost })
        }
        // Decay applied while loading is saved once.
        if (decayed.state !== state) commit({ kind: 'playing', state: decayed.state })
        else setPhaseNow({ kind: 'playing', state })
        // Compared with the cloud in the background; play does not wait.
        void sync?.start(decayed.state)
      },
      (error: unknown) => {
        if (cancelled) return
        setPhaseNow(
          error instanceof IncompatibleSaveError
            ? { kind: 'incompatible', reason: error.reason }
            : { kind: 'load-failed' },
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [repo, commit, setPhaseNow, loadAttempt, sync])

  const retryLoad = useCallback(() => {
    if (phaseRef.current.kind !== 'load-failed') return
    setPhaseNow({ kind: 'loading' })
    setLoadAttempt((n) => n + 1)
  }, [setPhaseNow])

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

  // Apply decay when the player returns to the app, and retry a failed save.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      currentState()
      queue.retry()
      sync?.retry()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [currentState, queue, sync])

  const startCareer = useCallback(
    (profile: ProfileId, identity: AthleteIdentity) => {
      setLastExecution(null)
      setDecayNotice(null)
      const state = createInitialGameState(profile, clockRef.current(), identity)
      // Saved locally, then uploaded by the cloud sync (created there once).
      commit({ kind: 'playing', state })
    },
    [commit],
  )

  const beginRestart = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'incompatible') return
    setPhaseNow({ kind: 'new-career', replacing: current.reason })
  }, [setPhaseNow])

  const resetCareer = useCallback(() => {
    if (phaseRef.current.kind !== 'playing') return
    // Queued after any earlier save, so an older write cannot bring the career back.
    void queue.clear()
    setPhaseNow({ kind: 'new-career', replacing: null })
    setSaveFailed(false)
    setDecayNotice(null)
    setLastExecution(null)
  }, [queue, setPhaseNow])

  const resolveSyncConflict = useCallback(
    async (choice: 'local' | 'cloud') => {
      if (!sync) return false
      const result = await sync.resolve(choice)
      if (!result.ok) return false
      if (result.adopt) adoptCloudCareer(result.adopt, 'restored')
      return true
    },
    [sync, adoptCloudCareer],
  )

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

  const equip = useCallback(
    (itemId: string, equipped: boolean) => {
      const state = currentState()
      if (!state) return 'unknown-item' as const
      const result = setItemEquipped(state, itemId, equipped)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState],
  )

  const buy = useCallback(
    (itemId: string, confirmedPrice: number) => {
      const state = currentState()
      if (!state) return 'unknown-item' as const
      const result = buyItem(state, itemId, confirmedPrice)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState],
  )

  const changeAppearance = useCallback(
    (appearance: Appearance) => {
      const state = currentState()
      if (!state) return 'invalid' as const
      const result = setAppearance(state, appearance)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      phase,
      saveFailed,
      retryLoad,
      cloudStatus: syncView.status,
      syncConflict: syncView.conflict,
      resolveSyncConflict,
      retrySync: () => sync?.retry(),
      cloudNotice,
      dismissCloudNotice: () => setCloudNotice(null),
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
      setItemEquipped: equip,
      buyItem: buy,
      setAppearance: changeAppearance,
    }),
    [
      phase,
      saveFailed,
      retryLoad,
      sync,
      syncView,
      resolveSyncConflict,
      cloudNotice,
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
      equip,
      buy,
      changeAppearance,
    ],
  )

  return <GameContext value={value}>{children}</GameContext>
}
