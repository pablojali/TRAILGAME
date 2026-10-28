import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  STAT_MAX,
  STAT_MIN,
  type Attributes,
} from '../domain/athlete/athlete'
import { getEarnedAttributePoints } from '../domain/athlete/levels'
import { isProfileId, PROFILE_ATTRIBUTE_TOTAL } from '../domain/athlete/profiles'
import { isSessionType } from '../domain/training/sessions'
import { DAYS_PER_WEEK, type DayOutcome, type GameState, type TrainingDay } from '../game-engine/gameState'

/**
 * Persistence boundary for the single-player career. M2 stores to localStorage;
 * a future backend can implement the same interface.
 */
export interface GameRepository {
  /** Reads the saved career. Never modifies or deletes stored data. */
  load(now: number): LoadResult
  /** Returns false if the state could not be stored. */
  save(state: GameState): boolean
  /** Removes the saved career. */
  clear(): void
}

export type IncompatibleReason =
  /** A save from M1 (schema v1), whose athlete model cannot be converted. */
  | 'legacy-v1'
  /** A save with an unknown schema version, e.g. from a newer build. */
  | 'unsupported-version'
  /** Unreadable or invalid data. */
  | 'malformed'

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; state: GameState }
  | { status: 'incompatible'; reason: IncompatibleReason }

export const SAVE_KEY = 'trailgame.save'
export const SCHEMA_VERSION = 2

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

function parseAttributes(value: unknown): Attributes | null {
  if (!isRecord(value)) return null
  const attributes = {} as Attributes
  for (const id of ATTRIBUTE_IDS) {
    const v = value[id]
    if (!isInt(v, ATTRIBUTE_MIN, ATTRIBUTE_MAX)) return null
    attributes[id] = v
  }
  return attributes
}

/**
 * Validates untrusted v2 game state. Returns null if it is not a consistent career.
 * A missing or invalid Fitness decay reference is replaced by `now` (no decay) rather than
 * rejecting an otherwise valid career; future references are handled by the decay rule.
 */
export function parseGameState(value: unknown, now: number): GameState | null {
  if (!isRecord(value) || !isRecord(value.athlete) || !isRecord(value.week)) return null
  const { athlete, week } = value

  const attributes = parseAttributes(athlete.attributes)
  if (
    typeof athlete.name !== 'string' ||
    !isProfileId(athlete.profile) ||
    !isInt(athlete.xp, 0) ||
    !isStat(athlete.fitness) ||
    !isStat(athlete.fatigue) ||
    !attributes ||
    !isInt(athlete.spentAttributePoints, 0, getEarnedAttributePoints(athlete.xp))
  ) {
    return null
  }
  // Attributes change only by spending points, so their total is fixed by the points spent.
  const total = ATTRIBUTE_IDS.reduce((sum, id) => sum + attributes[id], 0)
  if (total !== PROFILE_ATTRIBUTE_TOTAL + athlete.spentAttributePoints) return null

  if (!isInt(week.number, 1) || !isInt(week.currentDayIndex, 0, DAYS_PER_WEEK - 1)) return null
  const currentDayIndex = week.currentDayIndex
  if (
    !Array.isArray(week.days) ||
    week.days.length !== DAYS_PER_WEEK ||
    !week.days.every((day, index) => isTrainingDay(day, index, currentDayIndex))
  ) {
    return null
  }

  const reference = value.fitnessDecayReference
  return {
    athlete: {
      name: athlete.name,
      profile: athlete.profile,
      xp: athlete.xp,
      fitness: athlete.fitness,
      fatigue: athlete.fatigue,
      attributes,
      spentAttributePoints: athlete.spentAttributePoints,
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
    fitnessDecayReference: typeof reference === 'number' && Number.isFinite(reference) ? reference : now,
  }
}

/** Classifies a raw saved string. Never throws. */
export function parseSave(raw: string, now: number): LoadResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'incompatible', reason: 'malformed' }
  }
  if (!isRecord(data) || typeof data.schemaVersion !== 'number') {
    return { status: 'incompatible', reason: 'malformed' }
  }
  if (data.schemaVersion === 1) return { status: 'incompatible', reason: 'legacy-v1' }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return { status: 'incompatible', reason: 'unsupported-version' }
  }
  const state = parseGameState(data.state, now)
  return state ? { status: 'loaded', state } : { status: 'incompatible', reason: 'malformed' }
}

export function createLocalStorageGameRepository(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = getLocalStorage(),
): GameRepository {
  return {
    load(now) {
      let raw: string | null = null
      try {
        raw = storage?.getItem(SAVE_KEY) ?? null
      } catch {
        // Storage unavailable (e.g. blocked by browser settings).
      }
      return raw === null ? { status: 'empty' } : parseSave(raw, now)
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

    clear() {
      try {
        storage?.removeItem(SAVE_KEY)
      } catch {
        // Nothing to clear if storage is unavailable.
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
