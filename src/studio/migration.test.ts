import { describe, expect, it, vi } from 'vitest'
import { migrationPath, npcRows, racePointsMigration, racePointsRows, rankingMigration } from './migration'

vi.unmock('../data/ranking_points.csv?raw')
vi.unmock('../data/races.csv?raw')
vi.unmock('../data/ranking_npcs.csv?raw')
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

describe('Studio ranking migration with the NPC runners', () => {
  it('loads the NPC table exactly like the latest migration that loads it', async () => {
    const { default: npcsCsv } = await import('../data/ranking_npcs.csv?raw')
    const sql = rankingMigration(racesCsv, pointsCsv, npcsCsv, 'test')
    // The rows (the first migration inserted them; later ones upsert, as the Studio's does).
    const section = (text: string) => {
      const start = text.indexOf('insert into public.ranking_npcs')
      return text.slice(start, text.indexOf(';', start)).split('\non conflict')[0]
    }
    const latest = Object.keys(MIGRATIONS).sort().filter((f) => MIGRATIONS[f]!.includes('insert into public.ranking_npcs ('))
    expect(section(sql)).toBe(section(MIGRATIONS[latest.at(-1)!]!))
    expect(sql).toContain('insert into public.ranking_race_points')
    expect(npcRows(npcsCsv)).toHaveLength(200)
  })
})
