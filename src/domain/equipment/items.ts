/**
 * Equipment items and shop prices (Game Design Bible §8; owner decisions, 29 October 2026).
 * Items change the avatar; race effects are proposed separately and need owner approval, so for
 * now no item affects training or races. Identifiers are stable and saved.
 */
export type EquipmentSlot = 'shoes' | 'pack' | 'poles'

export interface EquipmentItem {
  id: string
  label: string
  slot: EquipmentSlot
  description: string
  /** Shop price in coins; 0 for starting equipment. */
  price: number
}

export const EQUIPMENT_ITEMS: readonly EquipmentItem[] = [
  {
    id: 'starter-shoes',
    label: 'Starter shoes',
    slot: 'shoes',
    description: 'Basic trail-running shoes. Starting equipment.',
    price: 0,
  },
  {
    id: 'trail-shoes',
    label: 'Trail shoes',
    slot: 'shoes',
    description: 'Grippy shoes for rocky and technical ground.',
    price: 200,
  },
  {
    id: 'hydration-backpack',
    label: 'Hydration backpack',
    slot: 'pack',
    description: 'Carries water and food for long races.',
    price: 150,
  },
  {
    id: 'poles',
    label: 'Poles',
    slot: 'poles',
    description: 'Folding poles that help on steep climbs.',
    price: 100,
  },
]

/** Every runner owns the starting equipment (§8.1). It starts unequipped (owner decision). */
export const OWNED_FROM_START: readonly string[] = ['starter-shoes']

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS.find((item) => item.id === id)
}
