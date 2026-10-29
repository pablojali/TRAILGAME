/**
 * Equipment items, shop prices and race effects (Game Design Bible §8; owner decisions,
 * 29 October 2026). Equipped items change the avatar and the race simulation; they never affect
 * training. Identifiers are stable and saved.
 */
export type EquipmentSlot = 'shoes' | 'pack' | 'poles'

/** Multipliers applied by the race simulation while the item is equipped (1 = no change). */
export interface RaceEffect {
  /** Time on climb segments. */
  climb?: number
  /** The technical-descent penalty. */
  technicalPenalty?: number
  /** The slowdown over distance. */
  slowdown?: number
}

export interface EquipmentItem {
  id: string
  label: string
  slot: EquipmentSlot
  description: string
  /** Shop price in coins; 0 for starting equipment. */
  price: number
  /** Race effect (owner approval, 29 October 2026); none for the starter shoes. */
  raceEffect?: RaceEffect
  /** The race effect in words, for the shop and equipment lists. */
  effectText?: string
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
    raceEffect: { technicalPenalty: 0.5 },
    effectText: 'Races: technical descents cost half as much time.',
  },
  {
    id: 'hydration-backpack',
    label: 'Hydration backpack',
    slot: 'pack',
    description: 'Carries water and food for long races.',
    price: 150,
    raceEffect: { slowdown: 0.8 },
    effectText: 'Races: 20% less slowdown over long distances.',
  },
  {
    id: 'poles',
    label: 'Poles',
    slot: 'poles',
    description: 'Folding poles that help on steep climbs.',
    price: 100,
    raceEffect: { climb: 0.96 },
    effectText: 'Races: climbs 4% faster.',
  },
]

/** Every runner owns the starting equipment (§8.1). It starts unequipped (owner decision). */
export const OWNED_FROM_START: readonly string[] = ['starter-shoes']

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS.find((item) => item.id === id)
}

/** Combined race effect of the equipped items (multipliers multiply). */
export function getRaceEffect(equipment: readonly string[]): Required<RaceEffect> {
  const effect = { climb: 1, technicalPenalty: 1, slowdown: 1 }
  for (const id of equipment) {
    const item = getEquipmentItem(id)?.raceEffect
    if (!item) continue
    effect.climb *= item.climb ?? 1
    effect.technicalPenalty *= item.technicalPenalty ?? 1
    effect.slowdown *= item.slowdown ?? 1
  }
  return effect
}
