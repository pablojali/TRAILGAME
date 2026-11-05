import { rankingPoints, rankingSeason } from '../domain/ranking/ranking'
import { applyAchievementRewards, type AchievementEarned } from './achievements'
import { getAttributePointsBetween, getLevel } from '../domain/athlete/levels'
import { canEnterAtLevel, getRewardMultiplier } from '../domain/races/access'
import { GROSS_PRIZES, PRIZE_BANDS, RACE_MIN_XP, RACE_XP_BAND_PCT, RACE_XP_BASE } from '../domain/races/categories'
import { getRace, type Race } from '../domain/races/races'
import { RACE_SIMULATION } from '../domain/races/simulationConfig'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS } from '../domain/training/injury'
import { roundStat } from '../domain/athlete/athlete'
import { isAidStop, isIntensity, RACE_STRATEGY, type AidStop, type Intensity } from '../domain/races/strategyConfig'
import type { ActiveRace, DayOutcome, FinishedRaceEntry, GameState, PendingRaceEntry, RaceEntry, RaceResult } from './gameState'
import {
  getRaceField,
  getReferenceFinishS,
  makeStop,
  runPlan,
  runSegment,
  snapshotRunner,
  type Nutrition,
  type RaceField,
  type RaceProgress,
  type RaceSegment,
  type RaceSplit,
  type StepContext,
} from './raceEngine'
import { getScheduledEntry, RACE_DAY_INDEX } from './raceSchedule'
import { courseEffortKm, explainRace, generateCourse, getDayForm, rivalTimes } from './raceSimulation'
import { checkDay, completeCurrentDay, statChange, type DayRef, type TrainingError } from './training'

export type RaceEntryError =
  | 'unknown-race'
  /** The race already has a pending entry. */
  | 'already-entered'
  /** Another race is already scheduled for the coming Sunday (one race per week). */
  | 'race-scheduled'
  /** The athlete is more than 2 levels below the race's recommended level. */
  | 'level-too-low'

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
 * Enters a race (free; owner decision, 1 November 2026). The athlete's level must be at least the
 * race's minimum (2 below its recommended level). A repeated request is rejected because the race
 * already has a pending entry. Coins never change.
 */
export function enterRace(state: GameState, raceId: string, now: number): RaceEntryResult {
  const race = getRace(raceId)
  if (!race) return { ok: false, error: 'unknown-race' }
  if (getPendingEntry(state, raceId)) return { ok: false, error: 'already-entered' }
  if (getScheduledEntry(state)) return { ok: false, error: 'race-scheduled' }
  const level = getLevel(state.athlete.xp)
  if (!canEnterAtLevel(race, level)) return { ok: false, error: 'level-too-low' }

  const entry: RaceEntry = {
    id: `entry-${state.raceEntries.length + 1}`,
    raceId,
    entryType: 'free',
    feePaid: 0,
    levelAtEntry: level,
    enteredAt: now,
    status: 'pending',
  }
  return { ok: true, entry, state: { ...state, raceEntries: [...state.raceEntries, entry] } }
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
  /** At least RACE_MIN_XP (also when injured). */
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
    xp: Math.max(RACE_MIN_XP, Math.floor((RACE_XP_BASE[race.category] * RACE_XP_BAND_PCT[band]! * multiplierPct) / 10000)),
  }
}

/** Fatigue a race adds before clamping (D3). */
export function getRaceFatigue(race: Race): number {
  return Math.round(
    RACE_SIMULATION.raceFatigueBase + RACE_SIMULATION.raceFatiguePerEffortKm * courseEffortKm(generateCourse(race)),
  )
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
  /** The runner is below the race's minimum level (free entries only; see startRace). */
  | 'level-too-low'

export type RaceStartError =
  | RaceDayError
  /** The race has already started: it continues with race steps. */
  | 'race-in-progress'
  | 'unknown-intensity'
  /** A gel or cereal bar was asked for but none is in stock. */
  | 'no-gel'
  | 'no-bar'

export type RaceStepError =
  | 'no-race-in-progress'
  /** The step is for another segment (a stale or repeated screen). */
  | 'wrong-segment'
  | 'unknown-intensity'
  | 'unknown-stop'

export interface RaceDayResult {
  state: GameState
  entry: FinishedRaceEntry
  levelBefore: number
  levelAfter: number
  attributePointsAwarded: number
  weekCompleted: boolean
  /** Achievement levels reached by this race, with their coins and XP (already added). */
  achievementsEarned: AchievementEarned[]
}

/** What the runner decides before the start. */
export interface RaceStartDecisions {
  /** Intensity of the first segment. */
  intensity: Intensity
  /** Take a gel / a cereal bar (one at most of each; owner decision). */
  gel: boolean
  bar: boolean
}

/** What the runner decides at an aid station. */
export interface RaceStepDecisions {
  /** Index of the segment the step runs (the one after the aid station): guards against stale screens. */
  segment: number
  stop: AidStop
  /** Intensity of that segment. */
  intensity: Intensity
}

export type RaceStepOutcome = { finished: false; state: GameState } | { finished: true; value: RaceDayResult }

function contextOf(active: ActiveRace, race: Race, field: RaceField = getRaceField(race)): StepContext {
  return {
    race,
    field,
    runner: snapshotRunner(active.attributes, active.fitness, active.fatigue, active.equipment),
    dayForm: active.dayForm,
    nutrition: active.nutrition,
  }
}

/**
 * Starts the scheduled race on race Sunday and runs its first segment (Race Engine V1). Same checks
 * as before strategies; the inputs (attributes, Fitness, Fatigue, equipment, day form) are fixed
 * now. The gel and cereal bar taken leave the stock. The race then continues with `stepRace`.
 */
export function startRace(
  state: GameState,
  ref: DayRef,
  entryId: string,
  decisions: RaceStartDecisions,
  now: number,
): { ok: true; state: GameState } | { ok: false; error: RaceStartError } {
  if (state.activeRace) return { ok: false, error: 'race-in-progress' }
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
  // Free entries (since 1 November 2026) were checked at entry and levels never go down, so this
  // only guards the rule on the server's own state. Entries paid under the earlier rules (no
  // minimum level) stay valid.
  if (entry.entryType === 'free' && !canEnterAtLevel(race, getLevel(state.athlete.xp))) {
    return { ok: false, error: 'level-too-low' }
  }
  if (!isIntensity(decisions.intensity)) return { ok: false, error: 'unknown-intensity' }
  if (decisions.gel && state.consumables.gel < 1) return { ok: false, error: 'no-gel' }
  if (decisions.bar && state.consumables.bar < 1) return { ok: false, error: 'no-bar' }

  const { athlete } = state
  const nutrition: Nutrition = { gel: decisions.gel === true, bar: decisions.bar === true }
  const base: ActiveRace = {
    entryId: entry.id,
    raceId: race.id,
    startedAt: now,
    levelAtStart: getLevel(athlete.xp),
    attributes: { ...athlete.attributes },
    fitness: athlete.fitness,
    fatigue: athlete.fatigue,
    equipment: [...state.equipment],
    dayForm: getDayForm(race.id, entry.id, entry.enteredAt, athlete.attributes.consistency),
    nutrition,
    elapsedS: 0,
    inRaceFatigue: athlete.fatigue,
    splits: [],
  }
  const progress = runSegment(contextOf(base, race), toProgress(base), decisions.intensity)
  return {
    ok: true,
    state: {
      ...state,
      consumables: {
        gel: state.consumables.gel - (nutrition.gel ? 1 : 0),
        bar: state.consumables.bar - (nutrition.bar ? 1 : 0),
      },
      activeRace: withProgress(base, progress),
    },
  }
}

function toProgress(active: ActiveRace): RaceProgress {
  return { elapsedS: active.elapsedS, fatigue: active.inRaceFatigue, splits: active.splits }
}

function withProgress(active: ActiveRace, progress: RaceProgress): ActiveRace {
  return { ...active, elapsedS: progress.elapsedS, inRaceFatigue: progress.fatigue, splits: progress.splits }
}

/**
 * Leaves the aid station the runner is at with the chosen stop and runs the next segment. After the
 * last segment the race finishes: result, rewards, Fatigue, a possible injury and the day, once.
 */
export function stepRace(
  state: GameState,
  decisions: RaceStepDecisions,
  now: number,
): { ok: true; value: RaceStepOutcome } | { ok: false; error: RaceStepError } {
  const active = state.activeRace
  if (!active) return { ok: false, error: 'no-race-in-progress' }
  const race = getRace(active.raceId)
  if (!race) return { ok: false, error: 'no-race-in-progress' }
  if (decisions.segment !== active.splits.length) return { ok: false, error: 'wrong-segment' }
  if (!isAidStop(decisions.stop)) return { ok: false, error: 'unknown-stop' }
  if (!isIntensity(decisions.intensity)) return { ok: false, error: 'unknown-intensity' }

  const field = getRaceField(race)
  const ctx = contextOf(active, race, field)
  const progress = runSegment(ctx, makeStop(ctx, toProgress(active), decisions.stop), decisions.intensity)
  const next = withProgress(active, progress)
  if (progress.splits.length < field.segments.length) {
    return { ok: true, value: { finished: false, state: { ...state, activeRace: next } } }
  }
  return { ok: true, value: { finished: true, value: finishRace({ ...state, activeRace: next }, next, race, field, now) } }
}

/** Applies the finish: the existing rewards, Fatigue and injury rules, the result and the day. */
function finishRace(state: GameState, active: ActiveRace, race: Race, field: RaceField, now: number): RaceDayResult {
  const entry = getEntry(state, active.entryId) as PendingRaceEntry
  const last = active.splits[active.splits.length - 1]!
  const timeS = last.arrivalS
  const position = last.position
  const levelAtStart = active.levelAtStart
  const input = { attributes: active.attributes, fitness: active.fitness, fatigue: active.fatigue, equipment: active.equipment }
  // The "Why" explanation compares abilities with the typical runner on the same course (one shot,
  // without strategy); the gap is measured on the real times, aid stations included.
  const explanation = explainRace(race, input, active.dayForm)
  const referenceTimeS = getReferenceFinishS(race, field)
  const rewards = getRaceRewards(race, position, levelAtStart)

  // Fatigue = in-race fatigue at the finish (calibrated so Target pace with Normal stops adds what a
  // race added before). Injury after a race (D4): the existing rule.
  const fatigueChange = statChange(active.fatigue, roundStat(active.inRaceFatigue - active.fatigue))
  const injured = active.fatigue + fatigueChange > INJURY_FATIGUE_THRESHOLD
  const fitnessChange = injured ? statChange(state.athlete.fitness, -INJURY_FITNESS_LOSS) : 0
  // An injury no longer costs the race XP: a finished race always gives at least RACE_MIN_XP
  // (owner decision, 1 November 2026).
  const xpAwarded = injured ? RACE_MIN_XP : rewards.xp
  const outcome: DayOutcome = {
    xpGained: xpAwarded,
    fitnessChange,
    fatigueChange,
    ...(injured ? { injured: true } : {}),
    raceEntryId: entry.id,
  }

  const result: RaceResult = {
    startedAt: active.startedAt,
    week: state.week.number,
    day: state.week.currentDayIndex + 1,
    levelAtStart,
    attributes: active.attributes,
    fitness: active.fitness,
    fatigue: active.fatigue,
    equipment: active.equipment,
    dayForm: active.dayForm,
    timeS,
    position,
    fieldSize: RACE_STRATEGY.fieldSize,
    band: rewards.band,
    grossPrize: rewards.grossPrize,
    multiplierPct: rewards.multiplierPct,
    coinsAwarded: rewards.coinsAwarded,
    xpAwarded,
    netCoins: rewards.coinsAwarded - entry.feePaid,
    fatigueChange,
    fitnessChange,
    injured,
    referenceTimeS,
    gapS: timeS - referenceTimeS,
    // The explanation's effects in race time (the model's seconds × the course factor).
    factors: explanation.factors.map((f) => ({ ...f, effectS: Math.round(f.effectS * field.timeScale) })),
    rivalTimesS: field.rivalFinishS,
    // Rankings (owner request, 5 November 2026): the month the race is finished in, and its points.
    ...rankingFields(race.id, position, rewards.multiplierPct, now),
    splits: active.splits,
    nutrition: active.nutrition,
  }
  const finished: FinishedRaceEntry = { ...entry, status: 'finished', result }

  // A race is an active day: a Rest the next day is a recovery Rest. It also resets decay (D3).
  const advanced = completeCurrentDay({ ...state, activeRace: null }, outcome, true, now)
  const rewarded = applyAchievementRewards({
    ...advanced.state,
    coins: advanced.state.coins + rewards.coinsAwarded,
    raceEntries: advanced.state.raceEntries.map((e) => (e.id === entry.id ? finished : e)),
  })
  const nextState: GameState = rewarded.state
  const levelAfter = getLevel(nextState.athlete.xp)
  return {
    state: nextState,
    achievementsEarned: rewarded.earned,
    entry: finished,
    levelBefore: levelAtStart,
    levelAfter,
    attributePointsAwarded: getAttributePointsBetween(levelAtStart, levelAfter),
    weekCompleted: advanced.weekCompleted,
  }
}

/** The default plan: Target pace everywhere, Normal stops, no gel or bar. */
export const DEFAULT_PLAN = { intensity: 'target', stop: 'normal' } as const satisfies {
  intensity: Intensity
  stop: AidStop
}

/**
 * Runs the scheduled race start to finish with the default plan (Target pace, Normal stops, no
 * nutrition) in one call. Used by tests and simulations; players race step by step.
 */
export function raceCurrentDay(
  state: GameState,
  ref: DayRef,
  entryId: string,
  now: number,
): { ok: true; value: RaceDayResult } | { ok: false; error: RaceStartError } {
  const started = startRace(state, ref, entryId, { intensity: DEFAULT_PLAN.intensity, gel: false, bar: false }, now)
  if (!started.ok) return started
  let current = started.state
  for (;;) {
    const step = stepRace(current, { segment: current.activeRace!.splits.length, ...DEFAULT_PLAN }, now)
    if (!step.ok) throw new Error(step.error)
    if (step.value.finished) return { ok: true, value: step.value.value }
    current = step.value.state
  }
}

/** The aid-station report of the race in progress. */
export interface RaceReport {
  race: Race
  /** Segments run so far; the runner is at the aid station after the last one. */
  segmentsDone: number
  segmentCount: number
  last: RaceSplit
  position: number
  fieldSize: number
  elapsedS: number
  /** Seconds behind the rival just ahead / ahead of the rival just behind; null if none. */
  gapAheadS: number | null
  gapBehindS: number | null
  /** 0–100, 2 decimals. */
  fatigue: number
  /** 100 − in-race fatigue. */
  energy: number
  nutrition: Nutrition
  /** The segment after the aid station. */
  next: RaceSegment
  /** Seconds of each stop in this race. */
  stopS: Record<AidStop, number>
}

export function getRaceReport(state: GameState): RaceReport | null {
  const active = state.activeRace
  const race = active && getRace(active.raceId)
  if (!active || !race) return null
  const field = getRaceField(race)
  const k = active.splits.length - 1
  const last = active.splits[k]!
  const rivals = field.rivalArrivalsS[k] ?? field.rivalFinishS
  const ahead = rivals.filter((t) => t < last.arrivalS)
  const behind = rivals.filter((t) => t >= last.arrivalS)
  const fatigue = roundStat(Math.min(100, Math.max(0, active.inRaceFatigue)))
  return {
    race,
    segmentsDone: active.splits.length,
    segmentCount: field.segments.length,
    last,
    position: last.position,
    fieldSize: RACE_STRATEGY.fieldSize,
    elapsedS: last.arrivalS,
    gapAheadS: ahead.length ? last.arrivalS - Math.max(...ahead) : null,
    gapBehindS: behind.length ? Math.min(...behind) - last.arrivalS : null,
    fatigue,
    energy: roundStat(100 - fatigue),
    nutrition: active.nutrition,
    next: field.segments[active.splits.length]!,
    stopS: field.stopS,
  }
}

/**
 * What racing today would do to Fatigue with the default plan, and whether it would injure the
 * athlete (same rule as training).
 */
export function previewRaceDay(state: GameState, race: Race): { fatigueChange: number; injured: boolean } {
  const { athlete } = state
  const runner = snapshotRunner(athlete.attributes, athlete.fitness, athlete.fatigue, state.equipment)
  const ctx: StepContext = { race, field: getRaceField(race), runner, dayForm: 0, nutrition: { gel: false, bar: false } }
  const planned = runPlan(ctx, DEFAULT_PLAN.intensity, DEFAULT_PLAN.stop)
  const fatigueChange = statChange(athlete.fatigue, roundStat(planned.fatigue - athlete.fatigue))
  return { fatigueChange, injured: athlete.fatigue + fatigueChange > INJURY_FATIGUE_THRESHOLD }
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

/** The ranking season, points and moment (the server's clock) of a result finished at `now` (none before launch). */
function rankingFields(
  raceId: string,
  position: number,
  rewardPct: number,
  now: number,
): { rankingSeason?: number; rankingPoints?: number; rankingAt?: number } {
  const season = rankingSeason(now)
  return season >= 1 ? { rankingSeason: season, rankingPoints: rankingPoints(raceId, position, rewardPct), rankingAt: now } : {}
}
