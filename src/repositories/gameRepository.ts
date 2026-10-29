import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  isSex,
  STAT_MAX,
  STAT_MIN,
  type Attributes,
  type Sex,
} from '../domain/athlete/athlete'
import { parseAppearance } from '../domain/athlete/appearance'
import { STARTING_COINS } from '../domain/economy/coins'
import { PRIZE_BANDS } from '../domain/races/categories'
import { isRaceId } from '../domain/races/races'
import { getEarnedAttributePoints } from '../domain/athlete/levels'
import { isProfileId, PROFILE_ATTRIBUTE_TOTAL } from '../domain/athlete/profiles'
import { INJURY_REST_DAYS } from '../domain/training/injury'
import { isSessionType } from '../domain/training/sessions'
import {
  DAYS_PER_WEEK,
  type DayOutcome,
  type GameState,
  type RaceEntry,
  type RaceResult,
  type TrainingDay,
} from '../game-engine/gameState'

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

/**
 * Sex for v2 careers saved before the cosmetic `sex` field existed (owner decision). The field was
 * added without a schema bump so those careers keep loading.
 */
export const LEGACY_DEFAULT_SEX: Sex = 'male'

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
    isInt(value.fatigueChange, -STAT_MAX, STAT_MAX) &&
    (value.injured === undefined || typeof value.injured === 'boolean') &&
    (value.raceEntryId === undefined || (typeof value.raceEntryId === 'string' && value.raceEntryId.length > 0))
  )
}

function isTrainingDay(value: unknown, index: number, currentDayIndex: number): value is TrainingDay {
  if (!isRecord(value) || value.day !== index + 1 || !isSessionType(value.session)) return false
  // Days before the current one must be completed; the rest must not be.
  return index < currentDayIndex ? isOutcome(value.outcome) : value.outcome === null
}

const ENTRY_TYPES: readonly unknown[] = ['free', 'standard', 'early']

const FACTOR_IDS: readonly unknown[] = ['fitness', 'fatigue', ...ATTRIBUTE_IDS, 'day-form']

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isFactor(value: unknown): boolean {
  return (
    isRecord(value) &&
    FACTOR_IDS.includes(value.id) &&
    isFiniteNumber(value.value) &&
    isFiniteNumber(value.reference) &&
    isWholeNumber(value.effectS)
  )
}

/** A stored race result; its net coins must match the fee paid. */
function isRaceResult(value: unknown, feePaid: number): value is RaceResult {
  return (
    isRecord(value) &&
    isFiniteNumber(value.startedAt) &&
    isInt(value.week, 1) &&
    isInt(value.day, 1, DAYS_PER_WEEK) &&
    isInt(value.levelAtStart, 1) &&
    parseAttributes(value.attributes) !== null &&
    isStat(value.fitness) &&
    isStat(value.fatigue) &&
    isFiniteNumber(value.dayForm) &&
    Math.abs(value.dayForm) <= 1 &&
    isInt(value.timeS, 1) &&
    isInt(value.fieldSize, 1) &&
    isInt(value.position, 1, value.fieldSize) &&
    isInt(value.band, 0, PRIZE_BANDS.length - 1) &&
    isInt(value.grossPrize, 0) &&
    isInt(value.multiplierPct, 0, 100) &&
    isInt(value.coinsAwarded, 0) &&
    isInt(value.xpAwarded, 0) &&
    value.netCoins === value.coinsAwarded - feePaid &&
    isInt(value.fatigueChange, -STAT_MAX, STAT_MAX) &&
    isInt(value.fitnessChange, -STAT_MAX, STAT_MAX) &&
    typeof value.injured === 'boolean' &&
    isInt(value.referenceTimeS, 1) &&
    isWholeNumber(value.gapS) &&
    Array.isArray(value.factors) &&
    value.factors.every(isFactor)
  )
}

function isRaceEntry(value: unknown): value is RaceEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !isRaceId(value.raceId) ||
    !ENTRY_TYPES.includes(value.entryType) ||
    !isInt(value.feePaid, 0) ||
    !isInt(value.levelAtEntry, 1) ||
    !isFiniteNumber(value.enteredAt)
  ) {
    return false
  }
  if (value.status === 'pending') return value.result === undefined
  return value.status === 'finished' && isRaceResult(value.result, value.feePaid)
}

/** Race entries with unique ids and at most one pending entry per race, or null. */
function parseRaceEntries(value: unknown): RaceEntry[] | null {
  if (!Array.isArray(value) || !value.every(isRaceEntry)) return null
  const entries = value as RaceEntry[]
  if (new Set(entries.map((e) => e.id)).size !== entries.length) return null
  const pending = entries.filter((e) => e.status === 'pending').map((e) => e.raceId)
  if (new Set(pending).size !== pending.length) return null
  return entries.map((e) => structuredClone(e))
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
  // Missing sex: a career saved before the field existed. Any other non-sex value is invalid data.
  const sex = athlete.sex === undefined ? LEGACY_DEFAULT_SEX : athlete.sex
  if (
    typeof athlete.name !== 'string' ||
    !isSex(sex) ||
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

  // Missing: a career saved before the injury rule existed. Forced Rest days must be planned as Rest.
  const forcedRestDays = value.forcedRestDays === undefined ? 0 : value.forcedRestDays
  if (!isInt(forcedRestDays, 0, INJURY_REST_DAYS)) return null
  const forcedInWeek = (week.days as TrainingDay[]).slice(currentDayIndex, currentDayIndex + forcedRestDays)
  if (!forcedInWeek.every((day) => day.session === 'rest')) return null

  // Missing: a career saved before races existed (no coins, no entries).
  const coins = value.coins === undefined ? STARTING_COINS : value.coins
  if (!isInt(coins, 0)) return null
  const raceEntries = parseRaceEntries(value.raceEntries === undefined ? [] : value.raceEntries)
  if (!raceEntries) return null
  // A race day must point to the finished entry it raced.
  const finishedIds = new Set(raceEntries.filter((e) => e.status === 'finished').map((e) => e.id))
  const raceDays = (week.days as TrainingDay[]).filter((day) => day.outcome?.raceEntryId !== undefined)
  if (!raceDays.every((day) => finishedIds.has(day.outcome!.raceEntryId!))) return null

  const reference = value.fitnessDecayReference
  return {
    athlete: {
      name: athlete.name,
      sex,
      // Missing: a career saved before appearance existed. Never rejects a save (cosmetic only).
      appearance: parseAppearance(athlete.appearance, sex),
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
    forcedRestDays,
    coins,
    raceEntries,
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
