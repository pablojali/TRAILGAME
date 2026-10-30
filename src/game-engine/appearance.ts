import { isAppearanceUnlocked, parseAppearance, type Appearance } from '../domain/athlete/appearance'
import { getLevel } from '../domain/athlete/levels'
import type { GameState } from './gameState'

export type AppearanceError =
  /** A value that does not exist for the runner's sex. */
  | 'invalid'
  /** An option the runner's level has not unlocked yet. */
  | 'locked'

/**
 * Changes the runner's appearance after creation. Cosmetic only: nothing else in the state changes.
 * The sex is fixed; options above the runner's level are refused.
 */
export function setAppearance(
  state: GameState,
  appearance: Appearance,
): { ok: true; state: GameState } | { ok: false; error: AppearanceError } {
  const { athlete } = state
  const parsed = parseAppearance(appearance, athlete.sex)
  if (parsed.hair !== appearance.hair || parsed.skin !== appearance.skin || parsed.outfit !== appearance.outfit) {
    return { ok: false, error: 'invalid' }
  }
  if (!isAppearanceUnlocked(parsed, getLevel(athlete.xp))) return { ok: false, error: 'locked' }
  return { ok: true, state: { ...state, athlete: { ...athlete, appearance: parsed } } }
}
