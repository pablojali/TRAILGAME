import { describe, expect, it, vi } from 'vitest'
import { firstSeason, parseRankingTable, raceDifficulty, rankingPoints, rankingSeason, seasonBounds, seasonParts, shiftSeason } from './ranking'
import { newGame, onSunday, withAthlete, withEntry } from '../../test/gameFixtures'
import { raceCurrentDay } from '../../game-engine/races'
import { parseGameState } from '../../repositories/gameRepository'

vi.unmock('../../data/ranking_points.csv?raw')
const { default: rankingCsv } = await import('../../data/ranking_points.csv?raw')
const rankingCsvWith = (line: string) => rankingCsv.replace('participation,major,10', line)

describe('rankings (owner requests, 5 November 2026)', () => {
  it('has one season per calendar month (UTC), numbered 1–12 in each year, from launch', () => {
    expect(rankingSeason(Date.UTC(2026, 9, 31, 23, 59))).toBe(0)
    expect(rankingSeason(Date.UTC(2026, 10, 1))).toBe(202611)
    expect(seasonParts(202611)).toEqual({ year: 2026, number: 11 })
    expect(rankingSeason(Date.UTC(2027, 0, 15))).toBe(202701)
    expect(firstSeason()).toBe(202611)
    expect(shiftSeason(202612, 1)).toBe(202701)
    expect(shiftSeason(202701, -1)).toBe(202612)
    expect(seasonBounds(202612)).toEqual({ start: Date.UTC(2026, 11, 1), end: Date.UTC(2027, 0, 1) })
  })

  it('scores difficulty base × position percent × competition percent, in whole points (points system v3)', () => {
    expect(raceDifficulty('RACE-001')).toBe('I')
    expect(raceDifficulty('RACE-007')).toBe('III')
    expect(raceDifficulty('RACE-012')).toBe('V')
    // 5th in a Difficulty I race: 100 × 65 %; 12th in Difficulty III: 160 × 40 %.
    expect(rankingPoints('RACE-001', 5)).toBe(65)
    expect(rankingPoints('RACE-007', 12)).toBe(64)
    expect(rankingPoints('RACE-001', 1)).toBe(100)
    expect(rankingPoints('RACE-012', 1)).toBe(250)
    // Positions after 30th score nothing; 21st–25th 12 %, 26th–30th 8 %.
    expect(rankingPoints('RACE-012', 25)).toBe(30)
    expect(rankingPoints('RACE-012', 30)).toBe(20)
    expect(rankingPoints('RACE-012', 31)).toBe(0)
    expect(rankingPoints('RACE-001', 99)).toBe(0)
  })

  it('Majors give exactly 1.5 times and the World Cup exactly 2 times the standard points (rounded once, at the end)', () => {
    const BASE = { 'RACE-001': 100, 'RACE-004': 125, 'RACE-007': 160, 'RACE-009': 200, 'RACE-012': 250 }
    const PERCENT = [100, 85, 75, 70, 65, 60, 56, 52, 48, 45, 43, 40, 37, 34, 31, 28, 25, 22, 19, 16, 12, 12, 12, 12, 12, 8, 8, 8, 8, 8, 0]
    for (const [race, base] of Object.entries(BASE)) {
      PERCENT.forEach((percent, i) => {
        const standard = (base * percent) / 100 // before rounding
        expect(rankingPoints(race, i + 1)).toBe(Math.round(standard))
        // A Major always gives at least its participation points (10).
        expect(rankingPoints(race, i + 1, 'major')).toBe(Math.max(10, Math.round(standard * 1.5)))
        expect(rankingPoints(race, i + 1, 'world_cup')).toBe(Math.round(standard * 2))
      })
    }
    // 5th in a Difficulty I Major: 97.5, rounded to 98; 5th in a Difficulty V World Cup: 325.
    expect(rankingPoints('RACE-001', 5, 'major')).toBe(98)
    expect(rankingPoints('RACE-012', 5, 'world_cup')).toBe(325)
  })

  it('a Major always gives its participation points, whatever the place (owner request, 12 November 2026)', () => {
    expect(rankingPoints('RACE-008', 50, 'major')).toBe(10)
    expect(rankingPoints('RACE-008', 50)).toBe(0)
    const text = rankingCsvWith('participation,major,25')
    const table = parseRankingTable(text, [...text.matchAll(/^race,(RACE-\d{3}),/gm)].map((m) => m[1]!))
    expect(rankingPoints('RACE-008', 48, 'major', table)).toBe(25)
  })

  it('never depends on the runner: the same race and position give the same points at any level or sex', () => {
    const now = Date.UTC(2026, 10, 8, 12)
    const points = (xp: number, sex: 'male' | 'female') => {
      const base = withAthlete(newGame(), { xp })
      const entered = withEntry({ ...base, athlete: { ...base.athlete, sex } }, 'RACE-004', now)
      const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, now)
      if (!raced.ok) throw new Error(raced.error)
      const { result } = raced.value.entry
      return { position: result.position, points: result.rankingPoints, expected: rankingPoints('RACE-004', result.position) }
    }
    // Levels 6 (5 below the recommended 11), 11 and 13 (2 above), men and women.
    for (const xp of [1000, 3250, 4500]) {
      for (const sex of ['male', 'female'] as const) {
        const { points: got, expected } = points(xp, sex)
        expect(got).toBe(expected)
      }
    }
  })

  it('stores the season, points and moment with a result the server finishes, and saves them', () => {
    const now = Date.UTC(2026, 10, 8, 12)
    const entered = withEntry(withAthlete(newGame(), { xp: 1000 }), 'RACE-001', now)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, now)
    if (!raced.ok) throw new Error(raced.error)
    const { result } = raced.value.entry
    expect(result.rankingSeason).toBe(202611)
    expect(result.rankingAt).toBe(now)
    expect(result.rankingPoints).toBe(rankingPoints('RACE-001', result.position))
    const saved = parseGameState(JSON.parse(JSON.stringify(raced.value.state)), now)!
    expect(saved.raceEntries.find((e) => e.id === entered.entry.id)).toMatchObject({ result: { rankingSeason: 202611, rankingAt: now } })
  })

  it('checks the table', () => {
    expect(() => parseRankingTable('kind,key,value\nrace,RACE-999,I')).toThrow(/unknown race/)
    expect(() => parseRankingTable('kind,key,value\nrace,RACE-001,VI')).toThrow(/I to V/)
    expect(() => parseRankingTable('kind,key,value\ndifficulty,VI,300')).toThrow(/unknown difficulty/)
    expect(() => parseRankingTable('kind,key,value\nsetting,best_results,0\nsetting,first_season,2026-11\nsetting,annual_months,12')).toThrow(/best_results/)
  })
})
