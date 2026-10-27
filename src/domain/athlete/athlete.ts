/** Archetypes from DEVELOPMENT.md §6. M1 uses only the All-rounder. */
export type Archetype = 'climber' | 'sprinter' | 'ultrarunner' | 'technical-specialist' | 'all-rounder'

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  climber: 'Climber',
  sprinter: 'Sprinter',
  ultrarunner: 'Ultrarunner',
  'technical-specialist': 'Technical specialist',
  'all-rounder': 'All-rounder',
}

export type AttributeId = 'endurance' | 'speed' | 'power' | 'technique' | 'strength' | 'recovery'

export const ATTRIBUTE_IDS: readonly AttributeId[] = [
  'endurance',
  'speed',
  'power',
  'technique',
  'strength',
  'recovery',
]

/** Six core attributes on a 0–100 scale. Unchanged throughout M1. */
export type Attributes = Record<AttributeId, number>

export interface Athlete {
  name: string
  archetype: Archetype
  /** Cumulative XP; never decreases. Level is derived from it. */
  xp: number
  /** 0–100 inclusive. */
  fitness: number
  /** 0–100 inclusive. */
  fatigue: number
  attributes: Attributes
}

export const STAT_MIN = 0
export const STAT_MAX = 100
