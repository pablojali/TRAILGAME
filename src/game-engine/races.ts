import { ATTRIBUTE_POINTS_PER_LEVEL, getLevel } from '../domain/athlete/levels'
import { getEntryFee, getRewardMultiplier } from '../domain/races/access'
import { GROSS_PRIZES, PRIZE_BANDS, RACE_XP_BAND_PCT, RACE_XP_BASE } from '../domain/races/categories'
import { getRace, type Race } from '../domain/races/races'
import { RACE_SIMULATION } from '../domain/races/simulationConfig'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS } from '../domain/training/injury'
import type { DayOutcome, FinishedRaceEntry, GameState, PendingRaceEntry, RaceEntry, RaceResult } from './gameState'
import { getScheduledEntry, RACE_DAY_INDEX } from './raceSchedule'
import { courseEffortKm, explainRace, generateCourse, getDayForm, rivalTimes, simulateRace } from './raceSimulation'
import { checkDay, clampStat, completeCurrentDay, type DayRef, type TrainingError } from './training'

export type RaceEntryError =
  | 'unknown-race'
  /** The race already has a pending entry: entering again would charge twice. */
  | 'already-entered'
  | 'insufficient-coins'
  /** The fee the player confirmed is not the fee that applies now (e.g. the level changed). */
  | 'fee-changed'
  /** Another race is already scheduled for the coming Sunday (one race per week). */
  | 'race-scheduled'

export type RaceEntryResult = { ok: true; state: GameState; entry: RaceEntry } | { ok: false; error: RaceEntryError }

export function getPendingEntry(state: GameState, raceId: string): PendingRaceEntry | undefined {
  return state.raceEntries.find(
    (entry): entry is PendingRaceEntry => entry.raceId === raceId && entry.status === 'pending',
  )
}

export function getFinishedEntries(state: GameState, raceId?: string): FinishedRaceEntry[] {
  return state.raceEntries.filter(
    (entry): entry is FinishedRaceEntry => entry.status === 'finished' && (raceId === undefined || entry.raceId === raceId),
  )
}

export function getEntry(state: GameState, entryId: string): RaceEntry | undefined {
  return state.raceEntries.find((entry) => entry.id === entryId)
}

/**
 * Enters a race and pays its fee once (Game Design Bible §10.3). `confirmedFee` is the fee the
 * player saw when confirming; the entry is rejected if it no longer applies. A repeated request is
 * rejected because the race already has a pending entry, so the fee cannot be charged twice.
 */
export function enterRace(state: GameState, raceId: string, confirmedFee: number, now: number): RaceEntryResult {
  const race = getRace(raceId)
  if (!race) return { ok: false, error: 'unknown-race' }
  if (getPendingEntry(state, raceId)) return { ok: false, error: 'already-entered' }
  if (getScheduledEntry(state)) return { ok: false, error: 'race-scheduled' }
  const level = getLevel(state.athlete.xp)
  const { type, fee } = getEntryFee(race, level)
  if (fee !== confirmedFee) return { ok: false, error: 'fee-changed' }
  if (fee > state.coins) return { ok: false, error: 'insufficient-coins' }

  const entry: RaceEntry = {
    id: `entry-${state.raceEntries.length + 1}`,
    raceId,
    entryType: type,
    feePaid: fee,
    levelAtEntry: level,
    enteredAt: now,
    status: 'pending',
  }
  return {
    ok: true,
    entry,
    state: { ...state, coins: state.coins - fee, raceEntries: [...state.raceEntries, entry] },
  }
}

/** Position band index into `PRIZE_BANDS`. */
export function getPrizeBand(position: number): number {
  const index = PRIZE_BANDS.findIndex((band) => position >= band.from && (band.to === null || position <= band.to))
  return index === -1 ? PRIZE_BANDS.length - 1 : index
}

export interface RaceRewards {
  band: number
  grossPrize: number
  /** Whole percent. */
  multiplierPct: number
  coinsAwarded: number
  /** Before any injury rule. */
  xp: number
}

/**
 * Rewards for a finishing position (Game Design Bible §10.8–§10.9, D5). Integer arithmetic only,
 * rounded down once, so no floating-point error can change a value.
 */
export function getRaceRewards(race: Race, position: number, levelAtStart: number): RaceRewards {
  const band = getPrizeBand(position)
  const multiplierPct = Math.round(getRewardMultiplier(race, levelAtStart).coins * 100)
  const grossPrize = GROSS_PRIZES[race.category][band]!
  return {
    band,
    grossPrize,
    multiplierPct,
    coinsAwarded: Math.floor((grossPrize * multiplierPct) / 100),
    xp: Math.floor((RACE_XP_BASE[race.category] * RACE_XP_BAND_PCT[band]! * multiplierPct) / 10000),
  }
}

/** Fatigue a race adds before clamping (D3). */
export function getRaceFatigue(race: Race): number {
  return Math.round(
    RACE_SIMULATION.raceFatigueBase + RACE_SIMULATION.raceFatiguePerEffortKm * courseEffortKm(generateCourse(race)),
  )
}

/** What racing today would do to Fatigue, and whether it would injure the athlete (same rule as training). */
export function previewRaceDay(state: GameState, race: Race): { fatigueChange: number; injured: boolean } {
  const { fatigue } = state.athlete
  const fatigueChange = clampStat(fatigue + getRaceFatigue(race)) - fatigue
  return { fatigueChange, injured: fatigue + fatigueChange > INJURY_FATIGUE_THRESHOLD }
}

export type RaceDayError =
  | TrainingError
  | 'unknown-entry'
  /** The entry was already raced: its result and rewards exist. */
  | 'already-finished'
  | 'unknown-race'
  /** Races are run on Sundays only. */
  | 'not-race-day'
  /** Another pending entry is raced first. */
  | 'not-scheduled'

export interface RaceDayResult {
  state: GameState
  entry: FinishedRaceEntry
  levelBefore: number
  levelAfter: number
  attributePointsAwarded: number
  weekCompleted: boolean
}

/**
 * Runs the scheduled race on race Sunday (owner decisions D1–D5; Sundays only), exactly once.
 * The planned session is not executed: the day's outcome is the race. Rewards, Fatigue, a possible
 * injury, the calendar and the entry's result are all applied in one returned state, so the race
 * cannot be applied twice: the entry is no longer pending and the day is no longer current.
 */
export function raceCurrentDay(
  state: GameState,
  ref: DayRef,
  entryId: string,
  now: number,
): { ok: true; value: RaceDayResult } | { ok: false; error: RaceDayError } {
  const dayError = checkDay(state, ref)
  if (dayError) return { ok: false, error: dayError }
  if (state.forcedRestDays > 0) return { ok: false, error: 'forced-rest' }
  const entry = getEntry(state, entryId)
  if (!entry) return { ok: false, error: 'unknown-entry' }
  if (entry.status !== 'pending') return { ok: false, error: 'already-finished' }
  if (state.week.currentDayIndex !== RACE_DAY_INDEX) return { ok: false, error: 'not-race-day' }
  if (getScheduledEntry(state)?.id !== entry.id) return { ok: false, error: 'not-scheduled' }
  const race = getRace(entry.raceId)
  if (!race) return { ok: false, error: 'unknown-race' }

  const { athlete } = state
  const levelAtStart = getLevel(athlete.xp)
  const input = { attributes: { ...athlete.attributes }, fitness: athlete.fitness, fatigue: athlete.fatigue }
  const dayForm = getDayForm(race.id, entry.id, entry.enteredAt, athlete.attributes.consistency)
  const simulation = simulateRace(race, input, dayForm)
  const explanation = explainRace(race, input, dayForm)
  const rewards = getRaceRewards(race, simulation.position, levelAtStart)

  // Injury after a race (D4): the existing rule — no XP, Fitness loss, forced Rest. The result and
  // the prize coins still count.
  const { fatigueChange, injured } = previewRaceDay(state, race)
  const fitnessChange = injured ? clampStat(athlete.fitness - INJURY_FITNESS_LOSS) - athlete.fitness : 0
  const xpAwarded = injured ? 0 : rewards.xp
  const outcome: DayOutcome = {
    xpGained: xpAwarded,
    fitnessChange,
    fatigueChange,
    ...(injured ? { injured: true } : {}),
    raceEntryId: entry.id,
  }

  const result: RaceResult = {
    startedAt: now,
    week: state.week.number,
    day: state.week.currentDayIndex + 1,
    levelAtStart,
    attributes: input.attributes,
    fitness: input.fitness,
    fatigue: input.fatigue,
    dayForm,
    timeS: simulation.timeS,
    position: simulation.position,
    fieldSize: simulation.fieldSize,
    band: rewards.band,
    grossPrize: rewards.grossPrize,
    multiplierPct: rewards.multiplierPct,
    coinsAwarded: rewards.coinsAwarded,
    xpAwarded,
    netCoins: rewards.coinsAwarded - entry.feePaid,
    fatigueChange,
    fitnessChange,
    injured,
    referenceTimeS: explanation.referenceTimeS,
    gapS: explanation.gapS,
    factors: explanation.factors,
    rivalTimesS: rivalTimes(race),
  }
  const finished: FinishedRaceEntry = { ...entry, status: 'finished', result }

  // A race counts as activity: it resets the Fitness decay reference (D3).
  const advanced = completeCurrentDay(state, outcome, true, now)
  const nextState: GameState = {
    ...advanced.state,
    coins: advanced.state.coins + rewards.coinsAwarded,
    raceEntries: advanced.state.raceEntries.map((e) => (e.id === entry.id ? finished : e)),
  }
  const levelAfter = getLevel(nextState.athlete.xp)
  return {
    ok: true,
    value: {
      state: nextState,
      entry: finished,
      levelBefore: levelAtStart,
      levelAfter,
      attributePointsAwarded: (levelAfter - levelAtStart) * ATTRIBUTE_POINTS_PER_LEVEL,
      weekCompleted: advanced.weekCompleted,
    },
  }
}

export interface StandingRow {
  position: number
  /** `you` for the athlete; otherwise the rival's number in the field (1 = fastest rival). */
  runner: 'you' | number
  timeS: number
}

/**
 * The full results: the athlete at their stored position among the rivals. Uses the rival times
 * stored with the result, or the same deterministic formula for results saved before they were stored.
 */
export function getStandings(race: Race, result: RaceResult): StandingRow[] {
  const rivals = result.rivalTimesS ?? rivalTimes(race)
  const rows: StandingRow[] = rivals.map((timeS, i) => ({ position: 0, runner: i + 1, timeS }))
  // Ties go to the athlete, as in the simulation: they are placed before rivals with the same time.
  rows.splice(result.position - 1, 0, { position: 0, runner: 'you', timeS: result.timeS })
  return rows.map((row, i) => ({ ...row, position: i + 1 }))
}
