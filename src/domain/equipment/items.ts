import { ATTRIBUTE_IDS, type AttributeId, type Attributes } from '../athlete/athlete'

/**
 * Equipment items, shop prices and race effects (Game Design Bible §8; owner decisions,
 * 29 October 2026). Equipped items change the avatar and the race simulation; they never affect
 * training. Identifiers are stable and saved.
 *
 * Race effects are independent bonuses: attribute bonuses apply only inside the race simulation
 * while the item is equipped. They are never attribute points, do not count toward attribute
 * limits and never change base attributes, levels or training.
 */
export type EquipmentSlot = 'shoes' | 'pack' | 'poles'

/** Bonuses applied by the race simulation while the item is equipped. */
export interface RaceEffect {
  /** Added to the athlete's attributes for the race only. */
  attributes?: Partial<Record<AttributeId, number>>
  /** Multiplier on time on runnable (flat) segments; above 1 is slower. */
  runnable?: number
  /** Multiplier on time on descent segments. */
  descent?: number
  /** Multiplier on time on climb segments. */
  climb?: number
  /** Multiplier on the technical-descent penalty. */
  technicalPenalty?: number
  /** Multiplier on the slowdown over distance (wear). */
  slowdown?: number
}

export interface EquipmentItem {
  id: string
  label: string
  slot: EquipmentSlot
  /** 1 or 2; the starter shoes have none. */
  level?: number
  description: string
  /** Shop price in coins; 0 for starting equipment. */
  price: number
  raceEffect?: RaceEffect
  /** The race effect in words, for the shop and equipment lists. */
  effectText?: string
}

/**
 * Owner decisions (29 October 2026). Items bought before this catalog keep their id and become
 * Poles lvl 1, Hydration backpack lvl 1 and Technical trail shoes lvl 2 (no refund).
 */
export const EQUIPMENT_ITEMS: readonly EquipmentItem[] = [
  {
    id: 'starter-shoes',
    label: 'Starter shoes',
    slot: 'shoes',
    description: 'Basic trail-running shoes. Starting equipment.',
    price: 0,
  },
  {
    id: 'trail-shoes-basic',
    label: 'Trail shoes',
    slot: 'shoes',
    level: 1,
    description: 'A small all-round upgrade on the starter shoes.',
    price: 35,
    raceEffect: { attributes: { speed: 1, technical: 1 } },
    effectText: 'Races: Speed +1, Technical +1.',
  },
  {
    id: 'trail-shoes',
    label: 'Technical trail shoes',
    slot: 'shoes',
    level: 2,
    description: 'Grippy shoes for rocky and technical ground.',
    price: 70,
    raceEffect: { attributes: { technical: 4 }, technicalPenalty: 0.7 },
    effectText: 'Races: Technical +4, technical descents 30% easier.',
  },
  {
    id: 'trail-shoes-light',
    label: 'Light trail shoes',
    slot: 'shoes',
    level: 2,
    description: 'Fast on flats and descents, with less grip on technical ground.',
    price: 70,
    raceEffect: { attributes: { speed: 3 }, descent: 0.98, technicalPenalty: 1.3 },
    effectText: 'Races: Speed +3, descents 2% faster, but technical descents 30% harder.',
  },
  {
    id: 'poles',
    label: 'Poles',
    slot: 'poles',
    level: 1,
    description: 'Folding poles that help on climbs.',
    price: 25,
    raceEffect: { attributes: { climbing: 2, endurance: 1 }, runnable: 1.03 },
    effectText: 'Races: Climbing +2, Endurance +1, but flats 3% slower.',
  },
  {
    id: 'poles-2',
    label: 'Poles',
    slot: 'poles',
    level: 2,
    description: 'Light carbon poles.',
    price: 50,
    raceEffect: { attributes: { climbing: 3, endurance: 2 }, runnable: 1.01 },
    effectText: 'Races: Climbing +3, Endurance +2, but flats 1% slower.',
  },
  {
    id: 'hydration-backpack',
    label: 'Hydration backpack',
    slot: 'pack',
    level: 1,
    description: 'Carries water and food for long races.',
    price: 30,
    raceEffect: { attributes: { endurance: 2 }, slowdown: 0.9 },
    effectText: 'Races: Endurance +2, 10% less wear over distance.',
  },
  {
    id: 'hydration-backpack-2',
    label: 'Hydration backpack',
    slot: 'pack',
    level: 2,
    description: 'A larger, better-fitting race vest.',
    price: 90,
    raceEffect: { attributes: { endurance: 3 }, slowdown: 0.85 },
    effectText: 'Races: Endurance +3, 15% less wear over distance.',
  },
]

/** Every runner owns the starting equipment (§8.1). It starts unequipped (owner decision). */
export const OWNED_FROM_START: readonly string[] = ['starter-shoes']

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS.find((item) => item.id === id)
}

/** "Poles · Lvl 2": the name shown for an item. */
export function itemName(item: EquipmentItem): string {
  return item.level ? `${item.label} · Lvl ${item.level}` : item.label
}

export interface CombinedRaceEffect {
  attributes: Attributes
  runnable: number
  descent: number
  climb: number
  technicalPenalty: number
  slowdown: number
}

/** Combined race effect of the equipped items: attribute bonuses add up, multipliers multiply. */
export function getRaceEffect(equipment: readonly string[]): CombinedRaceEffect {
  const effect: CombinedRaceEffect = {
    attributes: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])) as Attributes,
    runnable: 1,
    descent: 1,
    climb: 1,
    technicalPenalty: 1,
    slowdown: 1,
  }
  for (const id of equipment) {
    const item = getEquipmentItem(id)?.raceEffect
    if (!item) continue
    for (const [attribute, bonus] of Object.entries(item.attributes ?? {})) {
      effect.attributes[attribute as AttributeId] += bonus ?? 0
    }
    effect.runnable *= item.runnable ?? 1
    effect.descent *= item.descent ?? 1
    effect.climb *= item.climb ?? 1
    effect.technicalPenalty *= item.technicalPenalty ?? 1
    effect.slowdown *= item.slowdown ?? 1
  }
  return effect
}
