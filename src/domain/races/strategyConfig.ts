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
  /** §3.2: time multiplier (pace) and in-race fatigue multiplier of each intensity. */
  intensity: {
    recovery: { pace: 1.1, fatigue: 0.45 },
    easy: { pace: 1.05, fatigue: 0.7 },
    target: { pace: 1.0, fatigue: 1.0 },
    hard: { pace: 0.95, fatigue: 1.6 },
  } satisfies Record<Intensity, { pace: number; fatigue: number }>,
  /** In-race fatigue gained per effort-km at Target pace and Recovery 20, before calibration. */
  fatiguePerEffortKm: 0.6,
  /** §3.4: stop duration and share of the in-race fatigue gained so far that it recovers. */
  stop: {
    quick: { seconds: 30, recovery: 0.1 },
    normal: { seconds: 120, recovery: 0.25 },
    slow: { seconds: 300, recovery: 0.45 },
  } satisfies Record<AidStop, { seconds: number; recovery: number }>,
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
  /** The runner plus 29 NPC rivals (owner decision, 2 November 2026; was 50). */
  fieldSize: 30,
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
