import { csvInt, parseCsv } from '../data/csv'
import achievementsCsv from '../data/achievements.csv?raw'
import { getLevel } from '../domain/athlete/levels'
import type { RaceCategory } from '../domain/races/categories'
import { getCareerProgress } from '../domain/training/calendar'
import { getRaceHistory, medalFor } from './career'
import type { GameState } from './gameState'

/**
 * Season and achievements (owner request, 31 October 2026). Progress is read from the saved career
 * (finished races, XP, weeks played). Each achievement level gives coins and XP once (owner
 * request, 5 November 2026): targets and rewards come from the owner's table
 * src/data/achievements.csv; the levels already rewarded are kept in the career.
 */

export interface AchievementDefinition {
  id: string
  title: string
  /** Targets in order, one per achievement level (from the achievements table). */
  targets: readonly number[]
  /** Reward of each level, same order as `targets`. */
  rewards: readonly AchievementReward[]
  /** What one level asks for, e.g. "Finish 5 trail races". */
  describe(target: number): string
  value(state: GameState): number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function finishedIn(state: GameState, category?: RaceCategory): number {
  return getRaceHistory(state).filter(({ race }) => category === undefined || race.category === category).length
}

function positions(state: GameState): number[] {
  return getRaceHistory(state).map(({ entry }) => entry.result.position)
}

export interface AchievementReward {
  coins: number
  xp: number
}

export interface AchievementLevelRow extends AchievementReward {
  achievement: string
  level: number
  target: number
}

export const ACHIEVEMENT_IDS = [
  'first-steps',
  'trail-explorer',
  'first-summit',
  'elite',
  'podium',
  'champion',
  'rising-star',
  'level',
  'dedicated',
] as const

/** Reads the achievements table: levels 1, 2, 3… per known achievement, targets rising. */
export function parseAchievementTable(text: string): Map<string, AchievementLevelRow[]> {
  const table = new Map<string, AchievementLevelRow[]>()
  parseCsv(text).forEach((row, i) => {
    const where = `achievements.csv row ${i + 1}`
    if (!(ACHIEVEMENT_IDS as readonly string[]).includes(row.achievement ?? '')) {
      throw new Error(`${where}: unknown achievement "${row.achievement}"`)
    }
    const parsed: AchievementLevelRow = {
      achievement: row.achievement!,
      level: csvInt(row.level, where),
      target: csvInt(row.target, where),
      coins: csvInt(row.coins, where),
      xp: csvInt(row.xp, where),
    }
    if (parsed.coins < 0 || parsed.xp < 0) throw new Error(`${where}: rewards must not be negative`)
    const rows = table.get(parsed.achievement) ?? []
    if (parsed.level !== rows.length + 1) throw new Error(`${where}: level ${parsed.level} out of order`)
    if (rows.length && parsed.target <= rows[rows.length - 1]!.target) throw new Error(`${where}: target must rise`)
    if (parsed.target < 1) throw new Error(`${where}: target must be at least 1`)
    rows.push(parsed)
    table.set(parsed.achievement, rows)
  })
  for (const id of ACHIEVEMENT_IDS) if (!table.has(id)) throw new Error(`achievements.csv: no rows for "${id}"`)
  return table
}

const TABLE = parseAchievementTable(achievementsCsv)
const targetsOf = (id: (typeof ACHIEVEMENT_IDS)[number]) => TABLE.get(id)!.map((row) => row.target)
const rewardsOf = (id: (typeof ACHIEVEMENT_IDS)[number]) => TABLE.get(id)!.map(({ coins, xp }) => ({ coins, xp }))

const DEFINITIONS: readonly Omit<AchievementDefinition, 'targets' | 'rewards'>[] = [
  {
    id: 'first-steps',
    title: 'Race Starter',
    describe: (n) => `Finish ${plural(n, 'race', 'races')}.`,
    value: (state) => finishedIn(state),
  },
  {
    id: 'trail-explorer',
    title: 'Trail Explorer',
    describe: (n) => `Finish ${plural(n, 'trail race', 'trail races')}.`,
    value: (state) => finishedIn(state, 'trail'),
  },
  {
    id: 'first-summit',
    title: 'First Summit',
    describe: (n) => `Finish ${plural(n, 'mountain race', 'mountain races')}.`,
    value: (state) => finishedIn(state, 'mountain'),
  },
  {
    id: 'elite',
    title: 'Among the Elite',
    describe: (n) => `Finish ${plural(n, 'elite race', 'elite races')}.`,
    value: (state) => finishedIn(state, 'elite'),
  },
  {
    id: 'podium',
    title: 'Podium Hunter',
    describe: (n) => `Finish in the top 3 ${plural(n, 'time', 'times')}.`,
    value: (state) => positions(state).filter((p) => medalFor(p) !== null).length,
  },
  {
    id: 'champion',
    title: 'Champion',
    describe: (n) => `Win ${plural(n, 'race', 'races')}.`,
    value: (state) => positions(state).filter((p) => p === 1).length,
  },
  {
    id: 'rising-star',
    title: 'Rising Star',
    describe: (n) => `Reach ${n.toLocaleString('en-US')} XP.`,
    value: (state) => state.athlete.xp,
  },
  {
    id: 'level',
    title: 'Climbing the Ranks',
    describe: (n) => `Reach Level ${n}.`,
    value: (state) => getLevel(state.athlete.xp),
  },
  {
    id: 'dedicated',
    title: 'Dedicated',
    describe: (n) => `Complete ${plural(n, 'training week', 'training weeks')}.`,
    value: (state) => state.week.number - 1,
  },
]

export const ACHIEVEMENTS: readonly AchievementDefinition[] = DEFINITIONS.map((definition) => ({
  ...definition,
  targets: targetsOf(definition.id as (typeof ACHIEVEMENT_IDS)[number]),
  rewards: rewardsOf(definition.id as (typeof ACHIEVEMENT_IDS)[number]),
}))

export interface AchievementProgress {
  definition: AchievementDefinition
  /** Levels reached (targets met), 0 to targets.length. */
  reached: number
  /** The level being worked on (1-based), or the last one when all are reached. */
  level: number
  target: number
  /** Progress towards `target`, capped at it. */
  value: number
  complete: boolean
  /** The reward of the level being worked on (or of the last level once complete). */
  reward: AchievementReward
}

export function getAchievements(state: GameState): AchievementProgress[] {
  return ACHIEVEMENTS.map((definition) => {
    const value = definition.value(state)
    const reached = definition.targets.filter((target) => value >= target).length
    const complete = reached === definition.targets.length
    const index = complete ? definition.targets.length - 1 : reached
    const target = definition.targets[index]!
    return {
      definition,
      reached,
      level: index + 1,
      target,
      value: Math.min(value, target),
      complete,
      reward: definition.rewards[index]!,
    }
  })
}

/** Levels reached so far, by achievement id (what a career saved before rewards existed is credited with). */
export function getReachedLevels(state: GameState): Record<string, number> {
  return Object.fromEntries(getAchievements(state).map((a) => [a.definition.id, a.reached]))
}

export interface AchievementEarned extends AchievementReward {
  id: string
  level: number
}

/**
 * Gives the coins and XP of every achievement level reached and not yet rewarded (owner request,
 * 5 November 2026). XP rewards can reach further levels (XP, runner level), so it repeats until
 * nothing new is reached. Called after every training day and race.
 */
export function applyAchievementRewards(state: GameState): { state: GameState; earned: AchievementEarned[] } {
  const earned: AchievementEarned[] = []
  let current = state
  for (let guard = 0; guard < 100; guard++) {
    const rewarded = current.achievementLevelsRewarded
    const fresh: AchievementEarned[] = []
    for (const progress of getAchievements(current)) {
      const id = progress.definition.id
      for (let level = (rewarded[id] ?? 0) + 1; level <= progress.reached; level++) {
        fresh.push({ id, level, ...progress.definition.rewards[level - 1]! })
      }
    }
    if (fresh.length === 0) break
    const next = { ...rewarded }
    for (const e of fresh) next[e.id] = Math.max(next[e.id] ?? 0, e.level)
    current = {
      ...current,
      coins: current.coins + fresh.reduce((sum, e) => sum + e.coins, 0),
      athlete: { ...current.athlete, xp: current.athlete.xp + fresh.reduce((sum, e) => sum + e.xp, 0) },
      achievementLevelsRewarded: next,
    }
    earned.push(...fresh)
  }
  return { state: current, earned }
}

/**
 * The challenge to show on the Dashboard: the unfinished achievement closest to its next level
 * (share of the target), the first in the list on a tie.
 */
export function getActiveChallenge(state: GameState): AchievementProgress | null {
  const open = getAchievements(state).filter((a) => !a.complete)
  if (open.length === 0) return null
  return open.reduce((best, a) => (a.value / a.target > best.value / best.target ? a : best))
}

export interface Season {
  /** The career year (52 weeks). */
  year: number
  weekOfYear: number
  /** Races finished this season and medals (top 3) won in them. */
  races: number
  medals: number
  /** Best finishing position this season, if a race was run. */
  bestFinish: number | null
}

/** The current season: the career year the runner is in, and its race results so far. */
export function getSeason(state: GameState): Season {
  const { year, weekOfYear } = getCareerProgress(state.week.number)
  const results = getRaceHistory(state)
    .map(({ entry }) => entry.result)
    .filter((result) => getCareerProgress(result.week).year === year)
  const finishes = results.map((r) => r.position)
  return {
    year,
    weekOfYear,
    races: results.length,
    medals: finishes.filter((p) => medalFor(p) !== null).length,
    bestFinish: finishes.length ? Math.min(...finishes) : null,
  }
}
