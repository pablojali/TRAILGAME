import { csvInt, parseCsv } from '../../data/csv'
import levelsCsv from '../../data/levels.csv?raw'

/**
 * Levels come from the owner's table src/data/levels.csv (owner request, 3 November 2026): one row
 * per level with the total XP needed and the attribute points it gives. Add rows to add levels.
 * The table is checked when the game loads: levels 1, 2, 3… in order, level 1 at 0 XP, XP rising.
 */
export interface LevelRow {
  level: number
  minXp: number
  attributePoints: number
}

export function parseLevels(text: string): LevelRow[] {
  const rows = parseCsv(text).map((row, i) => {
    const where = `levels.csv row ${i + 1}`
    return { level: csvInt(row.level, where), minXp: csvInt(row.xp, where), attributePoints: csvInt(row.attribute_points, where) }
  })
  rows.forEach((row, i) => {
    if (row.level !== i + 1) throw new Error(`levels.csv: level ${row.level} out of order (expected ${i + 1})`)
    if (i === 0 && row.minXp !== 0) throw new Error('levels.csv: level 1 must start at 0 XP')
    if (i > 0 && row.minXp <= rows[i - 1]!.minXp) throw new Error(`levels.csv: level ${row.level} needs more XP than level ${i}`)
    if (row.attributePoints < 0) throw new Error(`levels.csv: level ${row.level} has negative attribute points`)
  })
  if (rows.length === 0) throw new Error('levels.csv is empty')
  return rows
}

export const LEVEL_TABLE: readonly LevelRow[] = parseLevels(levelsCsv)

/** Highest level: the last row of the table. */
export const MAX_LEVEL = LEVEL_TABLE.length

/** Level thresholds by cumulative XP, ascending. */
export const LEVEL_THRESHOLDS: readonly { level: number; minXp: number }[] = LEVEL_TABLE.map(({ level, minXp }) => ({
  level,
  minXp,
}))

/**
 * Attribute points per level gained, for texts. The table may give each level its own number; the
 * game always uses `getAttributePointsBetween`.
 */
export const ATTRIBUTE_POINTS_PER_LEVEL = LEVEL_TABLE[1]?.attributePoints ?? 0

export interface LevelProgress {
  level: number
  /** XP at which the current level starts. */
  levelMinXp: number
  /** XP at which the next level starts, or null at the maximum level. */
  nextLevelMinXp: number | null
}

export function getLevelProgress(xp: number): LevelProgress {
  let index = 0
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]!.minXp) index = i
  }
  const current = LEVEL_THRESHOLDS[index]!
  const next = LEVEL_THRESHOLDS[index + 1]
  return { level: current.level, levelMinXp: current.minXp, nextLevelMinXp: next ? next.minXp : null }
}

export function getLevel(xp: number): number {
  return getLevelProgress(xp).level
}

/** Attribute points given by the levels after `from` up to and including `to`. */
export function getAttributePointsBetween(from: number, to: number): number {
  return LEVEL_TABLE.filter((row) => row.level > from && row.level <= to).reduce((sum, row) => sum + row.attributePoints, 0)
}

/** Total attribute points earned from levels gained so far (none at level 1). */
export function getEarnedAttributePoints(xp: number): number {
  return getAttributePointsBetween(1, getLevel(xp))
}
