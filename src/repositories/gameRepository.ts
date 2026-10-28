import { ATTRIBUTE_IDS, STAT_MAX, STAT_MIN } from '../domain/athlete/athlete'
import { isSessionType } from '../domain/training/sessions'
import {
  createInitialGameState,
  DAYS_PER_WEEK,
  type DayOutcome,
  type GameState,
  type TrainingDay,
} from '../game-engine/gameState'

/**
 * Persistence boundary for the single-player game. M1 stores to localStorage;
 * a future backend can implement the same interface.
 */
export interface GameRepository {
  load(): LoadResult
  /** Returns false if the state could not be stored. */
  save(state: GameState): boolean
  /** Removes the saved game. */
  clear(): void
}

export type LoadStatus =
  /** No save found; initial demo state. */
  | 'new'
  | 'loaded'
  /** A save existed but was malformed or unsupported; initial demo state. */
  | 'recovered'

export interface LoadResult {
  state: GameState
  status: LoadStatus
}

export const SAVE_KEY = 'trailgame.save'
export const SCHEMA_VERSION = 1

interface SaveEnvelope {
  schemaVersion: number
  savedAt: string
  state: GameState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInt(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isStat(value: unknown): value is number {
  return isInt(value, STAT_MIN, STAT_MAX)
}

function isOutcome(value: unknown): value is DayOutcome {
  return (
    isRecord(value) &&
    isInt(value.xpGained, 0) &&
    isInt(value.fitnessChange, -STAT_MAX, STAT_MAX) &&
    isInt(value.fatigueChange, -STAT_MAX, STAT_MAX)
  )
}

function isTrainingDay(value: unknown, index: number, currentDayIndex: number): value is TrainingDay {
  if (!isRecord(value) || value.day !== index + 1 || !isSessionType(value.session)) return false
  // Days before the current one must be completed; the rest must not be.
  return index < currentDayIndex ? isOutcome(value.outcome) : value.outcome === null
}

/** Validates untrusted saved data. Returns null if it is not a valid M1 game state. */
export function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || !isRecord(value.athlete) || !isRecord(value.week)) return null
  const { athlete, week } = value

  if (
    typeof athlete.name !== 'string' ||
    athlete.archetype !== 'all-rounder' ||
    !isInt(athlete.xp, 0) ||
    !isStat(athlete.fitness) ||
    !isStat(athlete.fatigue) ||
    !isRecord(athlete.attributes)
  ) {
    return null
  }
  const attributes = athlete.attributes
  if (!ATTRIBUTE_IDS.every((id) => isStat(attributes[id]))) return null

  if (!isInt(week.number, 1) || !isInt(week.currentDayIndex, 0, DAYS_PER_WEEK - 1)) return null
  const currentDayIndex = week.currentDayIndex
  if (
    !Array.isArray(week.days) ||
    week.days.length !== DAYS_PER_WEEK ||
    !week.days.every((day, index) => isTrainingDay(day, index, currentDayIndex))
  ) {
    return null
  }

  return {
    athlete: {
      name: athlete.name,
      archetype: athlete.archetype,
      xp: athlete.xp,
      fitness: athlete.fitness,
      fatigue: athlete.fatigue,
      attributes: {
        endurance: attributes.endurance as number,
        speed: attributes.speed as number,
        power: attributes.power as number,
        technique: attributes.technique as number,
        strength: attributes.strength as number,
        recovery: attributes.recovery as number,
      },
    },
    week: {
      number: week.number,
      currentDayIndex,
      days: (week.days as TrainingDay[]).map((day) => ({
        day: day.day,
        session: day.session,
        outcome: day.outcome && { ...day.outcome },
      })),
    },
  }
}

/** Parses a raw saved string. Returns null for missing, malformed or unsupported data. */
export function parseSave(raw: string): GameState | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || data.schemaVersion !== SCHEMA_VERSION) return null
  return parseGameState(data.state)
}

export function createLocalStorageGameRepository(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = getLocalStorage(),
): GameRepository {
  function clear() {
    try {
      storage?.removeItem(SAVE_KEY)
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }

  return {
    clear,

    load() {
      let raw: string | null = null
      try {
        raw = storage?.getItem(SAVE_KEY) ?? null
      } catch {
        // Storage unavailable (e.g. blocked by browser settings).
      }
      if (raw === null) return { state: createInitialGameState(), status: 'new' }

      const state = parseSave(raw)
      if (state) return { state, status: 'loaded' }

      clear()
      return { state: createInitialGameState(), status: 'recovered' }
    },

    save(state) {
      if (!storage) return false
      const envelope: SaveEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        state,
      }
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(envelope))
        return true
      } catch {
        return false
      }
    },
  }
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
