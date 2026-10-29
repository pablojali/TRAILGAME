import { defaultAppearance, type Appearance } from '../domain/athlete/appearance'
import type { Athlete, Attributes, ProfileId, Sex } from '../domain/athlete/athlete'
import { PROFILES } from '../domain/athlete/profiles'
import { STARTING_COINS } from '../domain/economy/coins'
import { OWNED_FROM_START } from '../domain/equipment/items'
import type { EntryType } from '../domain/races/access'
import type { ExplanationFactor } from './raceSimulation'
import type { SessionType } from '../domain/training/sessions'

export const DAYS_PER_WEEK = 7

/** Changes actually applied when a day was executed (after clamping). */
export interface DayOutcome {
  xpGained: number
  fitnessChange: number
  fatigueChange: number
  /** True if the session caused an injury. */
  injured?: boolean
  /** Set when the day was a race instead of the planned session: the finished entry's id. */
  raceEntryId?: string
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
  /**
   * Number of upcoming days, starting with the current one, that are forced to Rest after an injury.
   * Those days are already planned as Rest and cannot be changed.
   */
  forcedRestDays: number
  /** Whole coins, never negative. */
  coins: number
  /** Race entries, oldest first. */
  raceEntries: RaceEntry[]
  /** Equipped item ids, at most one per slot, all owned. Cosmetic for now (Game Design Bible §8). */
  equipment: string[]
  /** Item ids the runner owns: the starting equipment plus shop purchases. */
  ownedEquipment: string[]
}

/**
 * A confirmed race entry. The fee was paid once, when it was created. A `pending` entry is raced on
 * a later day; racing makes it `finished` and stores its result, in the same state change.
 */
export type RaceEntry = PendingRaceEntry | FinishedRaceEntry

interface RaceEntryBase {
  /** Unique within the career, e.g. `entry-3`. */
  id: string
  raceId: string
  entryType: EntryType
  feePaid: number
  /** Athlete level when the entry was confirmed (sets the fee). */
  levelAtEntry: number
  /** Epoch ms. */
  enteredAt: number
}

export interface PendingRaceEntry extends RaceEntryBase {
  status: 'pending'
}

export interface FinishedRaceEntry extends RaceEntryBase {
  status: 'finished'
  result: RaceResult
}

/** Everything needed to show a finished race again without re-simulating or re-awarding it. */
export interface RaceResult {
  /** Epoch ms. */
  startedAt: number
  /** Week and day of the training calendar the race took. */
  week: number
  day: number
  /** Athlete level when the race started (sets the reward multiplier). */
  levelAtStart: number
  /** Inputs as they were at the start. */
  attributes: Attributes
  fitness: number
  fatigue: number
  dayForm: number
  timeS: number
  position: number
  fieldSize: number
  /** Index into `PRIZE_BANDS`. */
  band: number
  grossPrize: number
  /** Whole percent (100, 75, 40 or 0). */
  multiplierPct: number
  coinsAwarded: number
  xpAwarded: number
  /** coinsAwarded − feePaid. */
  netCoins: number
  fatigueChange: number
  fitnessChange: number
  injured: boolean
  referenceTimeS: number
  gapS: number
  factors: ExplanationFactor[]
  /** Equipped items at the start (their race effects applied). Missing in older results: none. */
  equipment?: string[]
  /** The 49 rivals' times in whole seconds, fastest first. Missing in results saved before it existed. */
  rivalTimesS?: number[]
}

/** Deterministic plan used for the first week and every following week. */
export const DEFAULT_WEEK_PLAN: readonly SessionType[] = [
  // 4 training days and 3 rest days (owner decision, 29 October 2026). Sunday is also race day.
  'easy-run',
  'intervals',
  'rest',
  'hills',
  'rest',
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

/** Cosmetic identity chosen when creating a career. */
export interface AthleteIdentity {
  name: string
  sex: Sex
  /** Defaults to the default appearance for `sex`. */
  appearance?: Appearance
}

/**
 * Starting state for a new career with the chosen profile, created at `now` (epoch ms).
 * The identity is cosmetic and does not affect any starting value.
 */
export function createInitialGameState(
  profile: ProfileId,
  now: number,
  identity: AthleteIdentity,
): GameState {
  return {
    athlete: {
      name: identity.name,
      sex: identity.sex,
      appearance: identity.appearance ?? defaultAppearance(identity.sex),
      profile,
      xp: 0,
      fitness: 20,
      fatigue: 0,
      attributes: { ...PROFILES[profile].attributes },
      spentAttributePoints: 0,
    },
    week: createWeek(1),
    fitnessDecayReference: now,
    forcedRestDays: 0,
    coins: STARTING_COINS,
    raceEntries: [],
    equipment: [],
    ownedEquipment: [...OWNED_FROM_START],
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
