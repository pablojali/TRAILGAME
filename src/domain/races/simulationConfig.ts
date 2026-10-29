import type { RaceCategory } from './categories'

/**
 * Race simulation constants (M4.2, approved by the owner on 29 October 2026 with decisions D1–D10;
 * see docs/RACE_SIMULATION_PROPOSAL.md). Balancing values: change them here only, with owner
 * approval, and regenerate docs/race-simulation/results.md with the prototype.
 */
export const RACE_SIMULATION = {
  /** Share of the distance spent climbing, and the same again descending. */
  climbShare: { open: 0.2, trail: 0.3, mountain: 0.35, elite: 0.38 } satisfies Record<RaceCategory, number>,
  /** No single climb gains more than this. */
  maxGainPerClimbM: 600,
  /** Courses steeper than this on average in any segment are invalid catalog data. */
  maxAverageGradient: 0.4,
  /** Minutes per effort-km for ability 20, Fitness 50, Fatigue 0, fresh. */
  basePaceMinPerEffortKm: 6.0,
  /** Ability (and Consistency) at which a factor is neutral, and the curve exponent. */
  abilityReference: 20,
  abilityExponent: 0.35,
  /** Climbs at or above this gradient use the climb ability only. */
  climbWeightFullGradient: 0.2,
  /** Extra descent time per technicality level, reduced by the Technical attribute. */
  technicalPenaltyPerLevel: 0.12,
  /** Slowdown over distance, reduced by durability. */
  slowdownRate: 0.25,
  slowdownReferenceEffortKm: 50,
  fitnessSlope: 0.2,
  fatigueSlope: 0.3,
  /** The athlete plus 49 rivals. */
  fieldSize: 50,
  /** Rival times relative to the reference: fastest + spread × q^exponent. */
  rivalFastest: 0.85,
  rivalSpread: 0.4,
  rivalExponent: 1.3,
  /** Fatigue of the reference athlete. */
  referenceFatigue: 20,
  /** Maximum day form (D1), narrowed by Consistency. */
  dayFormMax: 0.04,
  /** Effects smaller than this share of the finishing time are not shown as explanations. */
  explanationMinShare: 0.005,
  /** Number of explanation factors shown. */
  explanationCount: 3,
} as const
