import { describe, expect, it } from 'vitest'
import { newGame } from '../test/gameFixtures'
import { getMedalTable, getPersonalBests, getRaceHistory, medalFor } from './career'
import type { FinishedRaceEntry, GameState, RaceEntry } from './gameState'

/** A finished entry with only the fields the career statistics read. */
function finished(id: number, raceId: string, position: number, timeS: number): FinishedRaceEntry {
  return {
    id: `entry-${id}`,
    raceId,
    entryType: 'free',
    feePaid: 0,
    levelAtEntry: 1,
    enteredAt: 0,
    status: 'finished',
    result: { week: id, day: 7, position, timeS, fieldSize: 50 } as FinishedRaceEntry['result'],
  }
}

function withEntries(...raceEntries: RaceEntry[]): GameState {
  return { ...newGame(), raceEntries }
}

const PENDING: RaceEntry = {
  id: 'entry-9',
  raceId: 'RACE-002',
  entryType: 'free',
  feePaid: 0,
  levelAtEntry: 1,
  enteredAt: 0,
  status: 'pending',
}

describe('career statistics', () => {
  it('gives gold, silver and bronze for 1st, 2nd and 3rd only', () => {
    expect([1, 2, 3, 4, 50].map(medalFor)).toEqual(['gold', 'silver', 'bronze', null, null])
  })

  it('counts medals by category and in total, ignoring pending entries', () => {
    const table = getMedalTable(
      withEntries(
        finished(1, 'RACE-001', 1, 2600),
        finished(2, 'RACE-001', 3, 2700),
        finished(3, 'RACE-004', 2, 7000),
        finished(4, 'RACE-004', 12, 7400),
        PENDING,
      ),
    )
    expect(table.byCategory.open).toEqual({ gold: 1, silver: 0, bronze: 1, races: 2 })
    expect(table.byCategory.trail).toEqual({ gold: 0, silver: 1, bronze: 0, races: 2 })
    expect(table.byCategory.mountain).toEqual({ gold: 0, silver: 0, bronze: 0, races: 0 })
    expect(table.total).toEqual({ gold: 1, silver: 1, bronze: 1, races: 4 })
  })

  it('lists finished races newest first', () => {
    const history = getRaceHistory(withEntries(finished(1, 'RACE-001', 5, 2600), PENDING, finished(2, 'RACE-002', 9, 4500)))
    expect(history.map((row) => [row.entry.id, row.race.name])).toEqual([
      ['entry-2', 'Riverside Trail'],
      ['entry-1', 'Forest First Steps'],
    ])
  })

  it('keeps the best position and the best time of each race, even from different runs', () => {
    const bests = getPersonalBests(
      withEntries(
        finished(1, 'RACE-002', 8, 4400),
        finished(2, 'RACE-001', 20, 2900),
        finished(3, 'RACE-002', 5, 4500),
        finished(4, 'RACE-002', 5, 4300),
      ),
    )
    expect(bests.map((b) => [b.race.id, b.bestPosition, b.bestPositionEntry.id, b.bestTimeS, b.bestTimeEntry.id, b.runs])).toEqual([
      ['RACE-001', 20, 'entry-2', 2900, 'entry-2', 1],
      // Best position 5 first reached in entry-3 (the earliest of the tie); best time in entry-4.
      ['RACE-002', 5, 'entry-3', 4300, 'entry-4', 3],
    ])
  })

  it('is empty for a career with no finished race', () => {
    expect(getRaceHistory(newGame())).toEqual([])
    expect(getPersonalBests(withEntries(PENDING))).toEqual([])
    expect(getMedalTable(newGame()).total).toEqual({ gold: 0, silver: 0, bronze: 0, races: 0 })
  })
})
