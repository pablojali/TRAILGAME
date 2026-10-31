import { createContext, useContext } from 'react'
import type { Appearance } from '../../domain/athlete/appearance'
import type { AttributeId, ProfileId } from '../../domain/athlete/athlete'
import type { SessionType } from '../../domain/training/sessions'
import type { AppearanceError } from '../../game-engine/appearance'
import type { AllocationError } from '../../game-engine/attributes'
import type { BuyError, EquipError } from '../../game-engine/equipment'
import type { AthleteIdentity, GameState } from '../../game-engine/gameState'
import type { RaceDayError, RaceDayResult, RaceEntryError } from '../../game-engine/races'
import type { DayRef, ExecutionResult, TrainingError } from '../../game-engine/training'
import type { SyncConflict, SyncStatus } from '../../repositories/cloudSync'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'

export type GamePhase =
  /** The saved career is being read; game actions are refused until it is. */
  | { kind: 'loading' }
  /** The save could not be read (not an incompatible save, e.g. storage unavailable). */
  | { kind: 'load-failed' }
  /** No career yet: the player must choose a profile. `replacing` explains what will be overwritten. */
  | { kind: 'new-career'; replacing: IncompatibleReason | null }
  /** A save exists that cannot be loaded; nothing has been written. */
  | { kind: 'incompatible'; reason: IncompatibleReason }
  | { kind: 'playing'; state: GameState }

/** A career came from the cloud: restored on this device, or newer from another device. */
export type CloudNotice = 'restored' | 'updated'

/** Why a new career could not be started on the server. */
export type StartCareerError = ServerError | 'cloud-career-exists'

export interface DecayNotice {
  periods: number
  fitnessLost: number
}

export interface GameContextValue {
  phase: GamePhase
  /** True if the most recent change could not be saved. */
  saveFailed: boolean
  /** After `load-failed`, reads the save again. */
  retryLoad(): void
  /** Cloud saves ('off' without Supabase). */
  cloudStatus: SyncStatus
  /** The device and the cloud hold different careers: the player must choose. */
  syncConflict: SyncConflict | null
  /** Keeps one career ('local': this device's; 'cloud': the account's). False if it failed. */
  resolveSyncConflict(choice: 'local' | 'cloud'): Promise<boolean>
  /**
   * Whether this device's career may replace the cloud one. With server operations only a
   * brand-new career may (progression is the server's).
   */
  canKeepDeviceCareer: boolean
  /** Tries the cloud again now. */
  retrySync(): void
  cloudNotice: CloudNotice | null
  dismissCloudNotice(): void
  /** Fitness lost to inactivity when the game was last loaded or resumed. */
  decayNotice: DecayNotice | null
  dismissDecayNotice(): void
  /** Result of the most recent execution in this session, for feedback. */
  lastExecution: ExecutionResult | null
  /** Creates and saves a new career. Overwrites any existing save. */
  startCareer(profile: ProfileId, identity: AthleteIdentity): Promise<StartCareerError | null>
  /** From an incompatible save, goes to profile selection. Writes nothing. */
  beginRestart(): void
  /** Deletes the current career and returns to profile selection. */
  resetCareer(): void
  planSession(ref: DayRef, session: SessionType): TrainingError | null
  /** Server-decided with Supabase: nothing is awarded unless the server confirms. */
  executeDay(ref: DayRef): Promise<TrainingError | ServerError | null>
  allocateAttributePoint(attribute: AttributeId, expectedSpent: number): Promise<AllocationError | ServerError | null>
  /** Pays `confirmedFee` once and records a pending entry. Server-decided with Supabase (Phase 3B.2). */
  enterRace(raceId: string, confirmedFee: number): Promise<RaceEntryError | ServerError | null>
  /** Buys an item once for `confirmedPrice` coins. Server-decided with Supabase (Phase 3B.2). */
  buyItem(itemId: string, confirmedPrice: number): Promise<BuyError | ServerError | null>
  /** Puts an owned item on (replacing the same slot) or takes it off. Server-decided with Supabase. */
  setItemEquipped(itemId: string, equipped: boolean): Promise<EquipError | ServerError | null>
  /** Changes the runner's look. Options above the runner's level are refused. */
  setAppearance(appearance: Appearance): AppearanceError | null
  /** Races a pending entry on the current day, once. Returns the result or the reason it failed. */
  raceDay(
    ref: DayRef,
    entryId: string,
  ): Promise<{ ok: true; value: RaceDayResult } | { ok: false; error: RaceDayError | ServerError }>
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame(): GameContextValue {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside <GameProvider>')
  return value
}

/** For screens that are only rendered while a career is being played. */
export function useCareer(): GameContextValue & { state: GameState } {
  const value = useGame()
  if (value.phase.kind !== 'playing') throw new Error('useCareer requires an active career')
  return { ...value, state: value.phase.state }
}
