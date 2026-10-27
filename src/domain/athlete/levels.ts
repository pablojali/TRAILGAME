/**
 * Level thresholds by cumulative XP, ascending. To add a level, append an entry.
 * Level 1: 0–99, Level 2: 100–249, Level 3: 250–449, Level 4: 450+.
 */
export const LEVEL_THRESHOLDS: readonly { level: number; minXp: number }[] = [
  { level: 1, minXp: 0 },
  { level: 2, minXp: 100 },
  { level: 3, minXp: 250 },
  { level: 4, minXp: 450 },
]

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
