import { describe, expect, it } from 'vitest'
import type { RunnerRow } from '../server/majorOps'
import { filterRunners, levelBand, runnerStats, sortRunners } from './runnersStats'

const row = (over: Partial<RunnerRow>): RunnerRow => ({
  kind: 'PLAYER', name: 'Ana', sex: 'female', country: 'AR', level: 3, xp: 300, coins: 50, racesFinished: 2,
  createdAt: '2026-11-01T00:00:00Z', lastActiveAt: '2026-11-10T00:00:00Z', strength: null, racesPerWeek: null, ...over,
})

const rows: RunnerRow[] = [
  row({}),
  row({ name: 'ana', country: 'ES', level: 7, lastActiveAt: '2026-11-13T00:00:00Z' }),
  row({ name: 'Leo', sex: 'male', country: null, level: 12 }),
  row({ kind: 'NPC', name: 'Bo.', sex: 'male', country: 'ES', level: 6, coins: null, racesFinished: null, createdAt: null, lastActiveAt: null, strength: 50, racesPerWeek: 2 }),
]

describe('runners stats', () => {
  it('counts players and NPCs by level band, country and sex, and finds repeated names', () => {
    const stats = runnerStats(rows)
    expect(stats.players).toBe(3)
    expect(stats.npcs).toBe(1)
    expect(stats.byLevel).toEqual([
      { key: '1–5', players: 1, npcs: 0 },
      { key: '6–10', players: 1, npcs: 1 },
      { key: '11–15', players: 1, npcs: 0 },
    ])
    expect(stats.byCountry[0]).toEqual({ key: 'ES', players: 1, npcs: 1 })
    expect(stats.bySex).toContainEqual({ key: 'Mujeres', players: 2, npcs: 0 })
    expect(stats.repeatedNames).toEqual(['ana'])
    expect(stats.averageLevel).toEqual({ players: 7.3, npcs: 6 })
    expect(levelBand(1)).toBe('1–5')
    expect(levelBand(25)).toBe('21–25')
  })

  it('filters by kind, country and name, and sorts', () => {
    expect(filterRunners(rows, { kind: 'NPC', country: '', search: '' }).map((r) => r.name)).toEqual(['Bo.'])
    expect(filterRunners(rows, { kind: 'all', country: 'ES', search: '' })).toHaveLength(2)
    expect(filterRunners(rows, { kind: 'all', country: '—', search: '' }).map((r) => r.name)).toEqual(['Leo'])
    expect(filterRunners(rows, { kind: 'PLAYER', country: '', search: 'AN' })).toHaveLength(2)
    expect(sortRunners(rows, 'level').map((r) => r.level)).toEqual([12, 7, 6, 3])
    expect(sortRunners(rows, 'lastActive')[0]!.name).toBe('ana')
  })
})
