/** Highest level (owner decision, 29 October 2026; was 5). */
export const MAX_LEVEL = 50

/**
 * Level thresholds by cumulative XP, ascending. Each level costs 50 XP more than the one before
 * (the original curve, continued to level 50): Level 2 at 100, 3 at 250, 4 at 450, 5 at 700,
 * 10 at 2,700, 20 at 10,450, 30 at 23,200, 50 at 63,700.
 */
export const LEVEL_THRESHOLDS: readonly { level: number; minXp: number }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, minXp: 100 * i + 25 * i * (i - 1) }),
)

/** Attribute points awarded for each level gained. */
export const ATTRIBUTE_POINTS_PER_LEVEL = 2

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

/** Total attribute points earned from levels gained so far (none at level 1). */
export function getEarnedAttributePoints(xp: number): number {
  return (getLevel(xp) - 1) * ATTRIBUTE_POINTS_PER_LEVEL
}
