/**
 * Race categories, fees, prizes and reward multipliers (Game Design Bible §10.3, §10.8, §10.9).
 * Initial balancing values: change them here only, never in screens.
 */
export type RaceCategory = 'open' | 'trail' | 'mountain' | 'elite'

/** Display order. */
export const RACE_CATEGORIES: readonly RaceCategory[] = ['open', 'trail', 'mountain', 'elite']

export interface RaceCategoryConfig {
  label: string
  /** Typical recommended level for the category; each race sets its own. */
  recommendedLevel: number
  /** Fee when the athlete's level is at or above the race's recommended level. */
  standardFee: number
  /** Fee when the athlete's level is below the race's recommended level. */
  earlyEntryFee: number
}

/**
 * Owner decisions (29 October 2026): levels per category Open 1–10, Trail 11–20, Mountain 21–30,
 * Elite 31–50, and every entry fee halved (was 100/250, 250/600, 600/1,400).
 */
export const RACE_CATEGORY_CONFIG: Record<RaceCategory, RaceCategoryConfig> = {
  open: { label: 'Open', recommendedLevel: 1, standardFee: 0, earlyEntryFee: 0 },
  trail: { label: 'Trail', recommendedLevel: 11, standardFee: 50, earlyEntryFee: 125 },
  mountain: { label: 'Mountain', recommendedLevel: 21, standardFee: 125, earlyEntryFee: 300 },
  elite: { label: 'Elite', recommendedLevel: 31, standardFee: 300, earlyEntryFee: 700 },
}

export interface PrizeBand {
  /** First and last finishing position of the band; `to: null` means "or lower". */
  from: number
  to: number | null
  label: string
}

export const PRIZE_BANDS: readonly PrizeBand[] = [
  { from: 1, to: 1, label: '1st' },
  { from: 2, to: 2, label: '2nd' },
  { from: 3, to: 3, label: '3rd' },
  { from: 4, to: 10, label: '4th–10th' },
  { from: 11, to: null, label: '11th or lower' },
]

/** Gross coin prize per band (same order as `PRIZE_BANDS`), before the entry fee. */
export const GROSS_PRIZES: Record<RaceCategory, readonly number[]> = {
  open: [100, 70, 50, 25, 10],
  trail: [300, 210, 150, 75, 30],
  mountain: [700, 490, 350, 175, 70],
  elite: [1500, 1050, 750, 375, 150],
}

/** Race XP before multipliers (owner decision D5): XP = floor(base × band % × multiplier %). */
export const RACE_XP_BASE: Record<RaceCategory, number> = { open: 30, trail: 60, mountain: 100, elite: 180 }

/** Race XP per band, in whole percent of the base (same order as `PRIZE_BANDS`). */
export const RACE_XP_BAND_PCT: readonly number[] = [100, 70, 50, 25, 10]

/**
 * Anti-farming multipliers for race XP and gross coin prizes, by
 * `levelDifference = athleteLevel - raceRecommendedLevel`. The last entry applies to every larger
 * difference; differences of 0 or below use 100 %.
 */
export const REWARD_MULTIPLIERS: readonly { levelDifference: number; xp: number; coins: number }[] = [
  { levelDifference: 0, xp: 1, coins: 1 },
  { levelDifference: 1, xp: 0.75, coins: 0.75 },
  { levelDifference: 2, xp: 0.4, coins: 0.4 },
  { levelDifference: 3, xp: 0, coins: 0 },
]
