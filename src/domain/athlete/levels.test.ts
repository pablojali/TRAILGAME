import { describe, expect, it } from 'vitest'
import { getEarnedAttributePoints, getLevel, getLevelProgress, LEVEL_THRESHOLDS, MAX_LEVEL } from './levels'

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
