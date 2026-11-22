import { getEquipmentItem } from '../domain/equipment/items'
import { bandOf, durabilityPct, roundUsed, WEAR, wearOn, wears, type WearBand, type WearConfig } from '../domain/equipment/wear'
import type { GameState } from './gameState'
import { usedOf } from './wear'

/**
 * Equipment wear along the course (brief B-6b, owner decisions of 22 November 2026). The gear wears
 * segment by segment: the band of the shoes at the start of each segment sets how much of their race
 * bonus that segment keeps, and when the shoes' durability runs out during a segment the runner
 * retires (DNF) at the aid station at its end (or at the end of the last segment). Other gear keeps
 * its full effect until its life runs out, and none after. Everything is fixed by the wear at the
 * start and the course, so the outcome can be predicted before the start.
 */

/** The wear of the equipped gear when the race started, and the wear speed then. */
export interface RaceWear {
  speed: number
  /** Share of life used at the start, for every equipped item that wears. */
  used: Record<string, number>
}

/** What the gear's wear does to a race (null with wear off or nothing that wears). */
export function raceWearAtStart(state: GameState, equipment: readonly string[] = state.equipment, config: WearConfig = WEAR): RaceWear | undefined {
  if (!wearOn(config)) return undefined
  const used: Record<string, number> = {}
  for (const id of equipment) if (wears(getEquipmentItem(id))) used[id] = usedOf(state, id)
  return Object.keys(used).length ? { speed: config.speed, used } : undefined
}

/** Share of an item's life used after `km` of the race. */
export function usedAfter(wear: RaceWear, itemId: string, km: number): number {
  const item = getEquipmentItem(itemId)
  if (!wears(item)) return 0
  return roundUsed((wear.used[itemId] ?? 0) + (km * wear.speed) / item.lifeKm)
}

/** The shoes' band after `km` of the race (undefined: no shoes that wear). */
export function shoeBandAfter(wear: RaceWear, km: number, config: WearConfig = WEAR): WearBand | undefined {
  const shoes = Object.keys(wear.used).find((id) => getEquipmentItem(id)?.slot === 'shoes')
  return shoes ? bandOf(durabilityPct(usedAfter(wear, shoes, km)), config) : undefined
}

/**
 * The share of each item's race effect kept on a segment that starts after `km`: the shoes' band
 * factor; other gear all of it while it has life left, none after.
 */
export function effectFactorsAt(wear: RaceWear | undefined, km: number, config: WearConfig = WEAR): Record<string, number> | undefined {
  if (!wear) return undefined
  const factors: Record<string, number> = {}
  for (const id of Object.keys(wear.used)) {
    const pct = durabilityPct(usedAfter(wear, id, km))
    factors[id] = getEquipmentItem(id)?.slot === 'shoes' ? bandOf(pct, config).effectFactor : pct > 0 ? 1 : 0
  }
  return factors
}

/** Km from the start to the end of each segment. */
export function segmentEndsKm(segmentsM: readonly number[]): number[] {
  const ends: number[] = []
  let total = 0
  for (const m of segmentsM) {
    total += m
    ends.push(total / 1000)
  }
  return ends
}

/** Where the shoes break: the segment (0-based) during which their life runs out, and the km there. */
export interface ShoeBreak {
  segment: number
  /** Km at the end of that segment: where the runner retires. */
  km: number
  /** The aid station there (1-based); null when it is the last segment (the finish). */
  aidStation: number | null
}

/** The segment where the shoes' durability reaches 0, or null if they last the race. */
export function shoeBreak(wear: RaceWear | undefined, segmentsM: readonly number[]): ShoeBreak | null {
  if (!wear) return null
  const shoes = Object.keys(wear.used).find((id) => getEquipmentItem(id)?.slot === 'shoes')
  if (!shoes) return null
  const ends = segmentEndsKm(segmentsM)
  const segment = ends.findIndex((km) => usedAfter(wear, shoes, km) >= 1)
  if (segment === -1) return null
  return { segment, km: Math.round(ends[segment]! * 10) / 10, aidStation: segment < ends.length - 1 ? segment + 1 : null }
}
