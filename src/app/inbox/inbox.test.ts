import { describe, expect, it } from 'vitest'
import type { FinishedRaceEntry } from '../../game-engine/gameState'
import { newGame, onSunday, withAthlete, withEntry } from '../../test/gameFixtures'
import { arrange, buildInbox, markRead } from './inbox'

const NOV = Date.UTC(2026, 10, 8, 12)

function finished(id: number, startedAt: number, position: number, points: number): FinishedRaceEntry {
  return {
    id: `entry-${id}`,
    raceId: 'RACE-001',
    entryType: 'free',
    feePaid: 0,
    levelAtEntry: 1,
    enteredAt: 0,
    status: 'finished',
    result: { startedAt, week: id, day: 7, position, fieldSize: 30, timeS: 1200, rankingPoints: points, rankingAt: startedAt + 1000 } as FinishedRaceEntry['result'],
  }
}

describe('Inbox (owner request, 6 November 2026)', () => {
  it('lists race results, the level, the season and race day, newest first', () => {
    const base = withAthlete(newGame(), { xp: 1000 }) // level 6
    const state = { ...base, raceEntries: [finished(1, NOV - 3 * 86400000, 5, 65), finished(2, NOV - 86400000, 1, 100)] }
    const items = buildInbox(state, NOV)
    expect(items.filter((i) => i.kind === 'race').map((i) => [i.link, i.values.position, i.values.points])).toEqual([
      ['/races/results/entry-1', 5, 65],
      ['/races/results/entry-2', 1, 100],
    ])
    expect(items.find((i) => i.kind === 'level')).toMatchObject({ id: 'level:6', values: { level: 6 } })
    expect(items.find((i) => i.kind === 'season')).toMatchObject({ id: 'season:202611', values: { season: 11, year: 2026 } })
    const { list } = arrange(items, { seen: {}, read: [] }, NOV)
    // Dated items newest first: the last race, then the earlier one, then the season (1 November).
    const dated = list.filter((i) => i.kind === 'race' || i.kind === 'season')
    expect(dated.map((i) => i.id)).toEqual([`race:${NOV - 86400000}`, `race:${NOV - 3 * 86400000}`, 'season:202611'])
    expect(list.every((i) => i.unread)).toBe(true)

    const { state: entered } = withEntry(newGame(), 'RACE-001')
    expect(buildInbox(onSunday(entered), NOV).some((i) => i.kind === 'race-day')).toBe(true)
    expect(buildInbox(entered, NOV).some((i) => i.kind === 'race-day')).toBe(false)
  })

  it('remembers what was read, and shows one-visit messages without remembering them', () => {
    const items = buildInbox(newGame(), NOV, { decay: { periods: 3, fitnessLost: 3 }, cloudError: true })
    expect(items.map((i) => i.kind)).toEqual(['season', 'decay', 'cloud'])
    const first = arrange(items, { seen: {}, read: [] }, NOV)
    expect(first.list.filter((i) => i.unread)).toHaveLength(3)
    expect(Object.keys(first.memory.seen)).toEqual(['season:202611'])
    const read = markRead(first.memory, first.list.map((i) => i.id))
    expect(arrange(items, read, NOV + 1000).list.filter((i) => i.unread)).toHaveLength(0)
    // Nothing for a race before rankings, no level item at level 1.
    expect(buildInbox(newGame(), Date.UTC(2026, 9, 1)).length).toBe(0)
  })
})

describe('ranking notifications (owner request, 7 November 2026)', () => {
  const S = 202611
  it('notifies entering the top 10, each move inside it and leaving it, and nothing else', async () => {
    const { rankingEvent, rememberRank } = await import('./inbox')
    expect(rankingEvent('world', S, undefined, 12, NOV)).toBeNull()
    expect(rankingEvent('world', S, undefined, 7, NOV)).toMatchObject({ kind: 'ranking', values: { scope: 'world', change: 'entered', rank: 7 } })
    expect(rankingEvent('world', S, 12, 10, NOV)?.values.change).toBe('entered')
    expect(rankingEvent('world', S, 7, 4, NOV)?.values).toMatchObject({ change: 'up', rank: 4, previous: 7 })
    expect(rankingEvent('world', S, 4, 6, NOV)?.values).toMatchObject({ change: 'down', rank: 6, previous: 4 })
    expect(rankingEvent('world', S, 6, 6, NOV)).toBeNull()
    expect(rankingEvent('world', S, 9, 15, NOV)?.values).toMatchObject({ change: 'left', previous: 9 })
    expect(rankingEvent('world', S, 9, null, NOV)?.values.change).toBe('left')
    expect(rankingEvent('world', S, 30, 40, NOV)).toBeNull()

    // Remembered per scope and season; each event shows in the Inbox, unread.
    let memory = rememberRank({ seen: {}, read: [] }, 'country', S, 3, NOV, 'AR')
    memory = rememberRank(memory, 'country', S, 3, NOV + 1, 'AR')
    memory = rememberRank(memory, 'country', S, 2, NOV + 2, 'AR')
    expect(memory.ranks).toEqual({ 'country:202611': 2 })
    expect(memory.events!.map((e) => e.values.change)).toEqual(['up', 'entered'])
    const { list } = arrange([], memory, NOV + 3)
    expect(list.map((i) => [i.kind, i.values.change, i.unread])).toEqual([
      ['ranking', 'up', true],
      ['ranking', 'entered', true],
    ])
  })
})
