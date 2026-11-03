import { describe, expect, it } from 'vitest'
import {
  getAttributePointsBetween,
  getEarnedAttributePoints,
  getLevel,
  getLevelProgress,
  LEVEL_TABLE,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  parseLevels,
} from './levels'

describe('getLevel', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [249, 2],
    [250, 3],
    [449, 3],
    [450, 4],
    [699, 4],
    [700, 5],
    // Levels 6–50 (owner decision): each level costs 50 XP more than the previous one.
    [999, 5],
    [1_000, 6],
    [2_700, 10],
    [10_450, 20],
    [23_200, 30],
    [63_699, 49],
    [63_700, 50],
    [1_000_000, 50],
  ])('%i XP is level %i', (xp, level) => {
    expect(getLevel(xp)).toBe(level)
  })
})

describe('getLevelProgress', () => {
  it('reports the current and next thresholds', () => {
    expect(getLevelProgress(500)).toEqual({ level: 4, levelMinXp: 450, nextLevelMinXp: 700 })
  })

  it('has no next threshold at the maximum level (50)', () => {
    expect(getLevelProgress(700)).toEqual({ level: 5, levelMinXp: 700, nextLevelMinXp: 1_000 })
    expect(getLevelProgress(70_000)).toEqual({ level: 50, levelMinXp: 63_700, nextLevelMinXp: null })
  })

  it('keeps the original thresholds for levels 1–5, so existing careers keep their level', () => {
    expect(LEVEL_THRESHOLDS.slice(0, 5).map((t) => t.minXp)).toEqual([0, 100, 250, 450, 700])
    expect(LEVEL_THRESHOLDS).toHaveLength(MAX_LEVEL)
    expect(MAX_LEVEL).toBe(50)
  })
})

describe('getEarnedAttributePoints', () => {
  it.each([
    [0, 0],
    [99, 0],
    [100, 2],
    [250, 4],
    [450, 6],
    [699, 6],
    [700, 8],
    [5_000, 2 * (getLevel(5_000) - 1)],
    [63_700, 98],
  ])('%i XP has earned %i points (2 per level gained)', (xp, points) => {
    expect(getEarnedAttributePoints(xp)).toBe(points)
  })
})

describe('levels table (src/data/levels.csv, owner request 3 November 2026)', () => {
  it('reads the owner table: 50 levels, the original curve, 2 points per level', () => {
    expect(LEVEL_TABLE).toHaveLength(50)
    expect(LEVEL_TABLE.slice(0, 5)).toEqual([
      { level: 1, minXp: 0, attributePoints: 0 },
      { level: 2, minXp: 100, attributePoints: 2 },
      { level: 3, minXp: 250, attributePoints: 2 },
      { level: 4, minXp: 450, attributePoints: 2 },
      { level: 5, minXp: 700, attributePoints: 2 },
    ])
    expect(getAttributePointsBetween(1, 5)).toBe(8)
  })

  it('takes new rows, comments, quotes and per-level points; refuses broken tables', () => {
    const table = parseLevels('# comment\nlevel,xp,attribute_points\n1,0,0\n2,100,3\n\n3,"250",1\n')
    expect(table.map((r) => r.attributePoints)).toEqual([0, 3, 1])
    expect(() => parseLevels('level,xp,attribute_points\n1,10,0\n')).toThrow(/level 1 must start at 0/)
    expect(() => parseLevels('level,xp,attribute_points\n1,0,0\n3,100,2\n')).toThrow(/out of order/)
    expect(() => parseLevels('level,xp,attribute_points\n1,0,0\n2,0,2\n')).toThrow(/more XP/)
    expect(() => parseLevels('level,xp,attribute_points\n1,0,0\n2,abc,2\n')).toThrow(/not a whole number/)
  })
})
