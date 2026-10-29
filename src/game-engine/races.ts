import { getLevel } from '../domain/athlete/levels'
import { getEntryFee } from '../domain/races/access'
import { getRace } from '../domain/races/races'
import type { GameState, RaceEntry } from './gameState'

export type RaceEntryError =
  | 'unknown-race'
  /** The race already has a pending entry: entering again would charge twice. */
  | 'already-entered'
  | 'insufficient-coins'
  /** The fee the player confirmed is not the fee that applies now (e.g. the level changed). */
  | 'fee-changed'

export type RaceEntryResult = { ok: true; state: GameState; entry: RaceEntry } | { ok: false; error: RaceEntryError }

export function getPendingEntry(state: GameState, raceId: string): RaceEntry | undefined {
  return state.raceEntries.find((entry) => entry.raceId === raceId && entry.status === 'pending')
}

/**
 * Enters a race and pays its fee once (Game Design Bible §10.3). `confirmedFee` is the fee the
 * player saw when confirming; the entry is rejected if it no longer applies. A repeated request is
 * rejected because the race already has a pending entry, so the fee cannot be charged twice.
 */
export function enterRace(state: GameState, raceId: string, confirmedFee: number, now: number): RaceEntryResult {
  const race = getRace(raceId)
  if (!race) return { ok: false, error: 'unknown-race' }
  if (getPendingEntry(state, raceId)) return { ok: false, error: 'already-entered' }
  const level = getLevel(state.athlete.xp)
  const { type, fee } = getEntryFee(race, level)
  if (fee !== confirmedFee) return { ok: false, error: 'fee-changed' }
  if (fee > state.coins) return { ok: false, error: 'insufficient-coins' }

  const entry: RaceEntry = {
    id: `entry-${state.raceEntries.length + 1}`,
    raceId,
    entryType: type,
    feePaid: fee,
    levelAtEntry: level,
    enteredAt: now,
    status: 'pending',
  }
  return {
    ok: true,
    entry,
    state: { ...state, coins: state.coins - fee, raceEntries: [...state.raceEntries, entry] },
  }
}
