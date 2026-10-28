import type { Athlete, ProfileId } from '../domain/athlete/athlete'
import { PROFILES } from '../domain/athlete/profiles'
import type { SessionType } from '../domain/training/sessions'

export const DAYS_PER_WEEK = 7

/** Changes actually applied when a day was executed (after clamping). */
export interface DayOutcome {
  xpGained: number
  fitnessChange: number
  fatigueChange: number
}

export interface TrainingDay {
  /** 1–7 within the week. */
  day: number
  session: SessionType
  /** Present only once the day has been executed. */
  outcome: DayOutcome | null
}

export type DayStatus = 'completed' | 'current' | 'upcoming'

export interface TrainingWeek {
  /** 1-based week counter; increases on each rollover. */
  number: number
  /** Index (0–6) of the only day that can be edited or executed. */
  currentDayIndex: number
  days: TrainingDay[]
}

export interface GameState {
  athlete: Athlete
  week: TrainingWeek
  /**
   * Epoch milliseconds from which Fitness decay is measured: career creation, the last completed
   * non-rest session, or the end of the last decay period applied.
   */
  fitnessDecayReference: number
}

/** Deterministic plan used for the first week and every following week. */
export const DEFAULT_WEEK_PLAN: readonly SessionType[] = [
  'easy-run',
  'intervals',
  'strength',
  'rest',
  'hills',
  'long-run',
  'rest',
]

export function createWeek(number: number): TrainingWeek {
  return {
    number,
    currentDayIndex: 0,
    days: DEFAULT_WEEK_PLAN.map((session, index) => ({ day: index + 1, session, outcome: null })),
  }
}

/** Starting state for a new career with the chosen profile, created at `now` (epoch ms). */
export function createInitialGameState(profile: ProfileId, now: number): GameState {
  return {
    athlete: {
      name: 'Demo Runner',
      profile,
      xp: 0,
      fitness: 20,
      fatigue: 0,
      attributes: { ...PROFILES[profile].attributes },
      spentAttributePoints: 0,
    },
    week: createWeek(1),
    fitnessDecayReference: now,
  }
}

export function getDayStatus(week: TrainingWeek, dayIndex: number): DayStatus {
  if (dayIndex < week.currentDayIndex) return 'completed'
  if (dayIndex === week.currentDayIndex) return 'current'
  return 'upcoming'
}

export function getCurrentDay(week: TrainingWeek): TrainingDay {
  const day = week.days[week.currentDayIndex]
  if (!day) throw new Error(`Invalid current day index ${week.currentDayIndex}`)
  return day
}
