import type { Sex } from './athlete'

/**
 * Runner appearance (avatar). Cosmetic only: it selects how the avatar is drawn and never affects
 * any gameplay value. Identifiers are stable and saved; labels are for display.
 *
 * The avatar uses the owner's layered artwork (assets/runner/avatar, prepared by
 * scripts/prepare_avatar_art.py). Each body has its face, hair and skin tone painted in, so the skin
 * tone selects the body, and the hair is the one drawn on it until hair layers exist. Shoes are
 * equipment, not appearance (see src/domain/equipment).
 */
export type HairStyleId = 'natural'

/** Skin tone, lightest first. Women have tones 1–3, men 1–4 (one body each). */
export type SkinToneId = 'tone-1' | 'tone-2' | 'tone-3' | 'tone-4'

/** Top worn over the body: none (as drawn: sports top or bare chest) or the white T-shirt. */
export type OutfitId = 'none' | 'white-tshirt'

export interface Appearance {
  hair: HairStyleId
  skin: SkinToneId
  outfit: OutfitId
}

/** Hairstyles offered for each sex, in display order. The first one is the default. */
export const HAIR_STYLES: Record<Sex, readonly HairStyleId[]> = {
  female: ['natural'],
  male: ['natural'],
}

export const HAIR_STYLE_LABELS: Record<HairStyleId, string> = {
  natural: 'As drawn',
}

/** Skin tones with a body for each sex, lightest first. */
export const SKIN_TONES: Record<Sex, readonly SkinToneId[]> = {
  female: ['tone-1', 'tone-2', 'tone-3'],
  male: ['tone-1', 'tone-2', 'tone-3', 'tone-4'],
}

export const SKIN_TONE_LABELS: Record<SkinToneId, string> = {
  'tone-1': 'Skin tone 1',
  'tone-2': 'Skin tone 2',
  'tone-3': 'Skin tone 3',
  'tone-4': 'Skin tone 4',
}

export const OUTFITS: readonly OutfitId[] = ['none', 'white-tshirt']

export const OUTFIT_LABELS: Record<OutfitId, string> = {
  none: 'No shirt',
  'white-tshirt': 'White T-shirt',
}

/** As drawn: no shirt (owner decision, 29 October 2026). */
export function defaultAppearance(sex: Sex): Appearance {
  return { hair: HAIR_STYLES[sex][0]!, skin: 'tone-2', outfit: 'none' }
}

/** The artwork body for a sex and skin tone, e.g. `female-2`. */
export function bodyId(sex: Sex, skin: SkinToneId): string {
  return `${sex}-${skin.slice('tone-'.length)}`
}

/**
 * Keeps the appearance valid when the sex changes: a skin tone the other sex has no body for
 * becomes the nearest one (tone 4 → tone 3 for women), and the hair becomes that sex's default if
 * it is not offered.
 */
export function appearanceForSex(appearance: Appearance, sex: Sex): Appearance {
  const tones = SKIN_TONES[sex]
  const skin = tones.includes(appearance.skin) ? appearance.skin : tones[tones.length - 1]!
  const hair = HAIR_STYLES[sex].includes(appearance.hair) ? appearance.hair : HAIR_STYLES[sex][0]!
  return { ...appearance, skin, hair }
}

/**
 * Reads a saved appearance. Missing or unknown values fall back field by field (a tone the sex has
 * no body for becomes the nearest one), so an appearance can never make a career fail to load.
 */
export function parseAppearance(value: unknown, sex: Sex): Appearance {
  const fallback = defaultAppearance(sex)
  if (typeof value !== 'object' || value === null) return fallback
  const { hair, skin, outfit } = value as Record<string, unknown>
  const knownSkin = (SKIN_TONES.male as readonly unknown[]).includes(skin) ? (skin as SkinToneId) : fallback.skin
  return appearanceForSex(
    {
      hair: (HAIR_STYLES[sex] as readonly unknown[]).includes(hair) ? (hair as HairStyleId) : fallback.hair,
      skin: knownSkin,
      outfit: (OUTFITS as readonly unknown[]).includes(outfit) ? (outfit as OutfitId) : fallback.outfit,
    },
    sex,
  )
}
