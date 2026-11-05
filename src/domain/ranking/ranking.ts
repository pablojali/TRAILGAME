import { csvInt, parseCsv } from '../../data/csv'
import rankingCsv from '../../data/ranking_points.csv?raw'
import { RACES } from '../races/races'

/**
 * World and country rankings (owner request, 5 November 2026): asynchronous, from race results the
 * server decides. A result scores the race's base points × the percent of its finishing position ×
 * the race's reward percent at the runner's level; a season (one calendar month, UTC) counts each
 * player's best results. Training and challenges give no ranking points. Values: the owner's table
 * src/data/ranking_points.csv.
 */
export interface RankingTable {
  bestResults: number
  /** Season 1's month: year and month (1–12), UTC. */
  firstSeason: { year: number; month: number }
  racePoints: Record<string, number>
  /** Percent of the base points by finishing position (1-based); missing: 0. */
  positionPercent: Record<number, number>
}

export function parseRankingTable(text: string): RankingTable {
  const table: RankingTable = { bestResults: 0, firstSeason: { year: 0, month: 0 }, racePoints: {}, positionPercent: {} }
  parseCsv(text).forEach((row, i) => {
    const where = `ranking_points.csv row ${i + 1}`
    if (row.kind === 'setting' && row.key === 'best_results') table.bestResults = csvInt(row.value, where)
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
  if (!table.firstSeason.year) throw new Error('ranking_points.csv: first_season is missing')
  return table
}

export const RANKING: RankingTable = parseRankingTable(rankingCsv)

/** The ranking season of a moment (epoch ms): 1 in Season 1's month, then one per month; 0 before. */
export function rankingSeason(at: number, table: RankingTable = RANKING): number {
  const date = new Date(at)
  const months = (date.getUTCFullYear() - table.firstSeason.year) * 12 + (date.getUTCMonth() + 1 - table.firstSeason.month)
  return months >= 0 ? months + 1 : 0
}

/** The first moment (epoch ms) of a season, and the first of the next one. */
export function seasonBounds(season: number, table: RankingTable = RANKING): { start: number; end: number } {
  const start = Date.UTC(table.firstSeason.year, table.firstSeason.month - 1 + season - 1, 1)
  const end = Date.UTC(table.firstSeason.year, table.firstSeason.month - 1 + season, 1)
  return { start, end }
}

/** Ranking points of a race result: base × position percent × reward percent (whole points). */
export function rankingPoints(raceId: string, position: number, rewardPct: number, table: RankingTable = RANKING): number {
  const base = table.racePoints[raceId] ?? 0
  const percent = table.positionPercent[position] ?? 0
  return Math.round((base * percent * rewardPct) / 10000)
}
