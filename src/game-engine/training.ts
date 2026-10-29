import { STAT_MAX, STAT_MIN } from '../domain/athlete/athlete'
import { ATTRIBUTE_POINTS_PER_LEVEL, getLevel } from '../domain/athlete/levels'
import {
  INJURY_FATIGUE_THRESHOLD,
  INJURY_FITNESS_LOSS,
  INJURY_REST_DAYS,
} from '../domain/training/injury'
import { getRestFatigueDelta } from '../domain/training/recovery'
import { isSessionType, TRAINING_SESSIONS, type SessionType } from '../domain/training/sessions'
import {
  createWeek,
  DAYS_PER_WEEK,
  getCurrentDay,
  type DayOutcome,
  type GameState,
  type TrainingWeek,
} from './gameState'
import { isRaceDayToday } from './raceSchedule'

export type TrainingError =
  /** The day was already executed. */
  | 'day-completed'
  /** The day is in the future and cannot be edited or executed yet. */
  | 'day-not-current'
  /** The request refers to a different week (e.g. a stale screen). */
  | 'wrong-week'
  | 'unknown-session'
  /** The current day is a forced Rest day after an injury. */
  | 'forced-rest'
  /** Today is a race Sunday: the day is completed by running the race, not a session. */
  | 'race-day'

export type TrainingResult<T> = { ok: true; value: T } | { ok: false; error: TrainingError }

/** Identifies the day the player is acting on, so stale or repeated requests are rejected. */
export interface DayRef {
  week: number
  dayIndex: number
}

export interface ExecutionResult {
  state: GameState
  /** Week and day that were executed. */
  executed: DayRef & { session: SessionType }
  outcome: DayOutcome
  levelBefore: number
  levelAfter: number
  /** Attribute points awarded by the levels gained in this execution. */
  attributePointsAwarded: number
  /** True when executing the final day started a new week. */
  weekCompleted: boolean
  /** True when the session caused an injury. */
  injured: boolean
}

export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value))
}

/**
 * Changes a session would apply to the current athlete, after clamping. A non-rest session that
 * would leave Fatigue above the injury threshold is reported as an injury: no XP, a Fitness loss
 * instead of the gain, and its Fatigue cost still applies.
 */
export function previewSession(state: GameState, session: SessionType): DayOutcome {
  const rules = TRAINING_SESSIONS[session]
  const { fitness, fatigue } = state.athlete
  // Rest recovers more with Recovery gained above the profile's start (owner decision).
  const fatigueDelta = session === 'rest' ? getRestFatigueDelta(state.athlete) : rules.fatigueDelta
  const fatigueChange = clampStat(fatigue + fatigueDelta) - fatigue
  if (session !== 'rest' && fatigue + fatigueChange > INJURY_FATIGUE_THRESHOLD) {
    return {
      xpGained: 0,
      fitnessChange: clampStat(fitness - INJURY_FITNESS_LOSS) - fitness,
      fatigueChange,
      injured: true,
    }
  }
  return {
    xpGained: rules.xp,
    fitnessChange: clampStat(fitness + rules.fitnessDelta) - fitness,
    fatigueChange,
  }
}

/** Plans Rest on up to `count` days of the week, starting at `fromIndex`. */
function forceRest(week: TrainingWeek, fromIndex: number, count: number): TrainingWeek {
  return {
    ...week,
    days: week.days.map((day, index) =>
      index >= fromIndex && index < fromIndex + count ? { ...day, session: 'rest' } : day,
    ),
  }
}

export function checkDay(state: GameState, ref: DayRef): TrainingError | null {
  if (ref.week !== state.week.number) return 'wrong-week'
  if (ref.dayIndex < state.week.currentDayIndex) return 'day-completed'
  if (ref.dayIndex !== state.week.currentDayIndex) return 'day-not-current'
  return null
}

/** Changes the planned session. Only the current, not-yet-executed day can be changed. */
export function planSession(
  state: GameState,
  ref: DayRef,
  session: SessionType,
): TrainingResult<GameState> {
  if (!isSessionType(session)) return { ok: false, error: 'unknown-session' }
  const error = checkDay(state, ref)
  if (error) return { ok: false, error }
  if (state.forcedRestDays > 0) return { ok: false, error: 'forced-rest' }
  if (isRaceDayToday(state)) return { ok: false, error: 'race-day' }

  const days = state.week.days.map((day, index) =>
    index === ref.dayIndex ? { ...day, session } : day,
  )
  return { ok: true, value: { ...state, week: { ...state.week, days } } }
}

/**
 * Executes the current day's planned session exactly once at `now` (epoch ms), then advances to the
 * next day. After the final day, a new week starts; athlete progression is kept. A non-rest session
 * resets the Fitness decay reference; Rest does not.
 */
export function executeCurrentDay(
  state: GameState,
  ref: DayRef,
  now: number,
): TrainingResult<ExecutionResult> {
  const error = checkDay(state, ref)
  if (error) return { ok: false, error }
  if (isRaceDayToday(state)) return { ok: false, error: 'race-day' }

  const day = getCurrentDay(state.week)
  const outcome = previewSession(state, day.session)
  const levelBefore = getLevel(state.athlete.xp)
  const advanced = completeCurrentDay(state, outcome, day.session !== 'rest', now)
  const levelAfter = getLevel(advanced.state.athlete.xp)

  return {
    ok: true,
    value: {
      state: advanced.state,
      executed: { ...ref, session: day.session },
      outcome,
      levelBefore,
      levelAfter,
      attributePointsAwarded: (levelAfter - levelBefore) * ATTRIBUTE_POINTS_PER_LEVEL,
      weekCompleted: advanced.weekCompleted,
      injured: outcome.injured === true,
    },
  }
}

/**
 * Applies an outcome to the current day and moves the calendar on: XP, Fitness and Fatigue change
 * by the outcome, forced Rest days are counted down (or set by a new injury), the next day becomes
 * current (a new week after day 7), and the Fitness decay reference is reset if `resetsDecay`.
 * Shared by training and race days, so both complete a day the same way. Callers check the day first.
 */
export function completeCurrentDay(
  state: GameState,
  outcome: DayOutcome,
  resetsDecay: boolean,
  now: number,
): { state: GameState; weekCompleted: boolean } {
  const injured = outcome.injured === true
  const athlete = {
    ...state.athlete,
    xp: state.athlete.xp + outcome.xpGained,
    fitness: state.athlete.fitness + outcome.fitnessChange,
    fatigue: state.athlete.fatigue + outcome.fatigueChange,
  }

  // A forced Rest day uses up one day of the injury; a new injury forces the following days.
  const forcedRestDays = injured ? INJURY_REST_DAYS : Math.max(0, state.forcedRestDays - 1)

  const dayIndex = state.week.currentDayIndex
  const nextDayIndex = dayIndex + 1
  const weekCompleted = nextDayIndex >= DAYS_PER_WEEK
  const week = weekCompleted
    ? forceRest(createWeek(state.week.number + 1), 0, forcedRestDays)
    : forceRest(
        {
          ...state.week,
          currentDayIndex: nextDayIndex,
          days: state.week.days.map((d, index) => (index === dayIndex ? { ...d, outcome } : d)),
        },
        nextDayIndex,
        forcedRestDays,
      )

  const fitnessDecayReference = resetsDecay ? now : state.fitnessDecayReference

  return {
    state: { ...state, athlete, week, fitnessDecayReference, forcedRestDays },
    weekCompleted,
  }
}

export interface WeekSummary {
  completedDays: number
  totalDays: number
  xpGained: number
}

export function summarizeWeek(state: GameState): WeekSummary {
  let xpGained = 0
  let completedDays = 0
  for (const day of state.week.days) {
    if (day.outcome) {
      completedDays++
      xpGained += day.outcome.xpGained
    }
  }
  return { completedDays, totalDays: state.week.days.length, xpGained }
}
