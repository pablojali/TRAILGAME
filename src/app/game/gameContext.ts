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
import type { IncompatibleReason } from '../../repositories/gameRepository'

export type GamePhase =
  /** No career yet: the player must choose a profile. `replacing` explains what will be overwritten. */
  | { kind: 'new-career'; replacing: IncompatibleReason | null }
  /** A save exists that cannot be loaded; nothing has been written. */
  | { kind: 'incompatible'; reason: IncompatibleReason }
  | { kind: 'playing'; state: GameState }

export interface DecayNotice {
  periods: number
  fitnessLost: number
}

export interface GameContextValue {
  phase: GamePhase
  /** True if the most recent change could not be saved. */
  saveFailed: boolean
  /** Fitness lost to inactivity when the game was last loaded or resumed. */
  decayNotice: DecayNotice | null
  dismissDecayNotice(): void
  /** Result of the most recent execution in this session, for feedback. */
  lastExecution: ExecutionResult | null
  /** Creates and saves a new career. Overwrites any existing save. */
  startCareer(profile: ProfileId, identity: AthleteIdentity): void
  /** From an incompatible save, goes to profile selection. Writes nothing. */
  beginRestart(): void
  /** Deletes the current career and returns to profile selection. */
  resetCareer(): void
  planSession(ref: DayRef, session: SessionType): TrainingError | null
  executeDay(ref: DayRef): TrainingError | null
  allocateAttributePoint(attribute: AttributeId, expectedSpent: number): AllocationError | null
  /** Pays `confirmedFee` once and records a pending entry. */
  enterRace(raceId: string, confirmedFee: number): RaceEntryError | null
  /** Buys an item once for `confirmedPrice` coins. */
  buyItem(itemId: string, confirmedPrice: number): BuyError | null
  /** Puts an owned item on (replacing the same slot) or takes it off. Cosmetic for now. */
  setItemEquipped(itemId: string, equipped: boolean): EquipError | null
  /** Changes the runner's look. Options above the runner's level are refused. */
  setAppearance(appearance: Appearance): AppearanceError | null
  /** Races a pending entry on the current day, once. Returns the result or the reason it failed. */
  raceDay(ref: DayRef, entryId: string): { ok: true; value: RaceDayResult } | { ok: false; error: RaceDayError }
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
