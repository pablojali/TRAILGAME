import { describe, expect, it, vi } from 'vitest'
import { parseRankingTable, rankingPoints, rankingSeason, seasonBounds } from './ranking'
import { newGame, onSunday, withAthlete, withEntry } from '../../test/gameFixtures'
import { raceCurrentDay } from '../../game-engine/races'
import { parseGameState } from '../../repositories/gameRepository'

vi.unmock('../../data/ranking_points.csv?raw')

describe('rankings (owner request, 5 November 2026)', () => {
  it('counts monthly seasons from November 2026 (UTC)', () => {
    expect(rankingSeason(Date.UTC(2026, 9, 31, 23, 59))).toBe(0)
    expect(rankingSeason(Date.UTC(2026, 10, 1))).toBe(1)
    expect(rankingSeason(Date.UTC(2026, 11, 31, 23))).toBe(2)
    expect(rankingSeason(Date.UTC(2027, 0, 15))).toBe(3)
    expect(seasonBounds(3)).toEqual({ start: Date.UTC(2027, 0, 1), end: Date.UTC(2027, 1, 1) })
  })

  it('scores base points × position percent × reward percent', () => {
    expect(rankingPoints('RACE-001', 1, 100)).toBe(62)
    expect(rankingPoints('RACE-012', 2, 100)).toBe(1003)
    expect(rankingPoints('RACE-001', 1, 40)).toBe(25)
    expect(rankingPoints('RACE-001', 31, 100)).toBe(0)
  })

  it('stores the season and points with a result finished in a season, and saves them', () => {
    const now = Date.UTC(2026, 10, 8, 12)
    const entered = withEntry(withAthlete(newGame(), { xp: 1000 }), 'RACE-001', now)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, now)
    if (!raced.ok) throw new Error(raced.error)
    const { result } = raced.value.entry
    expect(result.rankingSeason).toBe(1)
    expect(result.rankingPoints).toBe(rankingPoints('RACE-001', result.position, result.multiplierPct))
    const saved = parseGameState(JSON.parse(JSON.stringify(raced.value.state)), now)!
    expect(saved.raceEntries.find((e) => e.id === entered.entry.id)).toMatchObject({ result: { rankingSeason: 1 } })
  })

  it('checks the table', () => {
    expect(() => parseRankingTable('kind,key,value\nrace,RACE-999,10')).toThrow(/unknown race/)
    expect(() => parseRankingTable('kind,key,value\nsetting,best_results,0\nsetting,first_season,2026-11')).toThrow(/best_results/)
  })
})
