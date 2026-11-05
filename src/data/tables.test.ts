import { describe, expect, it, vi } from 'vitest'
import { avatarFile } from '../components/avatar/avatarArt'
import { parseLevels } from '../domain/athlete/levels'
import { parseRaceField } from '../domain/races/raceField'
import { ACHIEVEMENT_IDS, parseAchievementTable } from '../game-engine/achievements'
import { consumableKinds, parseEquipment } from '../domain/equipment/items'

// The real tables, not the test copies other tests use (src/test/setup.ts).
vi.unmock('./equipment.csv?raw')
vi.unmock('./levels.csv?raw')
vi.unmock('./race_field.csv?raw')
vi.unmock('./achievements.csv?raw')
const { default: equipmentCsv } = await import('./equipment.csv?raw')
const { default: levelsCsv } = await import('./levels.csv?raw')
const { default: raceFieldCsv } = await import('./race_field.csv?raw')
const { default: achievementsCsv } = await import('./achievements.csv?raw')

const THUMBNAILS = import.meta.glob('/assets/ui/{thumbnails,equipment}/*.{webp,png,jpg,jpeg}')
const hasThumbnail = (file: string) =>
  `/assets/ui/thumbnails/${file}` in THUMBNAILS || `/assets/ui/equipment/${file}` in THUMBNAILS

/**
 * The owner's tables (src/data/*.csv, 3 November 2026) are free to change: these checks only make
 * sure the game can read them and that every file they name exists.
 */
describe("owner's tables", () => {
  it('levels.csv is a valid levels table', () => {
    expect(parseLevels(levelsCsv).length).toBeGreaterThan(1)
  })

  it('achievements.csv has valid levels for every achievement', () => {
    expect([...parseAchievementTable(achievementsCsv).keys()].sort()).toEqual([...ACHIEVEMENT_IDS].sort())
  })

  it('race_field.csv has one valid row per race category', () => {
    expect(Object.keys(parseRaceField(raceFieldCsv)).sort()).toEqual(['elite', 'mountain', 'open', 'trail'])
  })

  it('equipment.csv is a valid equipment table whose files exist, with the starting shoes and gels and bars for sale', () => {
    const items = parseEquipment(equipmentCsv)
    for (const item of items) {
      if (item.avatarLayer) expect(avatarFile(item.avatarLayer), `${item.id}: avatar_layer ${item.avatarLayer}`).toBeDefined()
      if (item.thumbnail) expect(hasThumbnail(item.thumbnail), `${item.id}: thumbnail ${item.thumbnail}`).toBe(true)
      if (item.price !== null) expect(item.price, item.id).toBeGreaterThanOrEqual(0)
    }
    // The starting shoes (every career owns them), and something that refills gels and bars.
    expect(items.map((item) => item.id)).toContain('starter-shoes')
    const refills = items.flatMap((item) => consumableKinds(item))
    expect(refills).toEqual(expect.arrayContaining(['gel', 'bar']))
    // Texts in other languages (owner request, 5 November 2026) are read from the _es, _fr… columns.
    expect(items.find((item) => item.id === 'starter-shoes')?.translations?.es?.name).toBeTruthy()
  })
})
