import type { Sex } from './athlete'
import { getHead, HEADS } from './heads'
import { getShirt, SHIRTS } from './shirts'

/**
 * Runner appearance (avatar). Cosmetic only: it selects how the avatar is drawn and never affects
 * any gameplay value. Identifiers are stable and saved; labels are for display.
 *
 * The avatar uses the owner's layered artwork (assets/runner/avatar, prepared by
 * scripts/prepare_avatar_art.py; docs/AVATAR_ART_SPEC.md). The skin tone selects the body, which
 * has a basic head (bald). The hair is either that basic head ('natural') or
 * one of the owner's heads, drawn over it in the same skin tone (src/domain/athlete/heads.ts).
 * Shoes are equipment, not appearance (see src/domain/equipment).
 */
export type HairStyleId = 'natural' | (string & {})

/**
 * Skin tone, numbered as in the owner's files (tone 1 darkest; owner decision, 30 October 2026).
 * Women have tones 1–3, men 1–4 (one body each).
 */
export type SkinToneId = 'tone-1' | 'tone-2' | 'tone-3' | 'tone-4'

/**
 * Top worn over the body: none (as drawn: sports top or bare chest) or one of the owner's shirts
 * for the runner's sex (src/domain/athlete/shirts.ts), saved by its id, e.g. `shirt-l1-01`.
 */
export type OutfitId = 'none' | (string & {})

/** No shirt: always available, and the default. */
export const NO_OUTFIT = 'none'

export interface Appearance {
  hair: HairStyleId
  skin: SkinToneId
  outfit: OutfitId
}

/** The body's basic head; always available and the default. */
export const BASIC_HAIR = 'natural'

function toneNumber(skin: SkinToneId): number {
  return Number(skin.slice('tone-'.length))
}

/**
 * Hairstyles offered for a sex and skin tone, in display order: the basic head first, then every
 * head that has art in that tone, locked or not.
 */
export function hairStyles(sex: Sex, skin: SkinToneId): HairStyleId[] {
  return [BASIC_HAIR, ...HEADS.filter((h) => h.sex === sex && h.files[toneNumber(skin)]).map((h) => h.id)]
}

export function hairStyleLabel(sex: Sex, hair: HairStyleId): string {
  return getHead(sex, hair)?.label ?? 'Basic'
}

/** The level a hairstyle unlocks at; the basic head is always available. */
export function hairUnlockLevel(sex: Sex, hair: HairStyleId): number {
  return getHead(sex, hair)?.level ?? 1
}

/** Skin tones with a body for each sex. */
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

/** Outfits offered for a sex, in display order: no shirt, then the sex's shirts in unlock order. */
export function outfits(sex: Sex): OutfitId[] {
  return [NO_OUTFIT, ...SHIRTS.filter((shirt) => shirt.sex === sex).map((shirt) => shirt.id)]
}

export function outfitLabel(sex: Sex, outfit: OutfitId): string {
  return getShirt(sex, outfit)?.label ?? 'No shirt'
}

/** The level an outfit unlocks at. No shirt is always available. */
export function outfitUnlockLevel(sex: Sex, outfit: OutfitId): number {
  return getShirt(sex, outfit)?.level ?? 1
}

/**
 * The white T-shirt and its 12 dyed colours (`white-tshirt`, `tshirt-{colour}`) were replaced by
 * the owner's shirts (owner decision, 31 October 2026): a career that wore one gets the sex's
 * first level-1 shirt.
 */
function isRetiredTshirt(outfit: string): boolean {
  return outfit === 'white-tshirt' || outfit.startsWith('tshirt-')
}

/** True if every part of the appearance is unlocked at `level`. */
export function isAppearanceUnlocked(appearance: Appearance, level: number, sex: Sex): boolean {
  return outfitUnlockLevel(sex, appearance.outfit) <= level && hairUnlockLevel(sex, appearance.hair) <= level
}

/**
 * Labels of the options that unlock on reaching a level above `from` up to `to`, in order: the
 * runner's hairstyles (those with art in the runner's skin tone), then the sex's shirts.
 */
export function appearanceUnlocks(from: number, to: number, sex: Sex, skin: SkinToneId): string[] {
  const reached = (level: number) => level > from && level <= to
  const heads = hairStyles(sex, skin)
    .filter((hair) => hair !== BASIC_HAIR && reached(hairUnlockLevel(sex, hair)))
    .map((hair) => hairStyleLabel(sex, hair))
  const shirts = outfits(sex)
    .filter((outfit) => outfit !== NO_OUTFIT && reached(outfitUnlockLevel(sex, outfit)))
    .map((outfit) => outfitLabel(sex, outfit))
  return [...heads, ...shirts]
}

/** Basic head, tone 2, no shirt (owner decision, 29 October 2026). The same for both sexes. */
export function defaultAppearance(): Appearance {
  return { hair: BASIC_HAIR, skin: 'tone-2', outfit: NO_OUTFIT }
}

/** The artwork body for a sex and skin tone, e.g. `female-2`. */
export function bodyId(sex: Sex, skin: SkinToneId): string {
  return `${sex}-${skin.slice('tone-'.length)}`
}

/**
 * Keeps the appearance valid for a sex and its skin tone: a skin tone the sex has no body for
 * becomes the nearest one (tone 4 → tone 3 for women), a hairstyle not offered for that sex
 * and tone becomes the basic head, and a shirt the sex has no art for becomes no shirt (a retired
 * T-shirt becomes the sex's first level-1 shirt). Use it after changing the sex or the skin tone.
 */
export function appearanceForSex(appearance: Appearance, sex: Sex): Appearance {
  const tones = SKIN_TONES[sex]
  const skin = tones.includes(appearance.skin) ? appearance.skin : tones[tones.length - 1]!
  const hair = hairStyles(sex, skin).includes(appearance.hair) ? appearance.hair : BASIC_HAIR
  const offered = outfits(sex)
  const outfit = offered.includes(appearance.outfit)
    ? appearance.outfit
    : isRetiredTshirt(appearance.outfit)
      ? (SHIRTS.find((shirt) => shirt.sex === sex && shirt.level === 1)?.id ?? NO_OUTFIT)
      : NO_OUTFIT
  return { hair, skin, outfit }
}

/**
 * Reads a saved appearance. Missing or unknown values fall back field by field (a tone the sex has
 * no body for becomes the nearest one), so an appearance can never make a career fail to load.
 */
export function parseAppearance(value: unknown, sex: Sex): Appearance {
  const fallback = defaultAppearance()
  if (typeof value !== 'object' || value === null) return fallback
  const { hair, skin, outfit } = value as Record<string, unknown>
  const knownSkin = (SKIN_TONES.male as readonly unknown[]).includes(skin) ? (skin as SkinToneId) : fallback.skin
  return appearanceForSex(
    {
      hair: typeof hair === 'string' ? hair : fallback.hair,
      skin: knownSkin,
      outfit: typeof outfit === 'string' ? outfit : fallback.outfit,
    },
    sex,
  )
}
