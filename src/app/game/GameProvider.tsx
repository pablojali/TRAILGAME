import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AttributeId, ProfileId } from '../../domain/athlete/athlete'
import type { SessionType } from '../../domain/training/sessions'
import { allocateAttributePoint, type AllocationError } from '../../game-engine/attributes'
import { applyFitnessDecay } from '../../game-engine/fitnessDecay'
import { createInitialGameState, type AthleteIdentity, type GameState } from '../../game-engine/gameState'
import type { Appearance } from '../../domain/athlete/appearance'
import { setAppearance } from '../../game-engine/appearance'
import { buyItem, setItemEquipped, type BuyError, type EquipError } from '../../game-engine/equipment'
import { enterRace, raceCurrentDay, type RaceDayError, type RaceDayResult, type RaceEntryError } from '../../game-engine/races'
import * as engine from '../../game-engine/training'
import type { DayRef, ExecutionResult, TrainingError } from '../../game-engine/training'
import {
  createLocalStorageGameRepository,
  IncompatibleSaveError,
  type GameRepository,
} from '../../repositories/gameRepository'
import type { CloudSync } from '../../repositories/cloudSync'
import { createSaveQueue } from '../../repositories/saveQueue'
import type { CareerOpRequest } from '../../server/careerOps'
import type { CareerOpsCall, ServerError } from '../../repositories/supabase/careerOpsClient'
import { getCareerOps, getCloudSync } from '../../repositories/supabase/cloudSave'
import { getPlayerIdentity, type PlayerIdentity } from '../../repositories/supabase/playerIdentity'
import {
  GameContext,
  type CloudNotice,
  type DecayNotice,
  type GameContextValue,
  type GamePhase,
  type StartCareerError,
} from './gameContext'

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
  /**
   * Server operations (Phase 3B.1): with them, training days, race days, attribute points and
   * new careers are decided by the server; without (no Supabase), by the local engine.
   */
  ops?: CareerOpsCall | null
}

/** A brand-new career (nothing earned yet): the only kind a device may put in place of the cloud's. */
function isFreshCareer(state: GameState): boolean {
  return (
    state.athlete.xp === 0 &&
    state.week.number === 1 &&
    state.week.currentDayIndex === 0 &&
    state.raceEntries.every((entry) => entry.status === 'pending')
  )
}

/** Server errors that mean "try again" (the same operation id is reused, so it is never applied twice). */
const RETRYABLE = new Set(['offline', 'server-error', 'busy'])

/** A game-rule refusal from the server keeps its code; anything else is offline or a server error. */
function serverError<T extends string>(error: string): T | ServerError {
  if (error === 'offline') return 'offline'
  if (RETRYABLE.has(error) || ['no-career', 'cloud-unreadable', 'forbidden', 'unauthorized', 'bad-request', 'conflict'].includes(error)) {
    return 'server-error'
  }
  return error as T
}

export function GameProvider({ children, repository, clock = Date.now, identity, cloud, ops: opsProp }: GameProviderProps) {
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
  const [ops] = useState(() => (opsProp === undefined ? getCareerOps() : opsProp))
  /** Operation ids of server operations not yet answered, reused when the player retries. */
  const pendingOps = useRef(new Map<string, string>())
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
    (state: GameState, notice: CloudNotice | null) => {
      const decayed = applyFitnessDecay(state, clockRef.current())
      setLastExecution(null)
      setDecayNotice(decayed.periods > 0 ? { periods: decayed.periods, fitnessLost: decayed.fitnessLost } : null)
      commit({ kind: 'playing', state: decayed.state })
      if (notice) setCloudNotice(notice)
    },
    [commit],
  )

  /**
   * Runs a server operation (Phase 3B.1). On success the server's career becomes the active one
   * (and the synced one). Nothing is awarded locally on failure; a retryable failure keeps the
   * operation id so a retry can never apply it twice. A refusal by a game rule also returns the
   * server's career, which replaces a stale local one.
   */
  const runServerOp = useCallback(
    async (key: string, build: (operationId: string) => CareerOpRequest) => {
      if (!ops) throw new Error('No server operations')
      const operationId = pendingOps.current.get(key) ?? crypto.randomUUID()
      pendingOps.current.set(key, operationId)
      const response = await ops(build(operationId))
      if (response.ok || !RETRYABLE.has(response.error)) pendingOps.current.delete(key)
      const confirmed = response.ok ? response : 'state' in response && response.state && typeof response.version === 'number' ? response : null
      if (confirmed && confirmed.state && typeof confirmed.version === 'number') {
        sync?.confirmed(confirmed.state, confirmed.version)
        commit({ kind: 'playing', state: confirmed.state })
      }
      return response
    },
    [ops, sync, commit],
  )

  useEffect(() => {
    sync?.connect({
      adopt: (state, quiet) => adoptCloudCareer(state, quiet ? null : phaseRef.current.kind === 'playing' ? 'updated' : 'restored'),
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
    async (profile: ProfileId, identity: AthleteIdentity): Promise<StartCareerError | null> => {
      setLastExecution(null)
      setDecayNotice(null)
      if (!ops) {
        // Local game: saved locally (and uploaded by the cloud sync, if any).
        commit({ kind: 'playing', state: createInitialGameState(profile, clockRef.current(), identity) })
        return null
      }
      // The server builds the career (and replaces the cloud one after a reset).
      const response = await ops({ action: 'new-career', baseVersion: sync?.knownVersion() ?? null, profile, identity })
      if (response.ok) {
        sync?.confirmed(response.state, response.version)
        commit({ kind: 'playing', state: response.state })
        return null
      }
      if (response.error === 'conflict') {
        // The account already has a cloud career: compare again (it is restored if this device has none).
        sync?.refresh(phaseRef.current.kind === 'playing' ? phaseRef.current.state : null)
        return 'cloud-career-exists'
      }
      return response.error === 'offline' ? 'offline' : 'server-error'
    },
    [commit, ops, sync],
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
      const conflict = sync.conflict()
      if (choice === 'local' && ops && conflict) {
        // The server keeps progression: only a brand-new career may replace the cloud's, rebuilt there.
        // A damaged cloud copy can also be replaced by a new career for this device's runner.
        if (!isFreshCareer(conflict.local) && conflict.remote) return false
        const { profile, name, sex, appearance } = conflict.local.athlete
        const response = await ops({
          action: 'new-career',
          baseVersion: conflict.remoteVersion,
          profile,
          identity: { name, sex, appearance },
        })
        if (!response.ok) return false
        sync.confirmed(response.state, response.version)
        commit({ kind: 'playing', state: response.state })
        return true
      }
      const result = await sync.resolve(choice)
      if (!result.ok) return false
      if (result.adopt) adoptCloudCareer(result.adopt, 'restored')
      return true
    },
    [sync, adoptCloudCareer, ops, commit],
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
    async (ref: DayRef): Promise<TrainingError | ServerError | null> => {
      const state = currentState()
      if (!state) return 'wrong-week'
      if (ops) {
        const session = state.week.days[ref.dayIndex]?.session ?? 'rest'
        const response = await runServerOp(`train:${ref.week}:${ref.dayIndex}`, (operationId) => ({
          action: 'train',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          ref,
          session,
        }))
        if (!response.ok) return serverError<TrainingError>(response.error)
        setLastExecution({ ...(response.result as Omit<ExecutionResult, 'state'>), state: response.state })
        return null
      }
      const result = engine.executeCurrentDay(state, ref, clockRef.current())
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.value.state })
      setLastExecution(result.value)
      return null
    },
    [commit, currentState, ops, runServerOp, sync],
  )

  const allocate = useCallback(
    async (attribute: AttributeId, expectedSpent: number): Promise<AllocationError | ServerError | null> => {
      const state = currentState()
      if (!state) return 'stale-request'
      if (ops) {
        const response = await runServerOp(`allocate:${expectedSpent}`, (operationId) => ({
          action: 'allocate',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          attribute,
          expectedSpent,
        }))
        return response.ok ? null : serverError<AllocationError>(response.error)
      }
      const result = allocateAttributePoint(state, attribute, expectedSpent)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState, ops, runServerOp, sync],
  )

  const enter = useCallback(
    async (raceId: string, confirmedFee: number): Promise<RaceEntryError | ServerError | null> => {
      const state = currentState()
      if (!state) return 'unknown-race'
      if (ops) {
        const response = await runServerOp(`enter:${raceId}`, (operationId) => ({
          action: 'enter-race',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          raceId,
          fee: confirmedFee,
        }))
        return response.ok ? null : serverError<RaceEntryError>(response.error)
      }
      const result = enterRace(state, raceId, confirmedFee, clockRef.current())
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState, ops, runServerOp, sync],
  )

  const race = useCallback(
    async (
      ref: DayRef,
      entryId: string,
    ): Promise<{ ok: true; value: RaceDayResult } | { ok: false; error: RaceDayError | ServerError }> => {
      const state = currentState()
      if (!state) return { ok: false as const, error: 'wrong-week' as const }
      if (ops) {
        const response = await runServerOp(`race:${entryId}`, (operationId) => ({
          action: 'race',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          ref,
          entryId,
        }))
        if (!response.ok) return { ok: false, error: serverError<RaceDayError>(response.error) }
        setLastExecution(null)
        return { ok: true, value: { ...(response.result as Omit<RaceDayResult, 'state'>), state: response.state } }
      }
      const result = raceCurrentDay(state, ref, entryId, clockRef.current())
      if (!result.ok) return result
      commit({ kind: 'playing', state: result.value.state })
      // The last training feedback no longer describes the latest day.
      setLastExecution(null)
      return result
    },
    [commit, currentState, ops, runServerOp, sync],
  )

  const equip = useCallback(
    async (itemId: string, equipped: boolean): Promise<EquipError | ServerError | null> => {
      const state = currentState()
      if (!state) return 'unknown-item'
      if (ops) {
        const response = await runServerOp(`equip:${itemId}:${equipped}`, (operationId) => ({
          action: 'equip',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          itemId,
          equipped,
        }))
        return response.ok ? null : serverError<EquipError>(response.error)
      }
      const result = setItemEquipped(state, itemId, equipped)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState, ops, runServerOp, sync],
  )

  const buy = useCallback(
    async (itemId: string, confirmedPrice: number): Promise<BuyError | ServerError | null> => {
      const state = currentState()
      if (!state) return 'unknown-item'
      if (ops) {
        const response = await runServerOp(`buy:${itemId}`, (operationId) => ({
          action: 'buy',
          operationId,
          baseVersion: sync?.knownVersion() ?? null,
          snapshot: state,
          itemId,
          price: confirmedPrice,
        }))
        return response.ok ? null : serverError<BuyError>(response.error)
      }
      const result = buyItem(state, itemId, confirmedPrice)
      if (!result.ok) return result.error
      commit({ kind: 'playing', state: result.state })
      return null
    },
    [commit, currentState, ops, runServerOp, sync],
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
      canKeepDeviceCareer: !ops || (syncView.conflict ? isFreshCareer(syncView.conflict.local) : false),
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
      ops,
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
