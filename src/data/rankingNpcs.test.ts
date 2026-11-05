import { describe, expect, it, vi } from 'vitest'
import { isCountryCode } from '../domain/athlete/countries'
import { RACES } from '../domain/races/races'
import { parseCsv } from './csv'

// The owner's NPC table and the real ranking points (not the test copy, src/test/setup.ts).
vi.unmock('./ranking_points.csv?raw')
const { default: npcCsv } = await import('./ranking_npcs.csv?raw')
const { default: pointsCsv } = await import('./ranking_points.csv?raw')
const MIGRATIONS = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })

const npcs = parseCsv(npcCsv)
const points = parseCsv(pointsCsv)

/** The rows of the latest migration that loads `table`, as arrays of SQL literals. */
function loadedRows(table: string): string[][] {
  const files = Object.keys(MIGRATIONS).sort().filter((file) => MIGRATIONS[file]!.includes(`insert into public.${table} (`))
  const sql = MIGRATIONS[files.at(-1)!]!
  const start = sql.indexOf(`insert into public.${table} (`)
  const body = sql.slice(sql.indexOf('values', start) + 6, sql.indexOf(';', start))
  return [...body.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]!.split(/,\s*/).map((v) => v.replace(/^'(.*)'$/, '$1').replace(/''/g, "'")))
}

describe('Ranking NPC runners table (owner request, 5 November 2026)', () => {
  it('has 200 valid runners with unique ids and names', () => {
    expect(npcs).toHaveLength(200)
    expect(new Set(npcs.map((n) => n.id)).size).toBe(npcs.length)
    expect(new Set(npcs.map((n) => n.name!.toLowerCase())).size).toBe(npcs.length)
    for (const n of npcs) {
      expect(n.name!.length, n.id).toBeGreaterThan(0)
      expect(n.name!.length, n.id).toBeLessThanOrEqual(16)
      expect(isCountryCode(n.country), n.id).toBe(true)
      expect(['male', 'female'], n.id).toContain(n.sex)
      expect(Number(n.strength), n.id).toBeGreaterThanOrEqual(0)
      expect(Number(n.strength), n.id).toBeLessThanOrEqual(100)
      expect(Number(n.races_per_week), n.id).toBeGreaterThanOrEqual(0)
      expect(Number(n.races_per_week), n.id).toBeLessThanOrEqual(7)
    }
  })

  it('is the table the latest migration loads into Supabase', () => {
    expect(loadedRows('ranking_npcs')).toEqual(
      npcs.map((n, i) => [n.id, n.name, n.country, n.sex, n.level, n.xp, n.strength, n.races_per_week, String(i + 1)]),
    )
  })

  it('the race points and position percents in Supabase match ranking_points.csv and the races', () => {
    const level = new Map(RACES.map((race) => [race.id, String(race.recommendedLevel)]))
    expect(loadedRows('ranking_race_points')).toEqual(points.filter((p) => p.kind === 'race').map((p) => [p.key, level.get(p.key!), p.value]))
    expect(loadedRows('ranking_position_percent')).toEqual(points.filter((p) => p.kind === 'position').map((p) => [p.key, p.value]))
  })
})
