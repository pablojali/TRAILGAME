import { GROSS_PRIZES, REWARD_MULTIPLIERS } from './categories'
import type { Race } from './races'

/**
 * How an entry was made. `free`: every entry since 1 November 2026 (NPC races are free).
 * `standard` / `early`: entries paid before then (at or above / below the recommended level),
 * kept for saved results.
 */
export type EntryType = 'free' | 'standard' | 'early'

/**
 * Levels below a race's recommended level at which it opens (owner decision, 1 November 2026:
 * a race can be entered from 2 levels below its recommended level).
 */
export const LEVELS_BELOW_RECOMMENDED = 2

/** The lowest level that may enter a race. */
export function getMinimumLevel(race: Race): number {
  return Math.max(1, race.recommendedLevel - LEVELS_BELOW_RECOMMENDED)
}

/** True if an athlete of `level` may enter the race. Entry is always free. */
export function canEnterAtLevel(race: Race, level: number): boolean {
  return level >= getMinimumLevel(race)
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
