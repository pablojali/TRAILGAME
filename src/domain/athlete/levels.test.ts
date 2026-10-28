import { describe, expect, it } from 'vitest'
import { getEarnedAttributePoints, getLevel, getLevelProgress } from './levels'

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
    [10_000, 5],
  ])('%i XP is level %i', (xp, level) => {
    expect(getLevel(xp)).toBe(level)
  })
})

describe('getLevelProgress', () => {
  it('reports the current and next thresholds', () => {
    expect(getLevelProgress(500)).toEqual({ level: 4, levelMinXp: 450, nextLevelMinXp: 700 })
  })

  it('has no next threshold at the maximum level', () => {
    expect(getLevelProgress(700)).toEqual({ level: 5, levelMinXp: 700, nextLevelMinXp: null })
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
    [5_000, 8],
  ])('%i XP has earned %i points (2 per level gained)', (xp, points) => {
    expect(getEarnedAttributePoints(xp)).toBe(points)
  })
})
