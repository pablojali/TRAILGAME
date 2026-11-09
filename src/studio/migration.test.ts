import { describe, expect, it, vi } from 'vitest'
import { migrationPath, racePointsMigration, racePointsRows } from './migration'

vi.unmock('../data/ranking_points.csv?raw')
vi.unmock('../data/races.csv?raw')
const { default: pointsCsv } = await import('../data/ranking_points.csv?raw')
const { default: racesCsv } = await import('../data/races.csv?raw')
const MIGRATIONS = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })

describe('Studio ranking migration', () => {
  it('writes the same race points the latest migration loads', () => {
    const sql = racePointsMigration(racesCsv, pointsCsv, 'test')
    const latest = Object.keys(MIGRATIONS).sort().filter((f) => MIGRATIONS[f]!.includes('insert into public.ranking_race_points ('))
    const section = (text: string) => text.slice(text.indexOf('insert into public.ranking_race_points'), text.indexOf('-- ranking_position_percent'))
    expect(section(sql).trim()).toBe(section(MIGRATIONS[latest.at(-1)!]!).trim())
    expect(racePointsRows(racesCsv, pointsCsv)).toContain('RACE-001|4|100')
  })

  it('names the file after the moment it is made', () => {
    expect(migrationPath(new Date(Date.UTC(2026, 10, 9, 8, 5, 3)), 'studio_race_points')).toBe('supabase/migrations/20261109080503_studio_race_points.sql')
  })
})
