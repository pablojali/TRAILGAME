import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import equipmentCsv from '../../data/equipment.csv?raw'
import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS, type AttributeId, type Attributes } from '../athlete/athlete'

/**
 * Equipment items, shop prices and race effects (Game Design Bible §8; owner decisions,
 * 29 October 2026). Equipped items change the avatar and the race simulation; they never affect
 * training. Identifiers are stable and saved.
 *
 * Race effects are independent bonuses: attribute bonuses apply only inside the race simulation
 * while the item is equipped. They are never attribute points, do not count toward attribute
 * limits and never change base attributes, levels or training.
 */
/**
 * `nutrition`: one pack with gels and cereal bars together (owner decision, 3 November 2026); `gel`
 * and `bar` packs of one kind still work.
 */
export type EquipmentSlot = 'shoes' | 'pack' | 'poles' | 'gel' | 'bar' | 'nutrition'

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
  /** Item level shown on its card; none for the starter shoes and consumables. */
  level?: number
  description: string
  /** Shop price in coins (of one pack for a consumable); 0 for starting equipment. null: not for sale. */
  price: number | null
  /**
   * Consumables only (gels and cereal bars): units in one pack. A consumable is counted, never
   * owned as a single item nor equipped; a race uses at most one of each (owner decision,
   * 1 November 2026).
   */
  packSize?: number
  raceEffect?: RaceEffect
  /** The race effect in words, for the shop and equipment lists. */
  effectText?: string
  /** Picture for the shop and equipment cards: a file in assets/ui/equipment. */
  thumbnail?: string
  /** Layer drawn on the runner: a file in assets/runner/avatar (e.g. `footwear/trail-shoes.webp`). */
  avatarLayer?: string
}

/** The columns of src/data/equipment.csv for the attribute bonuses and the time multipliers. */
const MULTIPLIER_COLUMNS = {
  flat: 'runnable',
  climb: 'climb',
  descent: 'descent',
  technical_penalty: 'technicalPenalty',
  wear: 'slowdown',
} as const satisfies Record<string, keyof Omit<RaceEffect, 'attributes'>>

const SLOTS: readonly EquipmentSlot[] = ['shoes', 'pack', 'poles', 'gel', 'bar', 'nutrition']

/** "10%" or "1.5%". */
function percentOf(multiplier: number): string {
  return `${Math.round(Math.abs(1 - multiplier) * 1000) / 10}%`
}

/** The race effect in words, written from the bonuses (e.g. "Races: Climbing +2, but flats 1% slower."). */
export function describeRaceEffect(effect: RaceEffect): string | undefined {
  const good: string[] = []
  const bad: string[] = []
  const attributes = Object.entries(effect.attributes ?? {}) as [AttributeId, number][]
  for (const [id, value] of [...attributes].sort((x, y) => y[1] - x[1])) {
    ;(value >= 0 ? good : bad).push(`${ATTRIBUTE_LABELS[id]} ${value >= 0 ? '+' : '−'}${Math.abs(value)}`)
  }
  const phrase = (m: number | undefined, better: (p: string) => string, worse: (p: string) => string) => {
    if (m === undefined || m === 1) return
    if (m < 1) good.push(better(percentOf(m)))
    else bad.push(worse(percentOf(m)))
  }
  phrase(effect.runnable, (p) => `flats ${p} faster`, (p) => `flats ${p} slower`)
  phrase(effect.climb, (p) => `climbs ${p} faster`, (p) => `climbs ${p} slower`)
  phrase(effect.descent, (p) => `descents ${p} faster`, (p) => `descents ${p} slower`)
  phrase(effect.technicalPenalty, (p) => `technical descents ${p} easier`, (p) => `technical descents ${p} harder`)
  phrase(effect.slowdown, (p) => `${p} less wear over distance`, (p) => `${p} more wear over distance`)
  if (good.length === 0 && bad.length === 0) return undefined
  const text = good.join(', ') + (bad.length ? `${good.length ? ', but ' : ''}${bad.join(', ')}` : '')
  return `Races: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

/**
 * Reads the owner's equipment table (src/data/equipment.csv, owner request 3 November 2026). Each
 * row is checked: a unique id, a known type, whole-number level, price and pack, numeric bonuses.
 */
export function parseEquipment(text: string): EquipmentItem[] {
  const items = parseCsv(text).map((row, i): EquipmentItem => {
    const where = `equipment.csv row ${i + 1} (${row.id || 'no id'})`
    if (!row.id) throw new Error(`${where}: missing id`)
    const slot = row.type as EquipmentSlot
    if (!SLOTS.includes(slot)) throw new Error(`${where}: unknown type "${row.type}"`)
    const attributes: Partial<Record<AttributeId, number>> = {}
    for (const id of ATTRIBUTE_IDS) {
      const value = csvNumber(row[id], where, 0)
      if (value !== 0) attributes[id] = value
    }
    const effect: RaceEffect = {}
    if (Object.keys(attributes).length) effect.attributes = attributes
    for (const [column, key] of Object.entries(MULTIPLIER_COLUMNS)) {
      const value = csvNumber(row[column], where, 1)
      if (!(value > 0)) throw new Error(`${where}: ${column} must be above 0`)
      if (value !== 1) effect[key] = value
    }
    const hasEffect = Object.keys(effect).length > 0
    const item: EquipmentItem = {
      id: row.id,
      label: row.name || row.id,
      slot,
      description: row.description ?? '',
      price: row.price ? csvInt(row.price, where) : null,
    }
    if (row.level) item.level = csvInt(row.level, where)
    if (row.pack) item.packSize = csvInt(row.pack, where)
    if ((slot === 'gel' || slot === 'bar' || slot === 'nutrition') !== (item.packSize !== undefined)) {
      throw new Error(`${where}: gel, bar and nutrition need a pack size, other types none`)
    }
    if (row.thumbnail) item.thumbnail = row.thumbnail
    if (row.avatar_layer) item.avatarLayer = row.avatar_layer
    if (hasEffect) item.raceEffect = effect
    const effectText = row.effect_text ? `Races: ${row.effect_text}` : hasEffect ? describeRaceEffect(effect) : undefined
    if (effectText) item.effectText = effectText
    return item
  })
  const ids = items.map((item) => item.id)
  const twice = ids.find((id, i) => ids.indexOf(id) !== i)
  if (twice) throw new Error(`equipment.csv: id "${twice}" appears twice`)
  return items
}

/** Every item, from the owner's table, in its order. */
export const EQUIPMENT_ITEMS: readonly EquipmentItem[] = parseEquipment(equipmentCsv)

/** The consumable kinds kept in stock (a race takes one of each at most). */
export type ConsumableKind = 'gel' | 'bar'

export function isConsumable(item: EquipmentItem): item is EquipmentItem & { packSize: number } {
  return item.packSize !== undefined
}

/** What a consumable pack refills: its own kind, or gels and bars for a `nutrition` pack. */
export function consumableKinds(item: EquipmentItem): ConsumableKind[] {
  if (item.slot === 'nutrition') return ['gel', 'bar']
  return item.slot === 'gel' || item.slot === 'bar' ? [item.slot] : []
}

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
