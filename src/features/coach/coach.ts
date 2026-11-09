import type { Sex } from '../../domain/athlete/athlete'
import type { SkinToneId } from '../../domain/athlete/appearance'

/**
 * The Trail Coach (owner request, 8 November 2026): the player's guide, drawn from the owner's art
 * in assets/coach (prepared by scripts/prepare_coach_art.py). The coach matches the player's runner,
 * derived from the current look every time, so it follows any change made in Appearance.
 */
export type CoachLook = 'dark' | 'asian' | 'light'

/** Skin tone → coach (owner decision, 8 November 2026: tone 4 is the Asian coach for both sexes). */
const LOOK_BY_TONE: Record<SkinToneId, CoachLook> = {
  'tone-1': 'dark',
  'tone-2': 'asian',
  'tone-3': 'light',
  'tone-4': 'asian',
}

export function coachLook(skin: SkinToneId): CoachLook {
  return LOOK_BY_TONE[skin]
}

const PORTRAITS = import.meta.glob<string>('/assets/coach/portraits/*.webp', { eager: true, import: 'default' })

/** The coach's portrait (512 × 512, transparent) for a runner, or null if the art is missing. */
export function coachPortrait(sex: Sex, skin: SkinToneId): string | null {
  return PORTRAITS[`/assets/coach/portraits/${sex === 'male' ? 'men' : 'women'}_${coachLook(skin)}.webp`] ?? null
}

/** Screens of the first welcome, in order. */
export const WELCOME_STEPS = ['welcome', 'start'] as const
