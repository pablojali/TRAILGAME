/**
 * Race Engine & Strategy V1 (owner approval, 1 November 2026; docs/RACE_ENGINE_V1_PROPOSAL.md).
 * Balancing values: change them here only, with owner approval.
 */

export type Intensity = 'recovery' | 'easy' | 'target' | 'hard'
export type AidStop = 'quick' | 'normal' | 'slow'

export const INTENSITIES: readonly Intensity[] = ['recovery', 'easy', 'target', 'hard']
export const AID_STOPS: readonly AidStop[] = ['quick', 'normal', 'slow']

export function isIntensity(value: unknown): value is Intensity {
  return INTENSITIES.includes(value as Intensity)
}

export function isAidStop(value: unknown): value is AidStop {
  return AID_STOPS.includes(value as AidStop)
}

export const RACE_STRATEGY = {
  /** Segments per race: clamp(round(distance km / kmPerSegment), min, max). */
  kmPerSegment: 6,
  minSegments: 2,
  maxSegments: 8,
  /**
   * Three race engines by distance (owner request, 10 November 2026: a sub-30 km race does not race
   * like an ultra). Each band sets every intensity's time multiplier (pace) and in-race fatigue
   * multiplier, and how much the in-race fatigue above the plan slows the runner (`fatigueWeight`,
   * 1 = like career Fatigue; below the plan it speeds them up by `belowPlanWeight` of that, so
   * saving energy in an ultra helps less than wasting it hurts). Short races: Hard wins about a minute every 11 and the fatigue costs
   * little; ultras: Hard is a little faster now and costs a lot later, unless the runner starts the
   * race fresh (career Fatigue under `fresh.belowFatigue`, owner rule: under 30; Hard's fatigue multiplier is then
   * `fresh.hardFatigue`). Bands by the race's distance: up to `maxKm` (the last band has none).
   */
  distanceBands: [
    {
      maxKm: 30,
      intensity: {
        recovery: { pace: 1.08, fatigue: 0.45 },
        easy: { pace: 1.04, fatigue: 0.7 },
        target: { pace: 1.0, fatigue: 1.0 },
        hard: { pace: 0.91, fatigue: 1.6 },
      },
      fatigueWeight: 0.6,
      belowPlanWeight: 1,
      fresh: null,
    },
    {
      maxKm: 90,
      intensity: {
        recovery: { pace: 1.06, fatigue: 0.45 },
        easy: { pace: 1.03, fatigue: 0.7 },
        target: { pace: 1.0, fatigue: 1.0 },
        hard: { pace: 0.95, fatigue: 2.0 },
      },
      fatigueWeight: 1.5,
      belowPlanWeight: 0.3,
      fresh: { belowFatigue: 30, hardFatigue: 1.4 },
    },
    {
      maxKm: null,
      intensity: {
        recovery: { pace: 1.05, fatigue: 0.45 },
        easy: { pace: 1.025, fatigue: 0.7 },
        target: { pace: 1.0, fatigue: 1.0 },
        hard: { pace: 0.95, fatigue: 1.9 },
      },
      fatigueWeight: 1.2,
      belowPlanWeight: 0.2,
      fresh: { belowFatigue: 30, hardFatigue: 1.3 },
    },
  ],
  /**
   * Technical descents take away part of Hard's gain (owner request, 10 November 2026): the share
   * lost is the segment's descent share × technicality / 5 × (1 − Technical / 100), at most all of it.
   */
  hardTechnicalLoss: 1.6,
  /** In-race fatigue gained per effort-km at Target pace and Recovery 20, before calibration. */
  fatiguePerEffortKm: 0.6,
  /** §3.4: stop duration and share of the in-race fatigue gained so far that it recovers. */
  stop: {
    quick: { recovery: 0.1 },
    normal: { recovery: 0.25 },
    slow: { recovery: 0.45 },
  } satisfies Record<AidStop, { recovery: number }>,
  /** No stop recovers more than this share of the in-race fatigue gained so far. */
  maxStopRecovery: 0.6,
  /** The stop NPC rivals make, by finishing rank: front third, middle third, back third. */
  rivalStops: ['quick', 'normal', 'slow'] satisfies AidStop[],
  /** §3.3: the gel saves this share of race time; the cereal bar this share of fatigue gained. */
  gelTimeSaving: 0.015,
  barFatigueSaving: 0.015,
  /**
   * Weight of the in-race fatigue above the planned one (Target pace with Normal stops) in the pace,
   * through the existing Fatigue factor. 1 = the same effect as career Fatigue.
   */
  inRaceFatiguePaceWeight: 1,
  /**
   * Stop durations in seconds by the race's effort-km (owner decision, 2 November 2026): short in
   * short races, longer in ultras. Linear between rows, flat outside them; whole 5 seconds.
   */
  stopDurations: [
    { effortKm: 6.2, quick: 10, normal: 20, slow: 45 },
    { effortKm: 65, quick: 30, normal: 120, slow: 300 },
    { effortKm: 165, quick: 60, normal: 240, slow: 600 },
  ],
  /** The runner plus 29 NPC rivals (owner decision, 2 November 2026; was 50). */
  fieldSize: 30,
  /**
   * Each rival's form on the day (owner request, 9 November 2026: the same race gave the same field
   * every time): running time × (1 ± up to this), drawn per rival and per edition (the runner's
   * entry), fixed for the whole race.
   */
  rivalFormMax: 0.03,
  /**
   * Running pace (no stops) of the winner and of the last finisher, in minutes per effort-km, by
   * the race's effort-km (owner table, 2 November 2026). Linear between rows, flat outside them.
   */
  paces: [
    { effortKm: 6.2, winner: 3.2, last: 7 },
    { effortKm: 65, winner: 4.0, last: 8 },
    { effortKm: 118, winner: 4.5, last: 9 },
    { effortKm: 165, winner: 5.0, last: 10 },
  ],
  /**
   * Where a typical runner of a level finishes, by levels above the race's recommended level
   * (owner decision, 2 November 2026): 2 above is 2nd, the recommended level 15th, 2 below 22nd.
   * Rival index (0-based) whose finishing time equals that runner's (ties go to the runner).
   */
  /**
   * The typical runners the field is anchored on race like a player (owner decision, 4 November
   * 2026): Target pace, Normal stops, the best shop gear of their level in each slot (highest level
   * not above theirs; the first in the equipment table on a tie) and, when set, a gel and a bar.
   */
  typicalGear: true,
  typicalNutrition: { gel: true, bar: true },
  /** Minimum time gap (share) between the race's level and 2 levels either side in the field. */
  minLevelGap: 0.03,
  levelAnchors: [
    { levels: 2, rivalIndex: 1 },
    { levels: 0, rivalIndex: 14 },
    { levels: -2, rivalIndex: 21 },
  ],
} as const

/** Winner's and last finisher's running pace (minutes per effort-km) for a race of `effortKm`. */
export function racePaces(effortKm: number): { winner: number; last: number } {
  const rows = RACE_STRATEGY.paces
  if (effortKm <= rows[0].effortKm) return { winner: rows[0].winner, last: rows[0].last }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!
    const b = rows[i]!
    if (effortKm <= b.effortKm) {
      const t = (effortKm - a.effortKm) / (b.effortKm - a.effortKm)
      return { winner: a.winner + t * (b.winner - a.winner), last: a.last + t * (b.last - a.last) }
    }
  }
  const last = rows[rows.length - 1]!
  return { winner: last.winner, last: last.last }
}

/** Linear interpolation over rows sorted by effort-km, flat outside them. */
function byEffort<T extends { effortKm: number }>(rows: readonly T[], effortKm: number, pick: (row: T) => number): number {
  if (effortKm <= rows[0]!.effortKm) return pick(rows[0]!)
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!
    const b = rows[i]!
    if (effortKm <= b.effortKm) return pick(a) + ((effortKm - a.effortKm) / (b.effortKm - a.effortKm)) * (pick(b) - pick(a))
  }
  return pick(rows[rows.length - 1]!)
}

export type DistanceBand = (typeof RACE_STRATEGY.distanceBands)[number]

/** The race engine band of a race of `distanceKm` (owner request, 10 November 2026). */
export function distanceBand(distanceKm: number): DistanceBand {
  const bands = RACE_STRATEGY.distanceBands
  return bands.find((band) => band.maxKm !== null && distanceKm < band.maxKm) ?? bands[bands.length - 1]!
}

/**
 * An intensity's pace and fatigue multipliers in a race: its band's, Hard's fatigue lower for a
 * runner who starts fresh, Hard's gain cut on technical descents (`descentTechnical` = descent share
 * × technicality / 5 × (1 − Technical / 100), 0 outside descents).
 */
export function intensityEffect(
  distanceKm: number,
  intensity: Intensity,
  startFatigue = Infinity,
  descentTechnical = 0,
): { pace: number; fatigue: number } {
  const band = distanceBand(distanceKm)
  const { pace, fatigue } = band.intensity[intensity]
  if (intensity !== 'hard') return { pace, fatigue }
  const loss = Math.min(1, Math.max(0, RACE_STRATEGY.hardTechnicalLoss * descentTechnical))
  return {
    pace: 1 - (1 - pace) * (1 - loss),
    fatigue: band.fresh && startFatigue < band.fresh.belowFatigue ? band.fresh.hardFatigue : fatigue,
  }
}

/** Seconds of each stop in a race of `effortKm`. */
export function stopSeconds(effortKm: number): Record<AidStop, number> {
  const rows = RACE_STRATEGY.stopDurations
  const at = (stop: AidStop) => Math.round(byEffort(rows, effortKm, (row) => row[stop]) / 5) * 5
  return { quick: at('quick'), normal: at('normal'), slow: at('slow') }
}
