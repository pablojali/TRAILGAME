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
}

/** Single source of truth for M1 training rules. Tune values here only. */
export const TRAINING_SESSIONS: Record<SessionType, SessionDefinition> = {
  'easy-run': {
    id: 'easy-run',
    label: 'Easy run',
    description: 'Relaxed aerobic running.',
    xp: 10,
    fitnessDelta: 3,
    fatigueDelta: 5,
  },
  intervals: {
    id: 'intervals',
    label: 'Intervals',
    description: 'Hard repeats with short recoveries.',
    xp: 18,
    fitnessDelta: 5,
    fatigueDelta: 14,
  },
  hills: {
    id: 'hills',
    label: 'Hills',
    description: 'Repeated climbs and descents.',
    xp: 16,
    fitnessDelta: 5,
    fatigueDelta: 12,
  },
  'long-run': {
    id: 'long-run',
    label: 'Long run',
    description: 'Extended time on feet.',
    xp: 20,
    fitnessDelta: 6,
    fatigueDelta: 16,
  },
  strength: {
    id: 'strength',
    label: 'Strength',
    description: 'Gym and conditioning work.',
    xp: 12,
    fitnessDelta: 3,
    fatigueDelta: 8,
  },
  'trail-technique': {
    id: 'trail-technique',
    label: 'Trail technique',
    description: 'Footwork on rough and technical ground.',
    xp: 12,
    fitnessDelta: 3,
    fatigueDelta: 6,
  },
  rest: {
    id: 'rest',
    label: 'Rest',
    description: 'Recover and reduce fatigue.',
    xp: 0,
    fitnessDelta: 0,
    fatigueDelta: -12,
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
