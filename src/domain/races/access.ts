import { GROSS_PRIZES, RACE_CATEGORY_CONFIG, REWARD_MULTIPLIERS } from './categories'
import type { Race } from './races'

/** `free`: Open races. `standard`: at or above the recommended level. `early`: below it. */
export type EntryType = 'free' | 'standard' | 'early'

export interface EntryFee {
  type: EntryType
  fee: number
}

/** The fee that applies to an athlete of `level` (§10.3). There are no level locks. */
export function getEntryFee(race: Race, level: number): EntryFee {
  const config = RACE_CATEGORY_CONFIG[race.category]
  if (level >= race.recommendedLevel) {
    return { type: config.standardFee === 0 ? 'free' : 'standard', fee: config.standardFee }
  }
  return { type: config.earlyEntryFee === 0 ? 'free' : 'early', fee: config.earlyEntryFee }
}

/** Coins still needed to pay `fee`, or 0 if the balance covers it. */
export function getShortfall(fee: number, coins: number): number {
  return Math.max(0, fee - coins)
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
