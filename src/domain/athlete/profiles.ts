import type { AttributeId, Attributes, ProfileId } from './athlete'

export interface ProfileDefinition {
  id: ProfileId
  label: string
  description: string
  strengths: readonly AttributeId[]
  weaknesses: readonly AttributeId[]
  /** Starting attributes; every profile totals the same number of points. */
  attributes: Attributes
}

/** Every profile starts with exactly this many attribute points. */
export const PROFILE_ATTRIBUTE_TOTAL = 96

/** Single source of truth for starting profiles (Game Design Bible §2.3). */
export const PROFILES: Record<ProfileId, ProfileDefinition> = {
  climber: {
    id: 'climber',
    label: 'Climber',
    description: 'A specialist in uphill performance and mountainous terrain.',
    strengths: ['climbing', 'technical'],
    weaknesses: ['speed', 'recovery'],
    attributes: { endurance: 16, climbing: 20, speed: 13, technical: 18, recovery: 14, consistency: 15 },
  },
  sprinter: {
    id: 'sprinter',
    label: 'Sprinter',
    description: 'A specialist in speed and runnable terrain.',
    strengths: ['speed', 'consistency', 'technical'],
    weaknesses: ['endurance', 'climbing'],
    attributes: { endurance: 13, climbing: 12, speed: 20, technical: 17, recovery: 16, consistency: 18 },
  },
  'all-rounder': {
    id: 'all-rounder',
    label: 'All-rounder',
    description: 'A balanced athlete without a major initial weakness.',
    strengths: [],
    weaknesses: [],
    attributes: { endurance: 16, climbing: 16, speed: 16, technical: 16, recovery: 16, consistency: 16 },
  },
  endurance: {
    id: 'endurance',
    label: 'Endurance',
    description: 'A specialist in long-distance performance and recovery.',
    strengths: ['endurance', 'recovery'],
    weaknesses: ['technical', 'speed'],
    attributes: { endurance: 20, climbing: 15, speed: 14, technical: 13, recovery: 18, consistency: 16 },
  },
}

/** Display order for profile selection. */
export const PROFILE_IDS: readonly ProfileId[] = ['climber', 'sprinter', 'all-rounder', 'endurance']

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === 'string' && (PROFILE_IDS as readonly string[]).includes(value)
}
