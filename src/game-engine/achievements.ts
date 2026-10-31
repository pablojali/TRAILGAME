import { getLevel } from '../domain/athlete/levels'
import type { RaceCategory } from '../domain/races/categories'
import { getCareerProgress } from '../domain/training/calendar'
import { getRaceHistory, medalFor } from './career'
import type { GameState } from './gameState'

/**
 * Season and achievements (owner request, 31 October 2026). Like the rest of the Career screen
 * they are read from the saved career (finished races, XP, weeks played): nothing is stored for
 * them and they give no rewards, so they always match the career and need no server change.
 */

export interface AchievementDefinition {
  id: string
  title: string
  /** Targets in order, one per achievement level. */
  targets: readonly number[]
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

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-steps',
    title: 'Race Starter',
    targets: [1, 5, 10, 25, 50],
    describe: (n) => `Finish ${plural(n, 'race', 'races')}.`,
    value: (state) => finishedIn(state),
  },
  {
    id: 'trail-explorer',
    title: 'Trail Explorer',
    targets: [1, 5, 10, 25],
    describe: (n) => `Finish ${plural(n, 'trail race', 'trail races')}.`,
    value: (state) => finishedIn(state, 'trail'),
  },
  {
    id: 'first-summit',
    title: 'First Summit',
    targets: [1, 5, 10, 25],
    describe: (n) => `Finish ${plural(n, 'mountain race', 'mountain races')}.`,
    value: (state) => finishedIn(state, 'mountain'),
  },
  {
    id: 'elite',
    title: 'Among the Elite',
    targets: [1, 5, 10],
    describe: (n) => `Finish ${plural(n, 'elite race', 'elite races')}.`,
    value: (state) => finishedIn(state, 'elite'),
  },
  {
    id: 'podium',
    title: 'Podium Hunter',
    targets: [1, 5, 10, 25],
    describe: (n) => `Finish in the top 3 ${plural(n, 'time', 'times')}.`,
    value: (state) => positions(state).filter((p) => medalFor(p) !== null).length,
  },
  {
    id: 'champion',
    title: 'Champion',
    targets: [1, 3, 10],
    describe: (n) => `Win ${plural(n, 'race', 'races')}.`,
    value: (state) => positions(state).filter((p) => p === 1).length,
  },
  {
    id: 'rising-star',
    title: 'Rising Star',
    targets: [1000, 5000, 20000, 50000],
    describe: (n) => `Reach ${n.toLocaleString('en-US')} XP.`,
    value: (state) => state.athlete.xp,
  },
  {
    id: 'level',
    title: 'Climbing the Ranks',
    targets: [5, 10, 20, 30, 50],
    describe: (n) => `Reach Level ${n}.`,
    value: (state) => getLevel(state.athlete.xp),
  },
  {
    id: 'dedicated',
    title: 'Dedicated',
    targets: [4, 13, 26, 52, 104],
    describe: (n) => `Complete ${plural(n, 'training week', 'training weeks')}.`,
    value: (state) => state.week.number - 1,
  },
]

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
}

export function getAchievements(state: GameState): AchievementProgress[] {
  return ACHIEVEMENTS.map((definition) => {
    const value = definition.value(state)
    const reached = definition.targets.filter((target) => value >= target).length
    const complete = reached === definition.targets.length
    const index = complete ? definition.targets.length - 1 : reached
    const target = definition.targets[index]!
    return { definition, reached, level: index + 1, target, value: Math.min(value, target), complete }
  })
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
