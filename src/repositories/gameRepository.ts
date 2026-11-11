import { ACHIEVEMENT_IDS, getReachedLevels } from '../game-engine/achievements'
import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_MIN,
  isAttributeId,
  isSex,
  roundStat,
  STAT_MAX,
  STAT_MIN,
  type Attributes,
  type Sex,
} from '../domain/athlete/athlete'
import { parseAppearance } from '../domain/athlete/appearance'
import { isCountryCode } from '../domain/athlete/countries'
import { STARTING_COINS } from '../domain/economy/coins'
import { getEquipmentItem, isConsumable, OWNED_FROM_START } from '../domain/equipment/items'
import { PRIZE_BANDS } from '../domain/races/categories'
import { getRace, isRaceId } from '../domain/races/races'
import { RACE_SIMULATION } from '../domain/races/simulationConfig'
import { isAidStop, isIntensity } from '../domain/races/strategyConfig'
import { getSegmentCount, type Nutrition, type RaceSplit } from '../game-engine/raceEngine'
import { getEarnedAttributePoints } from '../domain/athlete/levels'
import { isProfileId, PROFILE_ATTRIBUTE_TOTAL } from '../domain/athlete/profiles'
import { INJURY_REST_DAYS } from '../domain/training/injury'
import { isSessionType } from '../domain/training/sessions'
import {
  DAYS_PER_WEEK,
  type CoachProgress,
  type DayOutcome,
  type GameState,
  type RaceEntry,
  type RaceResult,
  type TrainingDay,
  type ActiveRace,
} from '../game-engine/gameState'

/**
 * Persistence boundary for the single-player career. Asynchronous so a remote database (Supabase,
 * future) can implement the same interface; localStorage is the active implementation.
 */
export interface GameRepository {
  /**
   * Reads the saved career: null when there is none. Rejects with `IncompatibleSaveError` when a
   * save exists that cannot be loaded. Never modifies or deletes stored data.
   */
  load(): Promise<GameState | null>
  /** Stores the career. Rejects with `SaveError` if it could not be stored. */
  save(state: GameState): Promise<void>
  /** Removes the saved career. */
  clear(): Promise<void>
}

/** A save exists but cannot be loaded; `reason` says why. Nothing was changed. */
export class IncompatibleSaveError extends Error {
  readonly reason: IncompatibleReason
  constructor(reason: IncompatibleReason) {
    super(`Incompatible save: ${reason}`)
    this.name = 'IncompatibleSaveError'
    this.reason = reason
  }
}

/** The career could not be stored (storage unavailable or full). */
export class SaveError extends Error {
  constructor(cause?: unknown) {
    super('The career could not be saved', { cause })
    this.name = 'SaveError'
  }
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

/** A number in range kept at 2 decimals at most (Fitness, Fatigue, attributes; 30 October 2026). */
function isHundredths(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && roundStat(value) === value
}

function isStat(value: unknown): value is number {
  return isHundredths(value, STAT_MIN, STAT_MAX)
}

function isAttributeGain(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isAttributeId(value.attribute) && isHundredths(value.amount, 0, 1))
}

function isOutcome(value: unknown): value is DayOutcome {
  return (
    isRecord(value) &&
    isInt(value.xpGained, 0) &&
    isHundredths(value.fitnessChange, -STAT_MAX, STAT_MAX) &&
    isHundredths(value.fatigueChange, -STAT_MAX, STAT_MAX) &&
    isAttributeGain(value.attributeGain) &&
    (value.consistencyGain === undefined || isHundredths(value.consistencyGain, 0, 1)) &&
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

const FACTOR_IDS: readonly unknown[] = ['fitness', 'fatigue', ...ATTRIBUTE_IDS, 'day-form', 'equipment']

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
    (value.rankingSeason === undefined || isInt(value.rankingSeason, 190001, 999912)) &&
    (value.rankingPoints === undefined || isInt(value.rankingPoints, 0)) &&
    (value.rankingAt === undefined || isInt(value.rankingAt, 0)) &&
    isInt(value.coinsAwarded, 0) &&
    isInt(value.xpAwarded, 0) &&
    value.netCoins === value.coinsAwarded - feePaid &&
    isHundredths(value.fatigueChange, -STAT_MAX, STAT_MAX) &&
    isHundredths(value.fitnessChange, -STAT_MAX, STAT_MAX) &&
    typeof value.injured === 'boolean' &&
    isInt(value.referenceTimeS, 1) &&
    isWholeNumber(value.gapS) &&
    Array.isArray(value.factors) &&
    value.factors.every(isFactor) &&
    (value.equipment === undefined ||
      (Array.isArray(value.equipment) && value.equipment.every((id) => typeof id === 'string' && getEquipmentItem(id)))) &&
    (value.rivalTimesS === undefined ||
      (Array.isArray(value.rivalTimesS) &&
        value.rivalTimesS.length === value.fieldSize - 1 &&
        value.rivalTimesS.every((t) => isInt(t, 1)))) &&
    (value.splits === undefined ||
      (Array.isArray(value.splits) && value.splits.length > 0 && isSplitList(value.splits, value.fieldSize, true))) &&
    (value.nutrition === undefined || isNutrition(value.nutrition))
  )
}

function isNutrition(value: unknown): boolean {
  return isRecord(value) && typeof value.gel === 'boolean' && typeof value.bar === 'boolean'
}

/** Race Engine V1 splits: every one but the last has its aid-station stop; arrivals only grow. */
function isSplitList(splits: unknown[], fieldSize: number, finished: boolean): boolean {
  let previous = 0
  return splits.every((split, index) => {
    const last = index === splits.length - 1
    const ok =
      isRecord(split) &&
      isIntensity(split.intensity) &&
      isInt(split.segmentS, 0) &&
      isInt(split.arrivalS, 1) &&
      split.arrivalS >= previous &&
      isFiniteNumber(split.fatigue) &&
      isInt(split.position, 1, fieldSize) &&
      (last && !finished
        ? split.stop === undefined
        : last
          ? split.stop === undefined && split.stopS === undefined
          : isAidStop(split.stop) && isInt(split.stopS, 0) && isFiniteNumber(split.fatigueAfterStop))
    if (ok) previous = (split.arrivalS as number) + ((split.stopS as number | undefined) ?? 0)
    return ok
  })
}

/** The race in progress: its entry is the scheduled one, on race Sunday, between two segments. */
function parseActiveRace(value: unknown, entries: readonly RaceEntry[], currentDayIndex: number): ActiveRace | null {
  if (!isRecord(value)) return null
  const entry = entries.find((e) => e.status === 'pending')
  const race = getRace(typeof value.raceId === 'string' ? value.raceId : '')
  const attributes = parseAttributes(value.attributes)
  const { equipment, nutrition, splits } = value
  if (
    !entry ||
    !race ||
    value.entryId !== entry.id ||
    value.raceId !== entry.raceId ||
    currentDayIndex !== DAYS_PER_WEEK - 1 ||
    !isFiniteNumber(value.startedAt) ||
    !isInt(value.levelAtStart, 1) ||
    !attributes ||
    !isStat(value.fitness) ||
    !isStat(value.fatigue) ||
    !Array.isArray(equipment) ||
    !equipment.every((id) => typeof id === 'string' && getEquipmentItem(id) && !isConsumable(getEquipmentItem(id)!)) ||
    !isFiniteNumber(value.dayForm) ||
    Math.abs(value.dayForm) > 1 ||
    !isNutrition(nutrition) ||
    !isFiniteNumber(value.elapsedS) ||
    value.elapsedS <= 0 ||
    !isFiniteNumber(value.inRaceFatigue) ||
    !Array.isArray(splits) ||
    splits.length === 0 ||
    splits.length >= getSegmentCount(race) ||
    !isSplitList(splits, RACE_SIMULATION.fieldSize, false)
  ) {
    return null
  }
  return {
    entryId: entry.id,
    raceId: race.id,
    startedAt: value.startedAt,
    levelAtStart: value.levelAtStart,
    attributes,
    fitness: value.fitness,
    fatigue: value.fatigue,
    equipment: [...(equipment as string[])],
    dayForm: value.dayForm,
    nutrition: { gel: (nutrition as Nutrition).gel, bar: (nutrition as Nutrition).bar },
    elapsedS: value.elapsedS,
    inRaceFatigue: value.inRaceFatigue,
    splits: structuredClone(splits as RaceSplit[]),
  }
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
    !isFiniteNumber(value.enteredAt) ||
    (value.major !== undefined &&
      !(isRecord(value.major) && typeof value.major.eventId === 'string' && value.major.eventId.length > 0 && typeof value.major.name === 'string'))
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
    if (!isHundredths(v, ATTRIBUTE_MIN, Number.MAX_SAFE_INTEGER)) return null
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
  // Attributes grow by spent points and by training (since 30 October 2026), never below the
  // profile's total plus the points spent.
  const total = roundStat(ATTRIBUTE_IDS.reduce((sum, id) => sum + attributes[id], 0))
  if (total < PROFILE_ATTRIBUTE_TOTAL + athlete.spentAttributePoints) return null

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
  // Missing: a career saved before equipment existed (nothing equipped). Known items, one per slot.
  const equipment = value.equipment === undefined ? [] : value.equipment
  if (!Array.isArray(equipment) || !equipment.every((id) => typeof id === 'string' && getEquipmentItem(id))) {
    return null
  }
  const slots = (equipment as string[]).map((id) => getEquipmentItem(id)!.slot)
  if (new Set(slots).size !== slots.length) return null
  // Missing: a career saved before the shop existed (it owns the starting equipment).
  const ownedEquipment = value.ownedEquipment === undefined ? [...OWNED_FROM_START] : value.ownedEquipment
  if (
    !Array.isArray(ownedEquipment) ||
    !ownedEquipment.every((id) => typeof id === 'string' && getEquipmentItem(id)) ||
    new Set(ownedEquipment).size !== ownedEquipment.length ||
    !OWNED_FROM_START.every((id) => ownedEquipment.includes(id)) ||
    !(equipment as string[]).every((id) => ownedEquipment.includes(id))
  ) {
    return null
  }

  // Gels and cereal bars are counted, never owned as items nor equipped.
  if ([...(equipment as string[]), ...(ownedEquipment as string[])].some((id) => isConsumable(getEquipmentItem(id)!))) {
    return null
  }
  // Missing: a career saved before consumables existed (none in stock).
  const rawConsumables = value.consumables === undefined ? { gel: 0, bar: 0 } : value.consumables
  if (!isRecord(rawConsumables) || !isInt(rawConsumables.gel, 0) || !isInt(rawConsumables.bar, 0)) return null

  // Missing: a career saved before Race Engine V1 (no race in progress).
  const activeRace =
    value.activeRace === undefined || value.activeRace === null
      ? null
      : parseActiveRace(value.activeRace, raceEntries, currentDayIndex)
  if (value.activeRace !== undefined && value.activeRace !== null && !activeRace) return null

  // A race day must point to the finished entry it raced.
  const finishedIds = new Set(raceEntries.filter((e) => e.status === 'finished').map((e) => e.id))
  const raceDays = (week.days as TrainingDay[]).filter((day) => day.outcome?.raceEntryId !== undefined)
  if (!raceDays.every((day) => finishedIds.has(day.outcome!.raceEntryId!))) return null

  // Missing: a career saved before recovery Rest existed. Derived from the last completed day of
  // this week (a race or a non-rest session is active); on Monday it is unknown, so no bonus.
  const previousDay = currentDayIndex > 0 ? (week.days as TrainingDay[])[currentDayIndex - 1]! : undefined
  const previousDayActive =
    value.previousDayActive === undefined
      ? previousDay !== undefined && (previousDay.outcome?.raceEntryId !== undefined || previousDay.session !== 'rest')
      : value.previousDayActive
  if (typeof previousDayActive !== 'boolean') return null

  const reference = value.fitnessDecayReference
  const rewarded = value.achievementLevelsRewarded
  if (
    rewarded !== undefined &&
    (!isRecord(rewarded) ||
      !Object.entries(rewarded).every(
        ([id, level]) => (ACHIEVEMENT_IDS as readonly string[]).includes(id) && isInt(level, 0),
      ))
  ) {
    return null
  }
  const parsed: GameState = {
    athlete: {
      name: athlete.name,
      sex,
      // Missing: a career saved before appearance existed. Never rejects a save (cosmetic only).
      appearance: parseAppearance(athlete.appearance, sex),
      // Missing or unknown: no country (cosmetic; never rejects a save).
      ...(isCountryCode(athlete.country) ? { country: athlete.country } : {}),
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
    previousDayActive,
    forcedRestDays,
    coins,
    raceEntries,
    equipment: [...(equipment as string[])],
    ownedEquipment: [...(ownedEquipment as string[])],
    consumables: { gel: rawConsumables.gel as number, bar: rawConsumables.bar as number },
    activeRace,
    achievementLevelsRewarded: {},
  }
  // Missing: a career saved before achievement rewards existed. Levels already reached count as
  // rewarded, so nothing is given for them afterwards.
  parsed.achievementLevelsRewarded =
    rewarded === undefined ? getReachedLevels(parsed) : { ...(rewarded as Record<string, number>) }
  // Missing or invalid coach progress: no welcome (cosmetic; never rejects a save).
  const coach = parseCoachProgress(value.coach)
  if (coach) parsed.coach = coach
  return parsed
}

function parseCoachProgress(value: unknown): CoachProgress | null {
  if (!isRecord(value) || !isInt(value.welcomeStep, 0) || typeof value.welcomeDone !== 'boolean') return null
  const progress: CoachProgress = { welcomeStep: value.welcomeStep, welcomeDone: value.welcomeDone }
  // Moments seen (ids, at most a few dozen) and the step on screen; anything else is dropped.
  if (Array.isArray(value.seen) && value.seen.length <= 64 && value.seen.every((id) => typeof id === 'string' && id.length <= 40)) {
    progress.seen = [...new Set(value.seen as string[])]
  }
  if (isInt(value.step, 0, 99)) progress.step = value.step
  return progress
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

/**
 * The localStorage repository (key `trailgame.save`, schema v2). `clock` gives the time used when a
 * saved career has no valid Fitness decay reference.
 */
export function createLocalStorageGameRepository(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = getLocalStorage(),
  clock: () => number = Date.now,
): GameRepository {
  return {
    async load() {
      let raw: string | null = null
      try {
        raw = storage?.getItem(SAVE_KEY) ?? null
      } catch {
        // Storage unavailable (e.g. blocked by browser settings).
      }
      if (raw === null) return null
      const result = parseSave(raw, clock())
      if (result.status === 'incompatible') throw new IncompatibleSaveError(result.reason)
      return result.status === 'loaded' ? result.state : null
    },

    async save(state) {
      if (!storage) throw new SaveError()
      const envelope: SaveEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        state,
      }
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(envelope))
      } catch (error) {
        throw new SaveError(error)
      }
    },

    async clear() {
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
