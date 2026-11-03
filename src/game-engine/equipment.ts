import { consumableKinds, getEquipmentItem, isConsumable } from '../domain/equipment/items'
import type { GameState } from './gameState'

/** `consumable`: gels and bars are counted and taken to a race, never equipped. */
export type EquipError = 'unknown-item' | 'not-owned' | 'consumable'

export type BuyError =
  | 'unknown-item'
  | 'already-owned'
  | 'insufficient-coins'
  /** The price the player confirmed is not the current price. */
  | 'price-changed'
  /** The item has no price. */
  | 'not-for-sale'

/**
 * Puts an owned item on, replacing the item in the same slot, or takes it off. Cosmetic for now:
 * nothing else in the state changes.
 */
export function setItemEquipped(
  state: GameState,
  itemId: string,
  equipped: boolean,
): { ok: true; state: GameState } | { ok: false; error: EquipError } {
  const item = getEquipmentItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  if (isConsumable(item)) return { ok: false, error: 'consumable' }
  if (!state.ownedEquipment.includes(itemId)) return { ok: false, error: 'not-owned' }
  const others = state.equipment.filter((id) => id !== itemId && getEquipmentItem(id)?.slot !== item.slot)
  return { ok: true, state: { ...state, equipment: equipped ? [...others, itemId] : others } }
}

export function isEquipped(state: GameState, itemId: string): boolean {
  return state.equipment.includes(itemId)
}

/**
 * Buys an item once, paying `confirmedPrice` (the price the player saw). The coins can never go
 * below 0, and a repeated request is rejected because the item is already owned. Buying does not
 * equip the item. A consumable (gel, cereal bar) is bought as a pack, any number of times: it adds
 * the pack's units to the runner's stock (a repeated request is caught by the operation id).
 */
export function buyItem(
  state: GameState,
  itemId: string,
  confirmedPrice: number,
): { ok: true; state: GameState } | { ok: false; error: BuyError } {
  const item = getEquipmentItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  const consumable = isConsumable(item)
  if (!consumable && state.ownedEquipment.includes(itemId)) return { ok: false, error: 'already-owned' }
  if (item.price === null) return { ok: false, error: 'not-for-sale' }
  if (item.price !== confirmedPrice) return { ok: false, error: 'price-changed' }
  if (item.price > state.coins) return { ok: false, error: 'insufficient-coins' }
  if (consumable) {
    const consumables = { ...state.consumables }
    for (const kind of consumableKinds(item)) consumables[kind] += item.packSize
    return { ok: true, state: { ...state, coins: state.coins - item.price, consumables } }
  }
  return {
    ok: true,
    state: { ...state, coins: state.coins - item.price, ownedEquipment: [...state.ownedEquipment, itemId] },
  }
}
