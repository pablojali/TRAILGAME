import type { Attributes } from '../domain/athlete/athlete'
import { roundStat } from '../domain/athlete/athlete'
import type { Race } from '../domain/races/races'
import { RACE_SIMULATION as SIM } from '../domain/races/simulationConfig'
import { RACE_STRATEGY as C, type AidStop, type Intensity } from '../domain/races/strategyConfig'
import {
  blockMinutes,
  courseEffortKm,
  effortKm,
  generateCourse,
  InvalidCourseError,
  prepareRunner,
  raceSeconds,
  referenceAthlete,
  rivalTimes,
  splitEvenly,
  type CourseSegment,
  type RaceAthleteInput,
} from './raceSimulation'

/**
 * Race Engine & Strategy V1 (owner approval, 1 November 2026; docs/RACE_ENGINE_V1_PROPOSAL.md).
 * Pure and deterministic. A race is cut into segments with an aid station between two segments.
 * The runner picks an intensity per segment and a stop at each aid station; the time model is the
 * existing one (`blockMinutes`), with an in-race fatigue that rises per segment and falls at stops.
 * NPC rivals keep their existing finishing times, split over the segments like the typical runner,
 * plus a stop at each aid station by rank.
 */

/** A piece of a course block inside one segment, with the effort-km before its block started. */
export interface CoursePiece {
  block: CourseSegment
  effortBefore: number
}

export interface RaceSegment {
  /** 0-based. */
  index: number
  /** Metres from the start (whole metres). */
  startM: number
  distanceM: number
  gainM: number
  lossM: number
  effortKm: number
  /** Shares of the segment's distance, summing to 1. */
  terrain: { runnable: number; climb: number; descent: number }
  /** The race's technicality if the segment has a descent, else 0. */
  technicality: number
  pieces: CoursePiece[]
}

/** Number of segments of a race: clamp(round(km / 6), 2, 8). */
export function getSegmentCount(race: Race): number {
  return Math.min(C.maxSegments, Math.max(C.minSegments, Math.round(race.distanceKm / C.kmPerSegment)))
}

/**
 * The race's segments: the generated course cut at equal distances. A block cut in two keeps its
 * gradient and the effort-km before it, so the pieces take exactly the block's time.
 */
export function getRaceSegments(race: Race): RaceSegment[] {
  const course = generateCourse(race)
  const totalM = course.reduce((sum, block) => sum + block.lengthM, 0)
  const lengths = splitEvenly(totalM, getSegmentCount(race))
  const bounds = [0]
  for (const length of lengths) bounds.push(bounds[bounds.length - 1]! + length)

  const pieces: CoursePiece[][] = lengths.map(() => [])
  let blockStart = 0
  let effortBefore = 0
  for (const block of course) {
    const blockEnd = blockStart + block.lengthM
    for (let k = 0; k < lengths.length; k++) {
      const from = Math.max(blockStart, bounds[k]!)
      const to = Math.min(blockEnd, bounds[k + 1]!)
      if (to <= from) continue
      const share = (to - from) / block.lengthM
      pieces[k]!.push({
        block:
          share === 1
            ? block
            : { ...block, lengthM: to - from, gainM: block.gainM * share, lossM: block.lossM * share },
        effortBefore,
      })
    }
    blockStart = blockEnd
    effortBefore += effortKm(block)
  }

  const segments = pieces.map((list, index): RaceSegment => {
    const distanceM = lengths[index]!
    const sumOf = (pick: (b: CourseSegment) => number) => list.reduce((sum, p) => sum + pick(p.block), 0)
    const ofType = (type: CourseSegment['type']) => sumOf((b) => (b.type === type ? b.lengthM : 0)) / distanceM
    const hasDescent = list.some((p) => p.block.type === 'descent')
    return {
      index,
      startM: bounds[index]!,
      distanceM,
      gainM: sumOf((b) => b.gainM),
      lossM: sumOf((b) => b.lossM),
      effortKm: sumOf((b) => effortKm(b)),
      terrain: { runnable: ofType('runnable'), climb: ofType('climb'), descent: ofType('descent') },
      technicality: hasDescent ? race.technicality : 0,
      pieces: list,
    }
  })

  // The segments must add up to the race: no empty segment, same distance, gain and effort.
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6
  if (
    segments.some((s) => s.pieces.length === 0 || !(s.distanceM > 0)) ||
    !near(
      segments.reduce((sum, s) => sum + s.distanceM, 0),
      totalM,
    ) ||
    !near(
      segments.reduce((sum, s) => sum + s.gainM, 0),
      race.elevationGainM,
    ) ||
    !near(
      segments.reduce((sum, s) => sum + s.effortKm, 0),
      courseEffortKm(course),
    )
  ) {
    throw new InvalidCourseError(`${race.id}: segments do not add up to the course`)
  }
  return segments
}

/** Seconds for a segment with a given Fatigue in the time model (before pace and nutrition). */
function segmentBaseSeconds(
  runner: ReturnType<typeof prepareRunner>,
  segment: RaceSegment,
  fatigue: number,
  dayForm: number,
): number {
  return segment.pieces.reduce((sum, p) => sum + blockMinutes(runner, p.block, p.effortBefore, fatigue, dayForm), 0) * 60
}

/** (20 / Recovery)^0.35: a higher Recovery gains less fatigue; the inverse scales stop recovery. */
function recoveryCurve(recovery: number): number {
  return Math.pow(SIM.abilityReference / recovery, SIM.abilityExponent)
}

/** In-race fatigue recovered by a stop, from the fatigue gained so far. */
function stopRecovery(stop: AidStop, gainedSoFar: number, recovery: number): number {
  if (gainedSoFar <= 0) return 0
  return Math.min(C.maxStopRecovery, C.stop[stop].recovery / recoveryCurve(recovery)) * gainedSoFar
}

/** Fatigue gained over the race with a fixed plan, before the calibration scale. */
function plannedGains(
  segments: readonly RaceSegment[],
  recovery: number,
  scale: number,
): { atStart: number[]; final: number } {
  const atStart: number[] = []
  let gained = 0
  segments.forEach((segment, k) => {
    atStart.push(gained)
    gained += C.fatiguePerEffortKm * segment.effortKm * recoveryCurve(recovery) * scale
    if (k < segments.length - 1) gained -= stopRecovery('normal', gained, recovery)
  })
  return { atStart, final: gained }
}

/**
 * Calibration (owner approval): for Recovery 20, Target pace with Normal stops gains exactly the
 * Fatigue a race added before strategies, round(6 + 0.6 × effort-km).
 */
export function getFatigueScale(race: Race, segments: readonly RaceSegment[] = getRaceSegments(race)): number {
  const before = Math.round(SIM.raceFatigueBase + SIM.raceFatiguePerEffortKm * courseEffortKm(generateCourse(race)))
  return before / plannedGains(segments, SIM.abilityReference, 1).final
}

/** The race as the field sees it: segments, the rivals' times at each aid station and at the finish. */
export interface RaceField {
  segments: RaceSegment[]
  fatigueScale: number
  /** Rivals' finishing times without stops, fastest first (the existing model). */
  rivalBaseS: number[]
  /** Arrival time of every rival at each aid station (index k: after segment k), whole seconds. */
  rivalArrivalsS: number[][]
  /** Rivals' finishing times with their stops, fastest first. */
  rivalFinishS: number[]
}

/** The stop a rival makes at every aid station: front third Quick, middle Normal, back third Slow. */
export function getRivalStop(rivalIndex: number, rivals: number): AidStop {
  return C.rivalStops[Math.min(2, Math.floor((rivalIndex * 3) / rivals))]!
}

export function getRaceField(race: Race): RaceField {
  const segments = getRaceSegments(race)
  const reference = referenceAthlete(race.recommendedLevel)
  const runner = prepareRunner(reference)
  const referenceSegments = segments.map((s) => segmentBaseSeconds(runner, s, reference.fatigue, 0))
  const referenceTotal = referenceSegments.reduce((a, b) => a + b, 0)
  const cumulativeShares: number[] = []
  let sum = 0
  for (const seconds of referenceSegments) {
    sum += seconds
    cumulativeShares.push(sum / referenceTotal)
  }
  const rivalBaseS = rivalTimes(race)
  const stopsS = rivalBaseS.map((_, i) => C.stop[getRivalStop(i, rivalBaseS.length)].seconds)
  const rivalArrivalsS = segments
    .slice(0, -1)
    .map((_, k) => rivalBaseS.map((t, i) => Math.round(t * cumulativeShares[k]!) + k * stopsS[i]!))
  const rivalFinishS = rivalBaseS.map((t, i) => t + (segments.length - 1) * stopsS[i]!)
  return { segments, fatigueScale: getFatigueScale(race, segments), rivalBaseS, rivalArrivalsS, rivalFinishS }
}

/** Position among rivals: 1 + rivals strictly faster (a tie goes to the athlete). */
export function positionAmong(timeS: number, rivals: readonly number[]): number {
  return 1 + rivals.filter((t) => t < timeS).length
}

/** The runner as the race uses them (snapshotted when the race starts). */
export interface RaceRunner extends RaceAthleteInput {
  equipment: string[]
}

export interface Nutrition {
  gel: boolean
  bar: boolean
}

/** One segment as run, and the stop made at the aid station after it (none after the last). */
export interface RaceSplit {
  intensity: Intensity
  /** Whole seconds. */
  segmentS: number
  /** Race time on arrival at the end of the segment, whole seconds. */
  arrivalS: number
  /** In-race fatigue on arrival (0–100, 2 decimals). */
  fatigue: number
  position: number
  stop?: AidStop
  stopS?: number
  /** In-race fatigue after the stop. */
  fatigueAfterStop?: number
}

/** The exact running state (no rounding) carried between segments. */
export interface RaceProgress {
  /** Seconds, unrounded. */
  elapsedS: number
  /** In-race fatigue, unrounded; starts at the runner's Fatigue. */
  fatigue: number
  splits: RaceSplit[]
}

export interface StepContext {
  race: Race
  field: RaceField
  runner: RaceRunner
  dayForm: number
  nutrition: Nutrition
}

/** In-race fatigue gained over a segment. */
function segmentFatigue(ctx: StepContext, segment: RaceSegment, intensity: Intensity): number {
  const recovery = prepareRunner(ctx.runner).attributes.recovery
  return (
    C.fatiguePerEffortKm *
    segment.effortKm *
    C.intensity[intensity].fatigue *
    recoveryCurve(recovery) *
    ctx.field.fatigueScale *
    (ctx.nutrition.bar ? 1 - C.barFatigueSaving : 1)
  )
}

/**
 * Runs segment `progress.splits.length` at `intensity`. The pace uses the runner's Fatigue plus the
 * in-race fatigue above the plan (Target pace, Normal stops): pushing early makes later segments
 * slower, holding back makes them faster.
 */
export function runSegment(ctx: StepContext, progress: RaceProgress, intensity: Intensity): RaceProgress {
  const k = progress.splits.length
  const segment = ctx.field.segments[k]!
  const prepared = prepareRunner(ctx.runner)
  const planned = plannedGains(ctx.field.segments, prepared.attributes.recovery, ctx.field.fatigueScale).atStart[k]!
  const gained = progress.fatigue - ctx.runner.fatigue
  const paceFatigue = ctx.runner.fatigue + C.inRaceFatiguePaceWeight * (gained - planned)
  const seconds =
    segmentBaseSeconds(prepared, segment, paceFatigue, ctx.dayForm) *
    C.intensity[intensity].pace *
    (ctx.nutrition.gel ? 1 - C.gelTimeSaving : 1)
  const elapsedS = progress.elapsedS + seconds
  const fatigue = progress.fatigue + segmentFatigue(ctx, segment, intensity)
  const last = k === ctx.field.segments.length - 1
  const arrivalS = Math.round(elapsedS)
  const rivals = last ? ctx.field.rivalFinishS : ctx.field.rivalArrivalsS[k]!
  const previousArrival = k === 0 ? 0 : progress.splits[k - 1]!.arrivalS + (progress.splits[k - 1]!.stopS ?? 0)
  const split: RaceSplit = {
    intensity,
    segmentS: arrivalS - previousArrival,
    arrivalS,
    fatigue: roundStat(Math.min(100, fatigue)),
    position: positionAmong(arrivalS, rivals),
  }
  return { elapsedS, fatigue, splits: [...progress.splits, split] }
}

/** The stop at the aid station after the last segment run. */
export function makeStop(ctx: StepContext, progress: RaceProgress, stop: AidStop): RaceProgress {
  const k = progress.splits.length - 1
  const recovery = prepareRunner(ctx.runner).attributes.recovery
  const fatigue = progress.fatigue - stopRecovery(stop, progress.fatigue - ctx.runner.fatigue, recovery)
  const seconds = C.stop[stop].seconds
  const split: RaceSplit = { ...progress.splits[k]!, stop, stopS: seconds, fatigueAfterStop: roundStat(Math.min(100, fatigue)) }
  return { elapsedS: progress.elapsedS + seconds, fatigue, splits: [...progress.splits.slice(0, k), split] }
}

/** Runs a whole race with one plan (used for previews, calibration and tests). */
export function runPlan(
  ctx: StepContext,
  intensities: readonly Intensity[] | Intensity,
  stops: readonly AidStop[] | AidStop,
): RaceProgress {
  let progress: RaceProgress = { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }
  const n = ctx.field.segments.length
  for (let k = 0; k < n; k++) {
    progress = runSegment(ctx, progress, typeof intensities === 'string' ? intensities : intensities[k]!)
    if (k < n - 1) progress = makeStop(ctx, progress, typeof stops === 'string' ? stops : stops[k]!)
  }
  return progress
}

/** The typical runner's finishing time with Normal stops (what the rivals around 24th do). */
export function getReferenceFinishS(race: Race, field: RaceField = getRaceField(race)): number {
  return (
    Math.round(raceSeconds(generateCourse(race), referenceAthlete(race.recommendedLevel))) +
    (field.segments.length - 1) * C.stop.normal.seconds
  )
}

export function snapshotRunner(attributes: Attributes, fitness: number, fatigue: number, equipment: readonly string[]): RaceRunner {
  return { attributes: { ...attributes }, fitness, fatigue, equipment: [...equipment] }
}
