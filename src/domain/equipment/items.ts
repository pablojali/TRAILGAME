/**
 * Equipment items (Game Design Bible §8). Cosmetic for now: equipping an item only changes the
 * avatar. Items have no effect on training or races until the equipment system defines one.
 * Identifiers are stable and saved.
 */
export type EquipmentSlot = 'shoes'

export interface EquipmentItem {
  id: string
  label: string
  slot: EquipmentSlot
  description: string
}

export const EQUIPMENT_ITEMS: readonly EquipmentItem[] = [
  {
    id: 'starter-shoes',
    label: 'Starter shoes',
    slot: 'shoes',
    description: 'Basic trail-running shoes. Starting equipment.',
  },
]

/** Every runner owns the starting equipment (§8.1). It starts unequipped (owner decision). */
export const OWNED_FROM_START: readonly string[] = ['starter-shoes']

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS.find((item) => item.id === id)
}
