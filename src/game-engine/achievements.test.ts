import { describe, expect, it } from 'vitest'
import { newGame, withAthlete } from '../test/gameFixtures'
import { getAchievements, getSeason } from './achievements'
import type { FinishedRaceEntry, GameState } from './gameState'

/** A career with finished races at the given week, race and position (results trimmed to what is read). */
function withResults(state: GameState, results: { raceId: string; week: number; position: number }[]): GameState {
  const entries = results.map(
    ({ raceId, week, position }, i) =>
      ({
        id: `entry-${i}`,
        raceId,
        status: 'finished',
        result: { week, position, fieldSize: 50, timeS: 3600 },
      }) as unknown as FinishedRaceEntry,
  )
  return { ...state, raceEntries: entries }
}

const byId = (state: GameState) => Object.fromEntries(getAchievements(state).map((a) => [a.definition.id, a]))

describe('achievements', () => {
  it('start at level 1 with nothing reached', () => {
    const all = getAchievements(newGame())
    expect(all.every((a) => a.reached === 0 && a.level === 1)).toBe(true)
    // A new runner is Level 1 (target Level 5); every other count starts at 0.
    expect(all.filter((a) => a.value !== 0).map((a) => [a.definition.id, a.value])).toEqual([['level', 1]])
  })

  it('count races by category, podiums and wins, XP, levels and weeks played', () => {
    const state = withResults({ ...withAthlete(newGame(), { xp: 1200 }), week: { ...newGame().week, number: 14 } }, [
      { raceId: 'RACE-004', week: 2, position: 1 },
      { raceId: 'RACE-007', week: 6, position: 3 },
      { raceId: 'RACE-001', week: 9, position: 20 },
    ])
    const a = byId(state)
    expect(a['first-steps']).toMatchObject({ reached: 1, level: 2, value: 3, target: 5 })
    expect(a['trail-explorer']).toMatchObject({ reached: 1, value: 1, target: 5 })
    expect(a['first-summit']).toMatchObject({ reached: 1 })
    expect(a.elite).toMatchObject({ reached: 0, value: 0, target: 1 })
    expect(a.podium).toMatchObject({ reached: 1, value: 2, target: 5 })
    expect(a.champion).toMatchObject({ reached: 1, value: 1, target: 3 })
    expect(a['rising-star']).toMatchObject({ reached: 1, value: 1200, target: 5000 })
    expect(a.dedicated).toMatchObject({ reached: 2, value: 13, target: 26 })
    // 1,200 XP is Level 6.
    expect(a.level).toMatchObject({ reached: 1, level: 2, value: 6, target: 10 })
  })

  it('stay complete at the last level', () => {
    const a = byId(withAthlete(newGame(), { xp: 60000 }))['rising-star']!
    expect(a).toMatchObject({ complete: true, reached: 4, level: 4, value: 50000, target: 50000 })
  })
})

describe('season', () => {
  it('is the career year, with this year\'s races only', () => {
    const state = withResults({ ...newGame(), week: { ...newGame().week, number: 60 } }, [
      { raceId: 'RACE-001', week: 10, position: 1 },
      { raceId: 'RACE-001', week: 55, position: 7 },
      { raceId: 'RACE-002', week: 58, position: 2 },
    ])
    expect(getSeason(state)).toEqual({ year: 2, weekOfYear: 8, races: 2, medals: 1, bestFinish: 2 })
    expect(getSeason(newGame())).toEqual({ year: 1, weekOfYear: 1, races: 0, medals: 0, bestFinish: null })
  })
})
