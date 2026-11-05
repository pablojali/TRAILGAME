import { RACE_LANGUAGES, type Race, type RaceLanguage } from '../domain/races/races'
import type { Locale } from './i18n'

/** The race's terrain in the player's language: the race table's terrain_xx column, else English. */
export function raceTerrain(race: Race, locale: Locale): string {
  const language = RACE_LANGUAGES.find((l) => l === locale) as RaceLanguage | undefined
  return (language && race.terrains?.[language]) || race.terrain
}
