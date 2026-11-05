import { GROSS_PRIZES, REWARD_MULTIPLIERS } from './categories'
import { RACES, type Race } from './races'

/**
 * How an entry was made. `free`: every entry since 1 November 2026 (NPC races are free).
 * `standard` / `early`: entries paid before then (at or above / below the recommended level),
 * kept for saved results.
 */
export type EntryType = 'free' | 'standard' | 'early'

/**
 * The entry window around a race's recommended level (owner decision, 5 November 2026, points
 * system v3): from 5 levels below to 2 levels above. Level sets access; it never changes ranking
 * points.
 */
export const LEVELS_BELOW_RECOMMENDED = 5
export const LEVELS_ABOVE_RECOMMENDED = 2

/** The lowest level that may enter a race. */
export function getMinimumLevel(race: Race): number {
  return Math.max(1, race.recommendedLevel - LEVELS_BELOW_RECOMMENDED)
}

/** The highest level that may enter a race. */
export function getMaximumLevel(race: Race): number {
  return race.recommendedLevel + LEVELS_ABOVE_RECOMMENDED
}

/**
 * True if an athlete of `level` may enter the race. Entry is always free. Within the window, or the
 * hardest race whose minimum the athlete reaches, so that no level is left without a race (the
 * catalog has gaps, e.g. level 34, and nothing above level 52 otherwise).
 */
export function canEnterAtLevel(race: Race, level: number): boolean {
  if (level < getMinimumLevel(race)) return false
  if (level <= getMaximumLevel(race)) return true
  const reachable = RACES.filter((other) => level >= getMinimumLevel(other))
  return reachable.every((other) => other.recommendedLevel <= race.recommendedLevel)
}

/** Anti-farming multipliers for an athlete of `level` in `race` (§10.9). */
export function getRewardMultiplier(race: Race, level: number): { levelDifference: number; xp: number; coins: number } {
  const levelDifference = level - race.recommendedLevel
  const row =
    [...REWARD_MULTIPLIERS].reverse().find((entry) => levelDifference >= entry.levelDifference) ?? REWARD_MULTIPLIERS[0]!
  return { levelDifference, xp: row.xp, coins: row.coins }
}

/** Gross coin prizes per band for the race's category, before the entry fee. */
export function getGrossPrizes(race: Race): readonly number[] {
  return GROSS_PRIZES[race.category]
}
