import { DIFFICULTIES, raceDifficulty, type Difficulty } from '../ranking/ranking'
import type { Race } from './races'

/**
 * How races are shown (owner decision, 5 November 2026, points system v3): their format and their
 * difficulty, not the Open / Trail / Mountain / Elite categories, which stay internal (XP, coin
 * prizes and the rivals' field). Majors and the World Cup are competitions, not formats.
 */
export type RaceFormat = 'trail' | 'ultra'

/** Races longer than a marathon are Ultra Trails. */
export const ULTRA_OVER_KM = 42

export function raceFormat(race: Race): RaceFormat {
  return race.distanceKm > ULTRA_OVER_KM ? 'ultra' : 'trail'
}

export { DIFFICULTIES, type Difficulty }

export function difficultyOf(race: Race): Difficulty {
  return raceDifficulty(race.id)
}

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty)
}
