import { roundStat, type Athlete } from '../athlete/athlete'
import { getLevel } from '../athlete/levels'
import { PROFILES } from '../athlete/profiles'
import { TRAINING_SESSIONS, type SessionType } from './sessions'

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

/**
 * Experience (owner decision, 10 November 2026): a higher level tires less in training. Share of a
 * session's Fatigue saved by level, linear between rows, flat after the last. Rest is unchanged,
 * and so are races.
 */
export const LEVEL_FATIGUE_SAVING = [
  { level: 1, saving: 0 },
  { level: 30, saving: 0.03 },
  { level: 50, saving: 0.05 },
  { level: 100, saving: 0.1 },
] as const

/** Share of a training session's Fatigue saved at `level`. */
export function levelFatigueSaving(level: number): number {
  const rows = LEVEL_FATIGUE_SAVING
  if (level <= rows[0].level) return rows[0].saving
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!
    const b = rows[i]!
    if (level <= b.level) return a.saving + ((level - a.level) / (b.level - a.level)) * (b.saving - a.saving)
  }
  return rows[rows.length - 1]!.saving
}

/** Fatigue change of a training session for this athlete, before clamping (2 decimals). */
export function getSessionFatigueDelta(athlete: Pick<Athlete, 'profile' | 'attributes' | 'xp'>, session: SessionType): number {
  if (session === 'rest') return getRestFatigueDelta(athlete)
  const delta = TRAINING_SESSIONS[session].fatigueDelta
  return roundStat(delta * (1 - levelFatigueSaving(getLevel(athlete.xp))))
}
