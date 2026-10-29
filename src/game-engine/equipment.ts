import { getEquipmentItem, OWNED_FROM_START } from '../domain/equipment/items'
import type { GameState } from './gameState'

export type EquipError = 'unknown-item' | 'not-owned'

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
  if (!OWNED_FROM_START.includes(itemId)) return { ok: false, error: 'not-owned' }
  const others = state.equipment.filter((id) => id !== itemId && getEquipmentItem(id)?.slot !== item.slot)
  return { ok: true, state: { ...state, equipment: equipped ? [...others, itemId] : others } }
}

export function isEquipped(state: GameState, itemId: string): boolean {
  return state.equipment.includes(itemId)
}
