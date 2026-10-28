import { describe, expect, it } from 'vitest'
import { getLevel, getLevelProgress } from './levels'

describe('getLevel', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [249, 2],
    [250, 3],
    [449, 3],
    [450, 4],
    [10_000, 4],
  ])('%i XP is level %i', (xp, level) => {
    expect(getLevel(xp)).toBe(level)
  })
})

describe('getLevelProgress', () => {
  it('reports the current and next thresholds', () => {
    expect(getLevelProgress(120)).toEqual({ level: 2, levelMinXp: 100, nextLevelMinXp: 250 })
  })

  it('has no next threshold at the maximum level', () => {
    expect(getLevelProgress(450)).toEqual({ level: 4, levelMinXp: 450, nextLevelMinXp: null })
  })
})
