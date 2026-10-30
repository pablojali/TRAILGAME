import type { Sex } from './athlete'
import { getHead, HEADS } from './heads'

/**
 * Runner appearance (avatar). Cosmetic only: it selects how the avatar is drawn and never affects
 * any gameplay value. Identifiers are stable and saved; labels are for display.
 *
 * The avatar uses the owner's layered artwork (assets/runner/avatar, prepared by
 * scripts/prepare_avatar_art.py; docs/AVATAR_ART_SPEC.md). The skin tone selects the body, which
 * has a basic head (men bald, women basic hair). The hair is either that basic head ('natural') or
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
 * T-shirt colours unlocked by level, one per level from Level 2 (owner request, 30 October 2026:
 * each level-up brings new customization). They tint the white T-shirt artwork, so they need no
 * new art. In unlock order.
 */
export const TSHIRT_COLORS = [
  { id: 'red', label: 'Red', hex: '#d6453a', level: 2 },
  { id: 'orange', label: 'Orange', hex: '#f07c2a', level: 3 },
  { id: 'yellow', label: 'Yellow', hex: '#f2c531', level: 4 },
  { id: 'lime', label: 'Lime', hex: '#9bcf3a', level: 5 },
  { id: 'green', label: 'Green', hex: '#2f9e5b', level: 6 },
  { id: 'teal', label: 'Teal', hex: '#1fa3a0', level: 7 },
  { id: 'sky', label: 'Sky blue', hex: '#4aa8e8', level: 8 },
  { id: 'blue', label: 'Blue', hex: '#2f5fd0', level: 9 },
  { id: 'purple', label: 'Purple', hex: '#7b4bc4', level: 10 },
  { id: 'pink', label: 'Pink', hex: '#e0609c', level: 11 },
  { id: 'navy', label: 'Navy', hex: '#24356b', level: 12 },
  { id: 'black', label: 'Black', hex: '#2e2e33', level: 13 },
] as const

export type TshirtColorId = (typeof TSHIRT_COLORS)[number]['id']

/**
 * Top worn over the body: none (as drawn: sports top or bare chest), the white T-shirt, or a
 * coloured T-shirt.
 */
export type OutfitId = 'none' | 'white-tshirt' | `tshirt-${TshirtColorId}`

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
  return [BASIC_HAIR, ...HEADS.filter((h) => h.sex === sex && h.art[toneNumber(skin)]).map((h) => h.id)]
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

export const OUTFITS: readonly OutfitId[] = [
  'none',
  'white-tshirt',
  ...TSHIRT_COLORS.map((color) => `tshirt-${color.id}` as const),
]

export const OUTFIT_LABELS = Object.fromEntries([
  ['none', 'No shirt'],
  ['white-tshirt', 'White T-shirt'],
  ...TSHIRT_COLORS.map((color) => [`tshirt-${color.id}`, `${color.label} T-shirt`]),
]) as Record<OutfitId, string>

function tshirtColor(outfit: OutfitId) {
  return TSHIRT_COLORS.find((color) => outfit === `tshirt-${color.id}`)
}

/** The colour a T-shirt tints the white T-shirt artwork with, or null for an untinted outfit. */
export function outfitTint(outfit: OutfitId): string | null {
  return tshirtColor(outfit)?.hex ?? null
}

/** The level an outfit unlocks at. Skin tones, hair and the starting outfits are always available. */
export function outfitUnlockLevel(outfit: OutfitId): number {
  return tshirtColor(outfit)?.level ?? 1
}

/** True if every part of the appearance is unlocked at `level`. */
export function isAppearanceUnlocked(appearance: Appearance, level: number, sex: Sex): boolean {
  return outfitUnlockLevel(appearance.outfit) <= level && hairUnlockLevel(sex, appearance.hair) <= level
}

/**
 * Labels of the options that unlock on reaching a level above `from` up to `to`, in order: the
 * runner's hairstyles (those with art in the runner's skin tone), then outfits.
 */
export function appearanceUnlocks(from: number, to: number, sex: Sex, skin: SkinToneId): string[] {
  const reached = (level: number) => level > from && level <= to
  const heads = hairStyles(sex, skin)
    .filter((hair) => hair !== BASIC_HAIR && reached(hairUnlockLevel(sex, hair)))
    .map((hair) => hairStyleLabel(sex, hair))
  return [...heads, ...OUTFITS.filter((outfit) => reached(outfitUnlockLevel(outfit))).map((o) => OUTFIT_LABELS[o])]
}

/** Basic head, tone 2, no shirt (owner decision, 29 October 2026). The same for both sexes. */
export function defaultAppearance(): Appearance {
  return { hair: BASIC_HAIR, skin: 'tone-2', outfit: 'none' }
}

/** The artwork body for a sex and skin tone, e.g. `female-2`. */
export function bodyId(sex: Sex, skin: SkinToneId): string {
  return `${sex}-${skin.slice('tone-'.length)}`
}

/**
 * Keeps the appearance valid for a sex and its skin tone: a skin tone the sex has no body for
 * becomes the nearest one (tone 4 → tone 3 for women), and a hairstyle not offered for that sex
 * and tone becomes the basic head. Use it after changing the sex or the skin tone.
 */
export function appearanceForSex(appearance: Appearance, sex: Sex): Appearance {
  const tones = SKIN_TONES[sex]
  const skin = tones.includes(appearance.skin) ? appearance.skin : tones[tones.length - 1]!
  const hair = hairStyles(sex, skin).includes(appearance.hair) ? appearance.hair : BASIC_HAIR
  return { ...appearance, skin, hair }
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
      outfit: (OUTFITS as readonly unknown[]).includes(outfit) ? (outfit as OutfitId) : fallback.outfit,
    },
    sex,
  )
}
