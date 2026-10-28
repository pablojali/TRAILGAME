/** Starting profiles (Game Design Bible §2). Identifiers are stable; labels are for display. */
export type ProfileId = 'climber' | 'sprinter' | 'all-rounder' | 'endurance'

export type AttributeId =
  | 'endurance'
  | 'climbing'
  | 'speed'
  | 'technical'
  | 'recovery'
  | 'consistency'

/** Display order for attributes. */
export const ATTRIBUTE_IDS: readonly AttributeId[] = [
  'endurance',
  'climbing',
  'speed',
  'technical',
  'recovery',
  'consistency',
]

export const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  endurance: 'Endurance',
  climbing: 'Climbing',
  speed: 'Speed',
  technical: 'Technical',
  recovery: 'Recovery',
  consistency: 'Consistency',
}

/** Runner's sex. Cosmetic only: it selects artwork and never affects any gameplay value. */
export type Sex = 'female' | 'male'

/** Display order for the sex selector. */
export const SEXES: readonly Sex[] = ['female', 'male']

export const SEX_LABELS: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
}

export function isSex(value: unknown): value is Sex {
  return value === 'female' || value === 'male'
}

/** Maximum length of a runner name, after trimming. */
export const ATHLETE_NAME_MAX_LENGTH = 16

/** Returns the trimmed name if it is 1–16 characters long, otherwise null. */
export function cleanAthleteName(value: string): string | null {
  const name = value.trim()
  return name.length >= 1 && name.length <= ATHLETE_NAME_MAX_LENGTH ? name : null
}

/** Six core attributes, integers on a 1–100 scale. */
export type Attributes = Record<AttributeId, number>

export const ATTRIBUTE_MIN = 1
export const ATTRIBUTE_MAX = 100

export interface Athlete {
  name: string
  /** Cosmetic only. */
  sex: Sex
  profile: ProfileId
  /** Cumulative XP; never decreases. Level and earned attribute points derive from it. */
  xp: number
  /** 0–100 inclusive. */
  fitness: number
  /** 0–100 inclusive. */
  fatigue: number
  attributes: Attributes
  /** Attribute points already allocated. Unspent points = earned − spent. */
  spentAttributePoints: number
}

/** Range for Fitness and Fatigue. */
export const STAT_MIN = 0
export const STAT_MAX = 100

export function isAttributeId(value: unknown): value is AttributeId {
  return typeof value === 'string' && (ATTRIBUTE_IDS as readonly string[]).includes(value)
}
