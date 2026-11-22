import { EQUIPMENT_ITEMS, getEquipmentItem } from '../domain/equipment/items'
import { lifeShare, roundUsed, WEAR, wearOn, wears, wearStatus, type WearConfig, type WearStatus } from '../domain/equipment/wear'
import { fnv1a, mulberry32 } from './raceSimulation'
import type { GameState } from './gameState'

/**
 * Equipment wear on the career (brief B-6a; rules in src/domain/equipment/wear.ts). Everything here
 * is run by the server's operations through the engine, never decided by the client. With
 * wear_speed 0 nothing here changes the career.
 */

/** Share of an item's life already used (0 when it never wore). */
export function usedOf(state: GameState, itemId: string): number {
  return state.wear?.[itemId] ?? 0
}

/**
 * Wears the given items (the equipped ones by default) by `km`. Items with no life never wear; gear
 * at the end of its life stays at 0 % (wear never goes past it).
 */
export function applyWear(state: GameState, km: number, config: WearConfig = WEAR, itemIds: readonly string[] = state.equipment): GameState {
  if (!wearOn(config) || !(km > 0)) return state
  const wear = { ...state.wear }
  let changed = false
  for (const id of itemIds) {
    const item = getEquipmentItem(id)
    if (!wears(item) || !state.ownedEquipment.includes(id)) continue
    const used = roundUsed((wear[id] ?? 0) + lifeShare(item, km, config))
    if (used === (wear[id] ?? 0)) continue
    wear[id] = used
    changed = true
  }
  return changed ? { ...state, wear } : state
}

/** A replacement pair (or pack, poles…) is new: its wear goes back to none. */
export function resetWear(state: GameState, itemId: string): GameState {
  if (!state.wear || !(itemId in state.wear)) return state
  const wear = { ...state.wear }
  delete wear[itemId]
  return { ...state, wear }
}

/** The shoes the runner wears, if any. */
export function equippedShoes(state: GameState): string | undefined {
  return state.equipment.find((id) => getEquipmentItem(id)?.slot === 'shoes')
}

/** The wear of the shoes the runner wears (null: none equipped, they never wear, or wear is off). */
export function shoesStatus(state: GameState, config: WearConfig = WEAR): WearStatus | null {
  const shoes = equippedShoes(state)
  return shoes ? wearStatus(shoes, usedOf(state, shoes), config) : null
}

/** The wear of every owned item that wears (empty with wear off). */
export function gearStatus(state: GameState, config: WearConfig = WEAR): WearStatus[] {
  return state.ownedEquipment.flatMap((id) => wearStatus(id, usedOf(state, id), config) ?? [])
}

export type RaceGearError =
  /** The runner wears no shoes. */
  | 'no-shoes-equipped'
  /** The equipped shoes have no life left (0 %). */
  | 'shoes-worn-out'

/**
 * Whether the runner's kit lets them start a race (owner decision, 22 November 2026: "it is not
 * enough to have the money; the kit has to be ready"): shoes equipped, with life left. With wear off
 * nothing is checked, as before.
 */
export function raceGearError(state: GameState, config: WearConfig = WEAR): RaceGearError | null {
  if (!wearOn(config)) return null
  if (!equippedShoes(state)) return 'no-shoes-equipped'
  return shoesStatus(state, config)?.band?.raceStart === 'blocked' ? 'shoes-worn-out' : null
}

/** The chance, in percent, that a training session injures the runner because of their shoes. */
export function shoeInjuryRiskPct(state: GameState, config: WearConfig = WEAR): number {
  return shoesStatus(state, config)?.band?.injuryRiskPct ?? 0
}

/**
 * The draw for a worn-shoe injury, in [0, 100). Deterministic from the server's clock when the
 * session is completed and the day it completes, so the server and the tests agree; the client
 * cannot know it in advance (it does not choose the server's time) and a repeated request is
 * answered from its record, so it is never drawn twice.
 */
export function shoeInjuryDraw(now: number, week: number, dayIndex: number): number {
  return mulberry32(fnv1a(`shoe-injury|${now}|${week}|${dayIndex}`)) * 100
}

/** Owner decision (D8, 22 November 2026): the free pair is the starter shoes, new. */
export const EMERGENCY_PAIR_ID = 'starter-shoes'
/** At most one free pair every this many game weeks (B's guard, docs/EQUIPMENT_WEAR_CALIBRATION.md §7). */
export const EMERGENCY_PAIR_COOLDOWN_WEEKS = 8

/** The price of the cheapest shoes for sale. */
export function cheapestShoesPrice(): number {
  const prices = EQUIPMENT_ITEMS.filter((item) => item.slot === 'shoes' && item.price !== null).map((item) => item.price!)
  return prices.length ? Math.min(...prices) : 0
}

/**
 * True when the runner owns a pair that can race without breaking: above the DNF band (a race-start
 * of `ok`), or shoes that never wear.
 */
export function hasRaceablePair(state: GameState, config: WearConfig = WEAR): boolean {
  return state.ownedEquipment.some((id) => {
    const item = getEquipmentItem(id)
    if (item?.slot !== 'shoes') return false
    const status = wearStatus(id, usedOf(state, id), config)
    return status === null || status.band?.raceStart === 'ok'
  })
}

/**
 * The free emergency pair (brief B-6c, owner decision of 22 November 2026; the guard of
 * docs/EQUIPMENT_WEAR_CALIBRATION.md §7). Checked only at the moment wear is applied (a training
 * day, a race finish, a Major result): if that wear took the runner's last pair above the 9–1 %
 * band into it or below, and the coins are then below the cheapest pair for sale, the runner gets
 * new starter shoes, equipped, at most once every 8 game weeks. `before` is the career before that
 * wear, `after` the career once the day or race is done (coins included); `week` is the game week
 * of that day or race.
 */
export function withEmergencyPair(
  before: GameState,
  after: GameState,
  week: number,
  config: WearConfig = WEAR,
): { state: GameState; granted: boolean } {
  const no = { state: after, granted: false }
  if (!wearOn(config)) return no
  if (!hasRaceablePair(before, config) || hasRaceablePair(after, config)) return no
  if (after.coins >= cheapestShoesPrice()) return no
  if (after.emergencyPairWeek !== undefined && week - after.emergencyPairWeek < EMERGENCY_PAIR_COOLDOWN_WEEKS) return no
  const fresh = resetWear(after, EMERGENCY_PAIR_ID)
  const owned = fresh.ownedEquipment.includes(EMERGENCY_PAIR_ID) ? fresh.ownedEquipment : [...fresh.ownedEquipment, EMERGENCY_PAIR_ID]
  const equipment = [...fresh.equipment.filter((id) => getEquipmentItem(id)?.slot !== 'shoes'), EMERGENCY_PAIR_ID]
  return { state: { ...fresh, ownedEquipment: owned, equipment, emergencyPairWeek: week }, granted: true }
}
