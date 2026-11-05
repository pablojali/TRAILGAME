import { csvInt, parseCsv } from '../../data/csv'
import rankingCsv from '../../data/ranking_points.csv?raw'
import { RACES } from '../races/races'

/**
 * World and country rankings (owner requests, 5 November 2026): asynchronous, from race results the
 * server decides. A result scores the race's base points × the percent of its finishing position ×
 * the race's reward percent at the runner's level. Two rankings:
 * - Season: one calendar month (UTC; Season 1 = January … Season 12 = December), each player's best
 *   results of that month;
 * - Annual: each season's best results from the last 12 months, expiring day by day.
 * Training and challenges give no ranking points. Values: src/data/ranking_points.csv.
 */
export interface RankingTable {
  bestResults: number
  /** The first season with points (launch): results before it never count. */
  firstSeason: { year: number; month: number }
  /** Months the Annual ranking looks back. */
  annualMonths: number
  racePoints: Record<string, number>
  /** Percent of the base points by finishing position (1-based); missing: 0. */
  positionPercent: Record<number, number>
}

export function parseRankingTable(text: string): RankingTable {
  const table: RankingTable = { bestResults: 0, firstSeason: { year: 0, month: 0 }, annualMonths: 0, racePoints: {}, positionPercent: {} }
  parseCsv(text).forEach((row, i) => {
    const where = `ranking_points.csv row ${i + 1}`
    if (row.kind === 'setting' && row.key === 'best_results') table.bestResults = csvInt(row.value, where)
    else if (row.kind === 'setting' && row.key === 'annual_months') table.annualMonths = csvInt(row.value, where)
    else if (row.kind === 'setting' && row.key === 'first_season') {
      const match = /^(\d{4})-(\d{2})$/.exec(row.value ?? '')
      if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error(`${where}: first_season must be YYYY-MM`)
      table.firstSeason = { year: Number(match[1]), month: Number(match[2]) }
    } else if (row.kind === 'race') {
      if (!RACES.some((race) => race.id === row.key)) throw new Error(`${where}: unknown race "${row.key}"`)
      table.racePoints[row.key!] = csvInt(row.value, where)
    } else if (row.kind === 'position') {
      const position = csvInt(row.key, where)
      const percent = csvInt(row.value, where)
      if (position < 1 || percent < 0 || percent > 100) throw new Error(`${where}: position from 1, percent 0–100`)
      table.positionPercent[position] = percent
    } else throw new Error(`${where}: unknown row "${row.kind},${row.key}"`)
  })
  if (table.bestResults < 1) throw new Error('ranking_points.csv: best_results must be at least 1')
  if (table.annualMonths < 1) throw new Error('ranking_points.csv: annual_months must be at least 1')
  if (!table.firstSeason.year) throw new Error('ranking_points.csv: first_season is missing')
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

/** Ranking points of a race result: base × position percent × reward percent (whole points). */
export function rankingPoints(raceId: string, position: number, rewardPct: number, table: RankingTable = RANKING): number {
  const base = table.racePoints[raceId] ?? 0
  const percent = table.positionPercent[position] ?? 0
  return Math.round((base * percent * rewardPct) / 10000)
}
