import { csvInt, csvNumber, parseCsv } from '../../data/csv'
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
  /**
   * The owner's own segments (Trail Studio, 12 November 2026): each one's distance, ascent, descent
   * and descent technicality, an aid station between two. Missing: the course is generated from the
   * totals and cut every ~6 km. When present, the totals above are their sums.
   */
  segments?: CourseSpec[]
  /** Entry levels set by hand; missing: from the recommended level (5 below, 2 above). */
  minLevel?: number
  maxLevel?: number
  /** Seconds of each stop set by hand; missing: from the race's effort. */
  stopS?: StopSeconds
}

/** One segment as the owner sets it. */
export interface CourseSpec {
  distanceKm: number
  gainM: number
  lossM: number
  technicality: number
}

export interface StopSeconds {
  quick: number
  normal: number
  slow: number
}

/** The parts of a race that make its course: kept with a race in progress (a later edit never changes it). */
export type RaceCourse = Pick<Race, 'distanceKm' | 'elevationGainM' | 'technicality'> & Pick<Race, 'segments' | 'stopS'>

/** Segments a race may have when the owner sets them (an aid station between two). */
export const MIN_SEGMENTS = 2
export const MAX_SEGMENTS = 20

export function courseOf(race: Race): RaceCourse {
  return {
    distanceKm: race.distanceKm,
    elevationGainM: race.elevationGainM,
    technicality: race.technicality,
    ...(race.segments ? { segments: race.segments.map((s) => ({ ...s })) } : {}),
    ...(race.stopS ? { stopS: { ...race.stopS } } : {}),
  }
}

/** The race with a course kept from when it started (a race in progress), or as it is now. */
export function withCourse(race: Race, course: RaceCourse | undefined): Race {
  if (!course) return race
  const { segments, stopS, ...totals } = course
  const merged: Race = { ...race, ...totals }
  delete merged.segments
  delete merged.stopS
  return { ...merged, ...(segments ? { segments } : {}), ...(stopS ? { stopS } : {}) }
}

/** `km:ascent:descent:technicality` per segment, `|` between segments, e.g. `6.5:420:120:2|5:0:300:3`. */
export function formatSegments(segments: readonly CourseSpec[]): string {
  return segments.map((s) => `${s.distanceKm}:${s.gainM}:${s.lossM}:${s.technicality}`).join('|')
}

/** Reads the `segments` column; throws naming the row on any mistake. */
export function parseSegments(text: string, where: string): CourseSpec[] {
  const segments = text.split('|').map((part, i) => {
    const fields = part.split(':')
    const at = `${where}, segment ${i + 1}`
    if (fields.length !== 4) throw new Error(`${at}: write km:ascent:descent:technicality`)
    const [km, gain, loss, tech] = fields.map((f) => f.trim())
    const spec: CourseSpec = {
      distanceKm: csvNumber(km, at),
      gainM: csvInt(gain, at),
      lossM: csvInt(loss, at),
      technicality: csvInt(tech, at),
    }
    if (!(spec.distanceKm >= 0.5) || Math.round(spec.distanceKm * 10) !== spec.distanceKm * 10) {
      throw new Error(`${at}: distance must be at least 0.5 km, with at most 1 decimal`)
    }
    if (spec.gainM < 0 || spec.lossM < 0) throw new Error(`${at}: ascent and descent cannot be negative`)
    if (spec.technicality < 0 || spec.technicality > MAX_TECHNICALITY) throw new Error(`${at}: technicality must be 0 to ${MAX_TECHNICALITY}`)
    // A segment's climbs and descents together at most at the course's steepest average gradient.
    if ((spec.gainM + spec.lossM) / (spec.distanceKm * 1000) > MAX_SEGMENT_GRADIENT) {
      throw new Error(`${at}: ${spec.gainM} m up and ${spec.lossM} m down do not fit in ${spec.distanceKm} km`)
    }
    return spec
  })
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
    throw new Error(`${where}: a race has ${MIN_SEGMENTS} to ${MAX_SEGMENTS} segments`)
  }
  return segments
}

/** Ascent plus descent over a segment's length, at most (the generated course's own limit). */
export const MAX_SEGMENT_GRADIENT = 0.4

/** Sum of the segments' distances, to 1 decimal. */
export function segmentsDistanceKm(segments: readonly CourseSpec[]): number {
  return Math.round(segments.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10
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
      distanceKm: csvNumber(row.distance_km, where),
      elevationGainM: csvInt(row.elevation_gain_m, where),
      terrain: row.terrain,
      recommendedLevel: csvInt(row.recommended_level, where),
      technicality: csvInt(row.technicality, where),
    }
    if (row.segments) {
      const segments = parseSegments(row.segments, where)
      race.segments = segments
      // The totals are the segments' sums (Trail Studio writes them; a hand edit that disagrees is refused).
      const km = segmentsDistanceKm(segments)
      const gain = segments.reduce((sum, s) => sum + s.gainM, 0)
      if (Math.abs(km - race.distanceKm) > 0.05 || gain !== race.elevationGainM) {
        throw new Error(`${where}: distance_km and elevation_gain_m must be the segments' sums (${km} km, ${gain} m)`)
      }
      race.technicality = Math.max(...segments.map((s) => s.technicality))
    }
    if (row.min_level || row.max_level) {
      const min = row.min_level ? csvInt(row.min_level, where) : undefined
      const max = row.max_level ? csvInt(row.max_level, where) : undefined
      if (min !== undefined && min < 1) throw new Error(`${where}: min_level must be at least 1`)
      if (min !== undefined && max !== undefined && max < min) throw new Error(`${where}: max_level is below min_level`)
      if (min !== undefined) race.minLevel = min
      if (max !== undefined) race.maxLevel = max
    }
    if (row.stop_quick_s || row.stop_normal_s || row.stop_slow_s) {
      const stopS = { quick: csvInt(row.stop_quick_s, where), normal: csvInt(row.stop_normal_s, where), slow: csvInt(row.stop_slow_s, where) }
      if (!(stopS.quick >= 0 && stopS.quick <= stopS.normal && stopS.normal <= stopS.slow && stopS.slow <= 3600)) {
        throw new Error(`${where}: stops must go quick ≤ normal ≤ slow, 0 to 3600 seconds (all three, or none)`)
      }
      race.stopS = stopS
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
