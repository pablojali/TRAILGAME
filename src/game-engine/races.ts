import { rankingPoints, rankingSeason } from '../domain/ranking/ranking'
import { applyAchievementRewards, type AchievementEarned } from './achievements'
import { getAttributePointsBetween, getLevel } from '../domain/athlete/levels'
import { canEnterAtLevel, getMinimumLevel, getRewardMultiplier } from '../domain/races/access'
import { GROSS_PRIZES, PRIZE_BANDS, RACE_MIN_XP, RACE_XP_BAND_PCT, RACE_XP_BASE } from '../domain/races/categories'
import { courseOf, getRace, withCourse, type Race } from '../domain/races/races'
import { RACE_SIMULATION } from '../domain/races/simulationConfig'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS } from '../domain/training/injury'
import { roundStat } from '../domain/athlete/athlete'
import { isAidStop, isIntensity, RACE_STRATEGY, type AidStop, type Intensity } from '../domain/races/strategyConfig'
import type { ActiveRace, DayOutcome, FinishedRaceEntry, GameState, PendingRaceEntry, RaceEntry, RaceResult } from './gameState'
import {
  getEditionField,
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
import { planRest, runRest, type RaceStyle } from './racePlan'
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
  | 'level-too-high'

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
  if (level < getMinimumLevel(race)) return { ok: false, error: 'level-too-low' }
  if (!canEnterAtLevel(race, level)) return { ok: false, error: 'level-too-high' }

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

/** The race in progress with the course it started on. */
export function raceOfActive(active: ActiveRace): Race | undefined {
  const race = getRace(active.raceId)
  return race && withCourse(race, active.course)
}

/** The rivals of this edition of the race: the runner's entry and start fix their form of the day. */
function fieldOf(active: ActiveRace, race: Race): RaceField {
  return getEditionField(race, `${active.raceId}|${active.entryId}|${active.startedAt}`)
}

function contextOf(active: ActiveRace, race: Race, field: RaceField = fieldOf(active, race)): StepContext {
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
  // only guards the minimum on the server's own state (a runner who levels up during the week
  // still runs the race entered). Entries paid under the earlier rules (no minimum level) stay valid.
  if (entry.entryType === 'free' && getLevel(state.athlete.xp) < getMinimumLevel(race)) {
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
    course: courseOf(race),
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
  const race = raceOfActive(active)
  if (!race) return { ok: false, error: 'no-race-in-progress' }
  if (decisions.segment !== active.splits.length) return { ok: false, error: 'wrong-segment' }
  if (!isAidStop(decisions.stop)) return { ok: false, error: 'unknown-stop' }
  if (!isIntensity(decisions.intensity)) return { ok: false, error: 'unknown-intensity' }

  const field = fieldOf(active, race)
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
    ...rankingFields(race.id, position, now),
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
  const race = active && raceOfActive(active)
  if (!active || !race) return null
  const field = fieldOf(active, race)
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

/** What one choice at the aid station would do (owner request, 9 November 2026: show the consequences). */
export interface StepPreview {
  /** Seconds the stop takes. */
  stopS: number
  /** In-race fatigue the stop takes away. */
  recovered: number
  /** Running seconds of the next segment (unrounded). */
  segmentS: number
  /** In-race fatigue on arrival at the end of the next segment (0–100). */
  fatigueAtArrival: number
}

/**
 * The next segment with a stop and an intensity, computed by the engine on the race in progress (the
 * same rivals, day form and nutrition), without running it. The screen shows it rounded, as an estimate.
 */
export function previewStep(state: GameState, stop: AidStop, intensity: Intensity): StepPreview | null {
  const active = state.activeRace
  const race = active && raceOfActive(active)
  if (!active || !race) return null
  const field = fieldOf(active, race)
  if (active.splits.length >= field.segments.length) return null
  const ctx = contextOf(active, race, field)
  const before = toProgress(active)
  const stopped = makeStop(ctx, before, stop)
  const ran = runSegment(ctx, stopped, intensity)
  return {
    stopS: field.stopS[stop],
    recovered: Math.max(0, before.fatigue - stopped.fatigue),
    segmentS: ran.elapsedS - stopped.elapsedS,
    fatigueAtArrival: Math.min(100, Math.max(0, ran.fatigue)),
  }
}

/** Where the race would end if the rest is run with one plan (owner request, 9 November 2026). */
export interface RaceProjection {
  /** Seconds from now (this stop included) to the finish. */
  remainingS: number
  /** In-race fatigue at the finish (0–100): the Fatigue the runner leaves the race with. */
  fatigueAtFinish: number
  /** Finishing places if the finish time came out a little better or worse (best first). */
  positionRange: [number, number]
}

/** How far either side of the projected finish time the position range looks (the plan may change). */
const PROJECTION_MARGIN = 0.01

/**
 * The rest of the race with this stop and intensity now, then Normal stops and the same intensity
 * to the finish. An estimate: the player decides again at every aid station.
 */
export function projectRace(state: GameState, stop: AidStop, intensity: Intensity): RaceProjection | null {
  const active = state.activeRace
  const race = active && raceOfActive(active)
  if (!active || !race) return null
  const field = fieldOf(active, race)
  if (active.splits.length >= field.segments.length) return null
  const ctx = contextOf(active, race, field)
  const start = toProgress(active)
  let progress = runSegment(ctx, makeStop(ctx, start, stop), intensity)
  while (progress.splits.length < field.segments.length) progress = runSegment(ctx, makeStop(ctx, progress, 'normal'), intensity)
  const finishS = progress.elapsedS
  const place = (time: number) => 1 + field.rivalFinishS.filter((t) => t < time).length
  return {
    remainingS: finishS - start.elapsedS,
    fatigueAtFinish: Math.min(100, Math.max(0, progress.fatigue)),
    positionRange: [place(finishS * (1 - PROJECTION_MARGIN)), place(finishS * (1 + PROJECTION_MARGIN))],
  }
}

/** The race as planned before the start: the base field, no day form, the nutrition chosen. */
function prepContext(state: GameState, race: Race, nutrition: Nutrition): StepContext {
  const { athlete } = state
  return {
    race,
    field: getRaceField(race),
    runner: snapshotRunner(athlete.attributes, athlete.fitness, athlete.fatigue, state.equipment),
    dayForm: 0,
    nutrition,
  }
}

/** Before the start: the intensity of every segment for a style, keeping the player's own choices. */
export function planRaceBeforeStart(
  state: GameState,
  race: Race,
  nutrition: Nutrition,
  style: RaceStyle,
  fixed: readonly (Intensity | null | undefined)[] = [],
): Intensity[] {
  const ctx = prepContext(state, race, nutrition)
  return planRest(ctx, { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }, style, fixed)
}

/** Before the start: the first segment's time and the in-race fatigue it adds, as an estimate. */
export function estimateFirstSegment(
  state: GameState,
  race: Race,
  nutrition: Nutrition,
  intensity: Intensity,
): { segmentS: number; fatigueGain: number } {
  const ctx = prepContext(state, race, nutrition)
  const ran = runSegment(ctx, { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }, intensity)
  return { segmentS: ran.elapsedS, fatigueGain: ran.fatigue - ctx.runner.fatigue }
}

/** Before the start: the in-race fatigue at the finish with these intensities and Normal stops. */
export function fatigueAtFinishBeforeStart(
  state: GameState,
  race: Race,
  nutrition: Nutrition,
  intensities: readonly Intensity[],
): number {
  const ctx = prepContext(state, race, nutrition)
  return runRest(ctx, { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }, intensities).fatigue
}

/** At an aid station: the plan for the segments left (index 0 = the next one) for a style. */
export function planRaceAhead(
  state: GameState,
  style: RaceStyle,
  fixed: readonly (Intensity | null | undefined)[] = [],
): Intensity[] {
  const active = state.activeRace
  const race = active && raceOfActive(active)
  if (!active || !race) return []
  const field = fieldOf(active, race)
  return planRest(contextOf(active, race, field), toProgress(active), style, fixed)
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
  now: number,
): { rankingSeason?: number; rankingPoints?: number; rankingAt?: number } {
  const season = rankingSeason(now)
  // Standard races only for now: Majors and the World Cup are future events.
  return season >= 1 ? { rankingSeason: season, rankingPoints: rankingPoints(raceId, position, 'standard'), rankingAt: now } : {}
}

export interface PlannedSegmentPreview {
  /** Race time and in-race fatigue on leaving the aid station before it (0 and the start's at the first). */
  startS: number
  startFatigue: number
  /** By intensity: the segment's time and the in-race fatigue on arrival. */
  options: Record<Intensity, { segmentS: number; fatigueAtArrival: number }>
  /** The stop after the segment (none after the last), by stop: its seconds and the fatigue after it. */
  stops: Record<AidStop, { stopS: number; fatigueAfter: number }> | null
  /** The whole race with the plan as it is: finishing time and in-race fatigue at the finish. */
  finishS: number
  fatigueAtFinish: number
}

/**
 * Before a race (a Sunday Major's plan, owner request of 12 November 2026): what segment `index`
 * gives at each intensity, and the stop after it, for the runner as they are now (no day form),
 * after running the segments before it as planned. The same engine as the race; estimates.
 */
export function previewPlannedSegment(
  state: GameState,
  race: Race,
  nutrition: Nutrition,
  plan: readonly { intensity: Intensity; stop: AidStop | null }[],
  index: number,
): PlannedSegmentPreview {
  const ctx = prepContext(state, race, nutrition)
  let progress: RaceProgress = { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }
  for (let k = 0; k < index; k++) {
    progress = runSegment(ctx, progress, plan[k]?.intensity ?? 'target')
    progress = makeStop(ctx, progress, plan[k]?.stop ?? 'normal')
  }
  const options = {} as PlannedSegmentPreview['options']
  for (const intensity of ['recovery', 'easy', 'target', 'hard'] as const) {
    const ran = runSegment(ctx, progress, intensity)
    options[intensity] = { segmentS: ran.elapsedS - progress.elapsedS, fatigueAtArrival: Math.min(100, ran.fatigue) }
  }
  const last = index >= ctx.field.segments.length - 1
  let stops: PlannedSegmentPreview['stops'] = null
  if (!last) {
    const arrived = runSegment(ctx, progress, plan[index]?.intensity ?? 'target')
    stops = {} as NonNullable<PlannedSegmentPreview['stops']>
    for (const stop of ['quick', 'normal', 'slow'] as const) {
      const after = makeStop(ctx, arrived, stop)
      stops[stop] = { stopS: after.splits.at(-1)!.stopS ?? 0, fatigueAfter: Math.min(100, after.fatigue) }
    }
  }
  let whole: RaceProgress = { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }
  for (let k = 0; k < ctx.field.segments.length; k++) {
    whole = runSegment(ctx, whole, plan[k]?.intensity ?? 'target')
    if (k < ctx.field.segments.length - 1) whole = makeStop(ctx, whole, plan[k]?.stop ?? 'normal')
  }
  return { startS: progress.elapsedS, startFatigue: progress.fatigue, options, stops, finishS: whole.elapsedS, fatigueAtFinish: Math.min(100, whole.fatigue) }
}
