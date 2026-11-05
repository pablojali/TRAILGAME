import { csvInt, parseCsv } from '../../data/csv'
import racesCsv from '../../data/races.csv?raw'
import { isRaceCategory, type RaceCategory } from './categories'

/** Languages the race table has terrain texts for (English is the terrain column). */
export const RACE_LANGUAGES = ['es', 'fr', 'it', 'de'] as const
export type RaceLanguage = (typeof RACE_LANGUAGES)[number]

/** Descent technicality runs from 0 (none) to this (extreme); owner decision, 5 November 2026. */
export const MAX_TECHNICALITY = 5

/**
 * The race catalog: the owner's table src/data/races.csv (owner request, 5 November 2026; until
 * then the Game Design Bible §10.4 list in code). Fictional events; ids are stable and saved.
 */
export interface Race {
  id: string
  name: string
  /** Internal (XP, coin prizes, the rivals' field): not shown, never decides ranking points. */
  category: RaceCategory
  distanceKm: number
  elevationGainM: number
  /** Terrain in English; `terrains` in the other languages. */
  terrain: string
  terrains?: Partial<Record<RaceLanguage, string>>
  /** The race's level: runners may enter from 5 levels below to 2 above. */
  recommendedLevel: number
  /** Descent technicality, 0 (none) to 5 (extreme), used by the race simulation. */
  technicality: number
}

/** Reads the race table; throws with the row on any mistake. */
export function parseRaces(text: string): Race[] {
  const races: Race[] = []
  const seen = new Set<string>()
  parseCsv(text).forEach((row, i) => {
    const where = `races.csv row ${i + 1}`
    const id = row.id ?? ''
    if (!/^RACE-\d{3}$/.test(id)) throw new Error(`${where}: id must look like RACE-013`)
    if (seen.has(id)) throw new Error(`${where}: ${id} is listed twice`)
    seen.add(id)
    if (!row.name) throw new Error(`${where}: name is missing`)
    if (!isRaceCategory(row.category)) throw new Error(`${where}: category must be open, trail, mountain or elite`)
    if (!row.terrain) throw new Error(`${where}: terrain is missing`)
    const race: Race = {
      id,
      name: row.name,
      category: row.category,
      distanceKm: csvInt(row.distance_km, where),
      elevationGainM: csvInt(row.elevation_gain_m, where),
      terrain: row.terrain,
      recommendedLevel: csvInt(row.recommended_level, where),
      technicality: csvInt(row.technicality, where),
    }
    if (race.distanceKm < 1) throw new Error(`${where}: distance_km must be at least 1`)
    if (race.elevationGainM < 0) throw new Error(`${where}: elevation_gain_m cannot be negative`)
    if (race.recommendedLevel < 1) throw new Error(`${where}: recommended_level must be at least 1`)
    if (race.technicality < 0 || race.technicality > MAX_TECHNICALITY) {
      throw new Error(`${where}: technicality must be 0 to ${MAX_TECHNICALITY}`)
    }
    const terrains: Partial<Record<RaceLanguage, string>> = {}
    for (const language of RACE_LANGUAGES) {
      const text = row[`terrain_${language}`]
      if (text) terrains[language] = text
    }
    if (Object.keys(terrains).length) race.terrains = terrains
    races.push(race)
  })
  if (races.length === 0) throw new Error('races.csv: no races')
  // Listed from the easiest: the Races screen and the level-up rewards follow the recommended level.
  return races.sort((x, y) => x.recommendedLevel - y.recommendedLevel || x.id.localeCompare(y.id))
}

export const RACES: readonly Race[] = parseRaces(racesCsv)

const BY_ID = new Map(RACES.map((race) => [race.id, race]))

export function getRace(id: string): Race | undefined {
  return BY_ID.get(id)
}

export function isRaceId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value)
}
