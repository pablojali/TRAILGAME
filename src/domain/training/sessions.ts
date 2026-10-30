import type { AttributeId } from '../athlete/athlete'

/** Stable session identifiers; never rely on display labels. */
export type SessionType =
  | 'easy-run'
  | 'intervals'
  | 'hills'
  | 'long-run'
  | 'strength'
  | 'trail-technique'
  | 'rest'

export interface SessionDefinition {
  id: SessionType
  label: string
  description: string
  xp: number
  fitnessDelta: number
  fatigueDelta: number
  /** Attribute the session trains: it gains `ATTRIBUTE_GAIN_PER_SESSION` (none for Rest). */
  attribute?: AttributeId
}

/** Attribute gained by each completed training session (owner decision, 30 October 2026). */
export const ATTRIBUTE_GAIN_PER_SESSION = 0.1

/**
 * Single source of truth for training rules. Tune values here only. Fitness values and the trained
 * attribute: owner decision, 30 October 2026 (were +2/+3 Fitness and no attribute), so Fitness
 * grows with the level instead of outrunning it (docs/SEASON_SIMULATION_16W.md).
 */
export const TRAINING_SESSIONS: Record<SessionType, SessionDefinition> = {
  'easy-run': {
    id: 'easy-run',
    label: 'Easy run',
    description: 'Relaxed aerobic running.',
    xp: 9,
    fitnessDelta: 0.5,
    fatigueDelta: 5,
    attribute: 'endurance',
  },
  intervals: {
    id: 'intervals',
    label: 'Intervals',
    description: 'Hard repeats with short recoveries.',
    xp: 16,
    fitnessDelta: 0.75,
    fatigueDelta: 14,
    attribute: 'speed',
  },
  hills: {
    id: 'hills',
    label: 'Hills',
    description: 'Repeated climbs and descents.',
    xp: 14,
    fitnessDelta: 0.5,
    fatigueDelta: 12,
    attribute: 'climbing',
  },
  'long-run': {
    id: 'long-run',
    label: 'Long run',
    description: 'Extended time on feet.',
    xp: 18,
    fitnessDelta: 1,
    fatigueDelta: 16,
    attribute: 'endurance',
  },
  strength: {
    id: 'strength',
    label: 'Strength',
    description: 'Gym and conditioning work.',
    xp: 11,
    fitnessDelta: 0.5,
    fatigueDelta: 4,
    attribute: 'recovery',
  },
  'trail-technique': {
    id: 'trail-technique',
    label: 'Trail technique',
    description: 'Footwork on rough and technical ground.',
    xp: 11,
    fitnessDelta: 0.25,
    fatigueDelta: 3,
    attribute: 'technical',
  },
  rest: {
    id: 'rest',
    label: 'Rest',
    description: 'Recover and reduce fatigue.',
    xp: 0,
    fitnessDelta: -2,
    fatigueDelta: -8,
  },
}

/** Display order for session selectors. */
export const SESSION_TYPES: readonly SessionType[] = [
  'easy-run',
  'intervals',
  'hills',
  'long-run',
  'strength',
  'trail-technique',
  'rest',
]

export function isSessionType(value: unknown): value is SessionType {
  return typeof value === 'string' && Object.hasOwn(TRAINING_SESSIONS, value)
}
