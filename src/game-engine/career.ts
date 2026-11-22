import { DIFFICULTIES, difficultyOf, type Difficulty } from '../domain/races/format'
import { getRace, type Race } from '../domain/races/races'
import type { FinishedRaceEntry, GameState, RaceEntry } from './gameState'

/**
 * Career statistics (owner request, 30 October 2026), read from the finished race entries only:
 * nothing is stored for them, so they always match the saved results.
 */

export type Medal = 'gold' | 'silver' | 'bronze'

export const MEDAL_LABELS: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }

/** The medal for a finishing position: 1st gold, 2nd silver, 3rd bronze. */
export function medalFor(position: number): Medal | null {
  return position === 1 ? 'gold' : position === 2 ? 'silver' : position === 3 ? 'bronze' : null
}

export interface MedalCount {
  gold: number
  silver: number
  bronze: number
  /** Races finished in the category, with or without a medal. */
  races: number
}

export interface MedalTable {
  byDifficulty: Record<Difficulty, MedalCount>
  total: MedalCount
}

export interface HistoryRow {
  entry: FinishedRaceEntry
  race: Race
}

/**
 * True for a race the runner finished (B-6b): a finished entry that is not a DNF. A DNF stays in the
 * race history, but every statistic that means "finished" (race counts, medals, achievements, the
 * season summary, personal bests) counts finishers only.
 */
export function isFinisher(entry: RaceEntry): entry is FinishedRaceEntry {
  return entry.status === 'finished' && entry.result.dnf === undefined
}

/** The finished races (DNFs left out), oldest first. */
export function getFinishers(state: GameState): HistoryRow[] {
  return finished(state).filter(({ entry }) => isFinisher(entry))
}

/** Every race run to its end or to a DNF, oldest first. */
function finished(state: GameState): HistoryRow[] {
  return state.raceEntries.flatMap((entry) => {
    const race = entry.status === 'finished' ? getRace(entry.raceId) : undefined
    return entry.status === 'finished' && race ? [{ entry, race }] : []
  })
}

/** Every race run, newest first: finishers and DNFs (`isFinisher` tells them apart). */
export function getRaceHistory(state: GameState): HistoryRow[] {
  return finished(state).reverse()
}

/** Gold, silver and bronze medals won, by race difficulty and in total. */
export function getMedalTable(state: GameState): MedalTable {
  const empty = (): MedalCount => ({ gold: 0, silver: 0, bronze: 0, races: 0 })
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((d) => [d, empty()])) as Record<Difficulty, MedalCount>
  const total = empty()
  for (const { entry, race } of getFinishers(state)) {
    const medal = medalFor(entry.result.position)
    for (const count of [byDifficulty[difficultyOf(race)], total]) {
      count.races++
      if (medal) count[medal]++
    }
  }
  return { byDifficulty, total }
}

export interface PersonalBest {
  race: Race
  /** Best finishing position and the entry it came from (the earliest if tied). */
  bestPosition: number
  bestPositionEntry: FinishedRaceEntry
  /** Best time in seconds and the entry it came from (the earliest if tied). */
  bestTimeS: number
  bestTimeEntry: FinishedRaceEntry
  /** Times the race was run. */
  runs: number
}

/**
 * Best position and best time on each race finished, in catalog order. A DNF never sets a best
 * (B-6b) but counts as a run of a race that has a finish; a race with DNFs only has no best yet, so
 * it is not listed here (its runs are in the race history).
 */
export function getPersonalBests(state: GameState): PersonalBest[] {
  const byRace = new Map<string, PersonalBest>()
  for (const { entry, race } of getFinishers(state)) {
    const { position, timeS } = entry.result
    const best = byRace.get(race.id)
    if (!best) {
      byRace.set(race.id, {
        race,
        bestPosition: position,
        bestPositionEntry: entry,
        bestTimeS: timeS,
        bestTimeEntry: entry,
        runs: 1,
      })
      continue
    }
    best.runs++
    if (position < best.bestPosition) {
      best.bestPosition = position
      best.bestPositionEntry = entry
    }
    if (timeS < best.bestTimeS) {
      best.bestTimeS = timeS
      best.bestTimeEntry = entry
    }
  }
  for (const { entry, race } of finished(state)) {
    const best = byRace.get(race.id)
    if (best && !isFinisher(entry)) best.runs++
  }
  return [...byRace.values()].sort((a, b) => a.race.id.localeCompare(b.race.id))
}
