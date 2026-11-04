import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import raceFieldCsv from '../../data/race_field.csv?raw'
import { isRaceCategory, RACE_CATEGORIES, type RaceCategory } from './categories'
import { isAidStop, isIntensity, type AidStop, type Intensity } from './strategyConfig'

/**
 * How the field of each race category is built, from the owner's table src/data/race_field.csv
 * (owner request, 4 November 2026). Checked when the game loads: one row per category.
 */
export interface RaceFieldRow {
  category: RaceCategory
  /** Attribute points per level (each attribute) the typical runner gains from training. */
  trainingGain: number
  /** Extra Fitness of the typical runner at level 1, fading to none at level 30. */
  fitnessBonus: number
  /**
   * How the front of the field races: the first `frontRanks` rivals. `best`: the intensity or stop
   * that gives the fastest time on that course (all segments the same).
   */
  frontIntensity: Intensity | 'best'
  frontStop: AidStop | 'best'
  frontRanks: number
}

export function parseRaceField(text: string): Record<RaceCategory, RaceFieldRow> {
  const rows = parseCsv(text).map((row, i): RaceFieldRow => {
    const where = `race_field.csv row ${i + 1}`
    if (!isRaceCategory(row.category)) throw new Error(`${where}: unknown category "${row.category}"`)
    if (!isIntensity(row.front_intensity) && row.front_intensity !== 'best') throw new Error(`${where}: unknown front_intensity "${row.front_intensity}"`)
    if (!isAidStop(row.front_stop) && row.front_stop !== 'best') throw new Error(`${where}: unknown front_stop "${row.front_stop}"`)
    const parsed = {
      category: row.category,
      trainingGain: csvNumber(row.training_gain, where),
      fitnessBonus: csvNumber(row.fitness_bonus, where),
      frontIntensity: row.front_intensity as Intensity | 'best',
      frontStop: row.front_stop as AidStop | 'best',
      frontRanks: csvInt(row.front_ranks, where),
    }
    if (parsed.trainingGain < 0) throw new Error(`${where}: training_gain must not be negative`)
    if (parsed.fitnessBonus < 0 || parsed.fitnessBonus > 65) throw new Error(`${where}: fitness_bonus must be 0–65`)
    if (parsed.frontRanks < 0 || parsed.frontRanks > 29) throw new Error(`${where}: front_ranks must be 0–29`)
    return parsed
  })
  const table = Object.fromEntries(rows.map((row) => [row.category, row])) as Record<RaceCategory, RaceFieldRow>
  for (const category of RACE_CATEGORIES) {
    if (rows.filter((row) => row.category === category).length !== 1) {
      throw new Error(`race_field.csv: needs exactly one row for "${category}"`)
    }
  }
  return table
}

export const RACE_FIELD: Readonly<Record<RaceCategory, RaceFieldRow>> = parseRaceField(raceFieldCsv)
