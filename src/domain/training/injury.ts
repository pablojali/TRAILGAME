/**
 * Injury rule (owner decision, 28 October 2026). Completing a non-rest session that leaves Fatigue
 * above the threshold injures the athlete: the session grants no XP, Fitness drops and the following
 * days are forced to Rest. Training is never blocked; the player is warned first.
 */
export const INJURY_FATIGUE_THRESHOLD = 95
export const INJURY_FITNESS_LOSS = 15
export const INJURY_REST_DAYS = 5
