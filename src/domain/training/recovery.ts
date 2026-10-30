import type { Athlete } from '../athlete/athlete'
import { PROFILES } from '../athlete/profiles'
import { TRAINING_SESSIONS } from './sessions'

/**
 * Recovery bonus on Rest (owner decision, 29 October 2026): for every 3 Recovery points above the
 * profile's starting value, a Rest day recovers 2 more Fatigue. Applies to forced Rest days too.
 */
export const RECOVERY_BONUS_STEP = 3
export const RECOVERY_BONUS_FATIGUE = 2

/**
 * Recovery Rest (owner decisions, 30 October 2026): a Rest day right after a training or race day
 * changes Fitness by this much instead of the Rest session's loss. It was +1, then set to 0 (keeps
 * Fitness) because +1 let Fitness outgrow the level. A second Rest in a row, and forced Rest after an
 * injury, keep the normal loss.
 */
export const RECOVERY_REST_FITNESS = 0

/** Extra Fatigue a Rest day recovers for this athlete (0 at the starting Recovery). */
export function getRestRecoveryBonus(athlete: Pick<Athlete, 'profile' | 'attributes'>): number {
  const gained = athlete.attributes.recovery - PROFILES[athlete.profile].attributes.recovery
  return Math.max(0, Math.floor(gained / RECOVERY_BONUS_STEP)) * RECOVERY_BONUS_FATIGUE
}

/** Fatigue change of a Rest day for this athlete, before clamping (−8 at the starting Recovery). */
export function getRestFatigueDelta(athlete: Pick<Athlete, 'profile' | 'attributes'>): number {
  return TRAINING_SESSIONS.rest.fatigueDelta - getRestRecoveryBonus(athlete)
}
