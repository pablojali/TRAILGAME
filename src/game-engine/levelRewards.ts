import { appearanceUnlocks, type SkinToneId } from '../domain/athlete/appearance'
import type { Sex } from '../domain/athlete/athlete'
import { ATTRIBUTE_POINTS_PER_LEVEL } from '../domain/athlete/levels'
import { getMinimumLevel } from '../domain/races/access'
import { RACES, type Race } from '../domain/races/races'

export interface LevelRewards {
  /** Attribute points earned by the levels gained. */
  attributePoints: number
  /** Looks unlocked for the runner (hairstyles in their skin tone, then shirts), by label. */
  looks: string[]
  /** Races that open in the levels gained (each opens 2 levels below its recommended level). */
  races: Race[]
}

/**
 * What reaching level `to` from level `from` brings (owner request, 1 November 2026: a level-up
 * celebration listing the rewards). Read from the game rules; nothing is stored or granted here.
 */
export function getLevelRewards(from: number, to: number, sex: Sex, skin: SkinToneId): LevelRewards {
  const gained = (level: number) => level > from && level <= to
  return {
    attributePoints: Math.max(0, to - from) * ATTRIBUTE_POINTS_PER_LEVEL,
    looks: appearanceUnlocks(from, to, sex, skin),
    races: RACES.filter((race) => gained(getMinimumLevel(race))),
  }
}
