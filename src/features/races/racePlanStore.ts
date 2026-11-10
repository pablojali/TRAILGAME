import type { Intensity } from '../../domain/races/strategyConfig'
import { isIntensity } from '../../domain/races/strategyConfig'
import { RACE_STYLES, type RaceStyle } from '../../game-engine/racePlan'

/**
 * The race strategy chosen in the preparation (owner request, 10 November 2026): the style and the
 * segments the player set by hand. Kept on this device per race entry, only to propose the
 * intensity at each aid station; the server never needs it (every step sends its own intensity).
 */
export interface StoredRacePlan {
  style: RaceStyle
  /** The player's own intensity per segment (by segment index), null where the style decides. */
  fixed: (Intensity | null)[]
}

const key = (entryId: string) => `trail-manager.race-plan.${entryId}`

export function loadRacePlan(entryId: string): StoredRacePlan | null {
  try {
    const raw = localStorage.getItem(key(entryId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { style, fixed } = value as { style?: unknown; fixed?: unknown }
    if (!RACE_STYLES.includes(style as RaceStyle) || !Array.isArray(fixed)) return null
    return { style: style as RaceStyle, fixed: fixed.map((f) => (isIntensity(f) ? f : null)) }
  } catch {
    return null
  }
}

export function saveRacePlan(entryId: string, plan: StoredRacePlan): void {
  try {
    localStorage.setItem(key(entryId), JSON.stringify(plan))
  } catch {
    // Private mode or storage full: the aid stations then propose the last intensity, as before.
  }
}
