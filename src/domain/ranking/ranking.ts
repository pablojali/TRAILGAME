import { csvInt, parseCsv } from '../../data/csv'
import rankingCsv from '../../data/ranking_points.csv?raw'
import { RACES } from '../races/races'

/**
 * World and country rankings (owner requests, 5 November 2026; points system v3 the same day):
 * asynchronous, from race results the server decides. A result scores
 *   difficulty base points × position percent × competition percent, rounded to whole points.
 * The runner's level and sex never change the points (Game Design Bible §11.1): level only sets
 * which races a runner may enter. Two rankings:
 * - Season: one calendar month (UTC; Season 1 = January … Season 12 = December), each runner's best
 *   results of that month;
 * - Annual: each season's best results from the last 12 months, expiring day by day.
 * Training and challenges give no ranking points. Values: src/data/ranking_points.csv.
 */
export const DIFFICULTIES = ['I', 'II', 'III', 'IV', 'V'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Competition formats: standard races, the weekly Majors and the annual World Cup (future events). */
export const COMPETITIONS = ['standard', 'major', 'world_cup'] as const
export type Competition = (typeof COMPETITIONS)[number]

export interface RankingTable {
  bestResults: number
  /** The first season with points (launch): results before it never count. */
  firstSeason: { year: number; month: number }
  /** Months the Annual ranking looks back. */
  annualMonths: number
  /** Base points of each difficulty. */
  difficultyPoints: Record<Difficulty, number>
  /** The difficulty of each race. */
  raceDifficulty: Record<string, Difficulty>
  /** Percent of the base points by finishing position (1-based); missing: 0. */
  positionPercent: Record<number, number>
  /** Percent of each competition format (standard 100). */
  competitionPercent: Record<Competition, number>
}

const isDifficulty = (value: unknown): value is Difficulty => DIFFICULTIES.includes(value as Difficulty)
const isCompetition = (value: unknown): value is Competition => COMPETITIONS.includes(value as Competition)

/** Reads the ranking table; `raceIds` are the races it may name (the catalog's by default). */
export function parseRankingTable(text: string, raceIds: readonly string[] = RACES.map((race) => race.id)): RankingTable {
  const table: RankingTable = {
    bestResults: 0,
    firstSeason: { year: 0, month: 0 },
    annualMonths: 0,
    difficultyPoints: {} as Record<Difficulty, number>,
    raceDifficulty: {},
    positionPercent: {},
    competitionPercent: {} as Record<Competition, number>,
  }
  parseCsv(text).forEach((row, i) => {
    const where = `ranking_points.csv row ${i + 1}`
    if (row.kind === 'setting' && row.key === 'best_results') table.bestResults = csvInt(row.value, where)
    else if (row.kind === 'setting' && row.key === 'annual_months') table.annualMonths = csvInt(row.value, where)
    else if (row.kind === 'setting' && row.key === 'first_season') {
      const match = /^(\d{4})-(\d{2})$/.exec(row.value ?? '')
      if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error(`${where}: first_season must be YYYY-MM`)
      table.firstSeason = { year: Number(match[1]), month: Number(match[2]) }
    } else if (row.kind === 'difficulty') {
      if (!isDifficulty(row.key)) throw new Error(`${where}: unknown difficulty "${row.key}" (I to V)`)
      table.difficultyPoints[row.key] = csvInt(row.value, where)
    } else if (row.kind === 'race') {
      if (!raceIds.includes(row.key ?? '')) throw new Error(`${where}: unknown race "${row.key}"`)
      if (!isDifficulty(row.value)) throw new Error(`${where}: the difficulty must be I to V`)
      table.raceDifficulty[row.key!] = row.value
    } else if (row.kind === 'position') {
      const position = csvInt(row.key, where)
      const percent = csvInt(row.value, where)
      if (position < 1 || percent < 0 || percent > 100) throw new Error(`${where}: position from 1, percent 0–100`)
      table.positionPercent[position] = percent
    } else if (row.kind === 'competition') {
      if (!isCompetition(row.key)) throw new Error(`${where}: unknown competition "${row.key}"`)
      table.competitionPercent[row.key] = csvInt(row.value, where)
    } else throw new Error(`${where}: unknown row "${row.kind},${row.key}"`)
  })
  if (table.bestResults < 1) throw new Error('ranking_points.csv: best_results must be at least 1')
  if (table.annualMonths < 1) throw new Error('ranking_points.csv: annual_months must be at least 1')
  if (!table.firstSeason.year) throw new Error('ranking_points.csv: first_season is missing')
  for (const difficulty of DIFFICULTIES) {
    if (table.difficultyPoints[difficulty] === undefined) throw new Error(`ranking_points.csv: difficulty ${difficulty} is missing`)
  }
  for (const competition of COMPETITIONS) {
    if (table.competitionPercent[competition] === undefined) throw new Error(`ranking_points.csv: competition ${competition} is missing`)
  }
  return table
}

export const RANKING: RankingTable = parseRankingTable(rankingCsv)

/** A season id: year × 100 + month, e.g. 202611 for Season 11 of 2026. */
export type SeasonId = number

export function seasonId(year: number, number: number): SeasonId {
  return year * 100 + number
}

/** The year and the season number (1–12) of a season id. */
export function seasonParts(id: SeasonId): { year: number; number: number } {
  return { year: Math.floor(id / 100), number: id % 100 }
}

/** The season of a moment (epoch ms, UTC month), or 0 before the first season with points. */
export function rankingSeason(at: number, table: RankingTable = RANKING): SeasonId {
  const date = new Date(at)
  const id = seasonId(date.getUTCFullYear(), date.getUTCMonth() + 1)
  return id >= seasonId(table.firstSeason.year, table.firstSeason.month) ? id : 0
}

export function firstSeason(table: RankingTable = RANKING): SeasonId {
  return seasonId(table.firstSeason.year, table.firstSeason.month)
}

/** The season `offset` seasons away (−1: the previous one), across years. */
export function shiftSeason(id: SeasonId, offset: number): SeasonId {
  const { year, number } = seasonParts(id)
  const index = year * 12 + (number - 1) + offset
  return seasonId(Math.floor(index / 12), (index % 12) + 1)
}

/** The first moment (epoch ms) of a season, and the first of the next one (UTC). */
export function seasonBounds(id: SeasonId): { start: number; end: number } {
  const { year, number } = seasonParts(id)
  return { start: Date.UTC(year, number - 1, 1), end: Date.UTC(year, number, 1) }
}

/** The difficulty of a race (I when the table has none for it). */
export function raceDifficulty(raceId: string, table: RankingTable = RANKING): Difficulty {
  return table.raceDifficulty[raceId] ?? 'I'
}

/**
 * Ranking points of a race result: difficulty base × position percent × competition percent,
 * rounded to whole points. Never depends on the runner's level or sex.
 */
export function rankingPoints(
  raceId: string,
  position: number,
  competition: Competition = 'standard',
  table: RankingTable = RANKING,
): number {
  const base = table.difficultyPoints[raceDifficulty(raceId, table)]
  const percent = table.positionPercent[position] ?? 0
  return Math.round((base * percent * table.competitionPercent[competition]) / 10000)
}
