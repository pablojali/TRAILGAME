import type { Sex } from './athlete'

/**
 * Runner appearance (avatar). Cosmetic only: it selects how the avatar is drawn and never affects
 * any gameplay value. Identifiers are stable and saved; labels are for display.
 *
 * Shoes are not part of the appearance: they are equipment, and the avatar shows them only once an
 * equipment model says they are equipped.
 */
export type HairStyleId =
  | 'ponytail'
  | 'bob'
  | 'braid'
  | 'short'
  | 'buzz'
  | 'curly'

export type SkinToneId = 'tone-1' | 'tone-2' | 'tone-3' | 'tone-4'

/** Base kit only: white top and dark shorts. */
export type OutfitId = 'basic'

export interface Appearance {
  hair: HairStyleId
  skin: SkinToneId
  outfit: OutfitId
}

/** Hairstyles offered for each sex, in display order. The first one is the default. */
export const HAIR_STYLES: Record<Sex, readonly HairStyleId[]> = {
  female: ['ponytail', 'bob', 'braid'],
  male: ['short', 'buzz', 'curly'],
}

export const HAIR_STYLE_LABELS: Record<HairStyleId, string> = {
  ponytail: 'Ponytail',
  bob: 'Bob',
  braid: 'Braid',
  short: 'Short',
  buzz: 'Buzz cut',
  curly: 'Curly',
}

/** Display order. Colours live in the avatar styles. */
export const SKIN_TONES: readonly SkinToneId[] = ['tone-1', 'tone-2', 'tone-3', 'tone-4']

export const SKIN_TONE_LABELS: Record<SkinToneId, string> = {
  'tone-1': 'Skin tone 1',
  'tone-2': 'Skin tone 2',
  'tone-3': 'Skin tone 3',
  'tone-4': 'Skin tone 4',
}

export const OUTFITS: readonly OutfitId[] = ['basic']

export const OUTFIT_LABELS: Record<OutfitId, string> = {
  basic: 'Basic kit',
}

export function defaultAppearance(sex: Sex): Appearance {
  return { hair: HAIR_STYLES[sex][0]!, skin: 'tone-2', outfit: 'basic' }
}

/**
 * Keeps the hairstyle when it is offered for `sex`; otherwise picks the style in the same position
 * of that sex's list, so switching sex back and forth keeps the choice.
 */
export function hairForSex(hair: HairStyleId, sex: Sex): HairStyleId {
  const styles = HAIR_STYLES[sex]
  if (styles.includes(hair)) return hair
  const other = HAIR_STYLES[sex === 'female' ? 'male' : 'female']
  return styles[Math.max(0, other.indexOf(hair))] ?? styles[0]!
}

/**
 * Reads a saved appearance. Missing or unknown values fall back to the default for `sex`, field by
 * field, so an appearance can never make a career fail to load.
 */
export function parseAppearance(value: unknown, sex: Sex): Appearance {
  const fallback = defaultAppearance(sex)
  if (typeof value !== 'object' || value === null) return fallback
  const { hair, skin, outfit } = value as Record<string, unknown>
  return {
    hair: (HAIR_STYLES[sex] as readonly unknown[]).includes(hair) ? (hair as HairStyleId) : fallback.hair,
    skin: (SKIN_TONES as readonly unknown[]).includes(skin) ? (skin as SkinToneId) : fallback.skin,
    outfit: (OUTFITS as readonly unknown[]).includes(outfit) ? (outfit as OutfitId) : fallback.outfit,
  }
}
