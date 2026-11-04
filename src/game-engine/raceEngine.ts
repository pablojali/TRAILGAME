import { ATTRIBUTE_IDS, type Attributes } from '../domain/athlete/athlete'
import { getAttributePointsBetween } from '../domain/athlete/levels'
import { roundStat } from '../domain/athlete/athlete'
import type { Race } from '../domain/races/races'
import { EQUIPMENT_ITEMS, type EquipmentItem } from '../domain/equipment/items'
import { RACE_SIMULATION as SIM } from '../domain/races/simulationConfig'
import {
  fatiguePaceWeight,
  RACE_STRATEGY as C,
  racePaces,
  stopSeconds,
  type AidStop,
  type Intensity,
} from '../domain/races/strategyConfig'
import {
  blockMinutes,
  courseEffortKm,
  effortKm,
  generateCourse,
  InvalidCourseError,
  prepareRunner,
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
  /**
   * Seconds of race time per second of the ability model (the race's course factor): the model's
   * times scaled so the field runs at the owner's paces (`RACE_STRATEGY.paces`).
   */
  timeScale: number
  /** Seconds of each stop in this race (shorter in short races). */
  stopS: Record<AidStop, number>
  /** Weight of the in-race fatigue above the plan on the pace (heavier in short races). */
  fatigueWeight: number
  /** Rivals' running times without stops, in finishing order. */
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

/**
 * The field (owner decisions, 2 November 2026): 29 rivals whose finishing times are anchored on
 * typical runners of the race's level: 2 levels above finishes 2nd, the recommended level 15th,
 * 2 levels below 22nd (each with Target pace and Normal stops). The winner and the last finisher
 * run at the owner's paces for the race's effort-km; times in between are interpolated. The model's
 * times are scaled by one factor per race (`timeScale`) that the runner's times use too.
 */
export function getRaceField(race: Race): RaceField {
  const segments = getRaceSegments(race)
  const course = generateCourse(race)
  const effort = courseEffortKm(course)
  const stations = segments.length - 1
  const rivals = C.fieldSize - 1
  const R = race.recommendedLevel
  // The typical runner's time 2 levels either side, at least `minLevelGap` apart from the race's
  // level (owner request: the leading group not so tight that small choices move many places;
  // matters most in the longest races, where Fitness stops growing with the level).
  const rawTime = (levels: number) => typicalModelSeconds(race, segments, Math.max(1, R + levels))
  const atLevel = rawTime(0)
  const modelTime = (levels: number) =>
    levels > 0
      ? Math.min(rawTime(levels), atLevel / (1 + C.minLevelGap))
      : levels < 0
        ? Math.max(rawTime(levels), atLevel * (1 + C.minLevelGap))
        : atLevel

  const stopS = stopSeconds(effort)

  // The course factor: the winner runs at the owner's winner pace and finishes one rank ahead of
  // the anchor two levels above, at the same gap per rank as down to the recommended level (owner
  // request: the winner is not out on their own). The winner's Quick stops count.
  const [top, middle] = C.levelAnchors
  const topModel = modelTime(top.levels)
  const perRank = (modelTime(middle.levels) - topModel) / (middle.rivalIndex - top.rivalIndex)
  const paces = racePaces(effort)
  const winnerRun = effort * paces.winner * 60
  const timeScale = (winnerRun - stations * (stopS.normal - stopS.quick)) / (topModel - top.rivalIndex * perRank)

  // Finishing times (stops included) at the anchor ranks, then interpolated rank by rank.
  const stopOf = (i: number) => stations * stopS[getRivalStop(i, rivals)]
  const anchors: [number, number][] = [
    [0, winnerRun + stopOf(0)],
    ...C.levelAnchors.map((a): [number, number] => [a.rivalIndex, modelTime(a.levels) * timeScale + stations * stopS.normal]),
    [rivals - 1, effort * paces.last * 60 + stopOf(rivals - 1)],
  ]
  for (let j = 1; j < anchors.length; j++) {
    // Always slower down the field.
    anchors[j]![1] = Math.max(anchors[j]![1], anchors[j - 1]![1] + (anchors[j]![0] - anchors[j - 1]![0]))
  }
  const finish: number[] = []
  for (let i = 0; i < rivals; i++) {
    const j = anchors.findIndex(([index]) => index >= i)
    const [i1, t1] = anchors[j]!
    const [i0, t0] = anchors[Math.max(0, j - 1)]!
    finish.push(Math.round(i1 === i0 ? t1 : t0 + ((i - i0) / (i1 - i0)) * (t1 - t0)))
  }

  // Splits: each rival's running time over the segments like the typical runner's.
  const reference = typicalRunner(R)
  const runner = prepareRunner(reference)
  const referenceSegments = segments.map((seg) => segmentBaseSeconds(runner, seg, reference.fatigue, 0))
  const referenceTotal = referenceSegments.reduce((x, y) => x + y, 0)
  const cumulativeShares: number[] = []
  let sum = 0
  for (const seconds of referenceSegments) {
    sum += seconds
    cumulativeShares.push(sum / referenceTotal)
  }
  const stopsS = finish.map((_, i) => stopS[getRivalStop(i, rivals)])
  const rivalBaseS = finish.map((t, i) => t - stations * stopsS[i]!)
  const rivalArrivalsS = segments
    .slice(0, -1)
    .map((_, k) => rivalBaseS.map((t, i) => Math.round(t * cumulativeShares[k]!) + k * stopsS[i]!))
  return {
    segments,
    fatigueScale: getFatigueScale(race, segments),
    timeScale,
    stopS,
    fatigueWeight: fatiguePaceWeight(effort),
    rivalBaseS,
    rivalArrivalsS,
    rivalFinishS: finish,
  }
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
 * in-race fatigue above the plan (Target pace, Normal stops), taken halfway through the segment:
 * pushing makes the segment itself and the later ones slower, holding back makes them faster. It
 * weighs more in short races (`fatigueWeight`), so Hard all the way has a cost there too.
 */
export function runSegment(ctx: StepContext, progress: RaceProgress, intensity: Intensity): RaceProgress {
  const k = progress.splits.length
  const segment = ctx.field.segments[k]!
  const prepared = prepareRunner(ctx.runner)
  const planned = plannedGains(ctx.field.segments, prepared.attributes.recovery, ctx.field.fatigueScale).atStart[k]!
  const plannedHere = C.fatiguePerEffortKm * segment.effortKm * recoveryCurve(prepared.attributes.recovery) * ctx.field.fatigueScale
  const gainHere = segmentFatigue(ctx, segment, intensity)
  const gained = progress.fatigue - ctx.runner.fatigue
  const deviation = gained + gainHere / 2 - (planned + plannedHere / 2)
  const paceFatigue = ctx.runner.fatigue + C.inRaceFatiguePaceWeight * ctx.field.fatigueWeight * deviation
  const seconds =
    segmentBaseSeconds(prepared, segment, paceFatigue, ctx.dayForm) *
    ctx.field.timeScale *
    C.intensity[intensity].pace *
    (ctx.nutrition.gel ? 1 - C.gelTimeSaving : 1)
  const elapsedS = progress.elapsedS + seconds
  const fatigue = progress.fatigue + gainHere
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
  const seconds = ctx.field.stopS[stop]
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

/** The typical runner's finishing time with Normal stops (the field's anchor at the race's level). */
export function getReferenceFinishS(race: Race, field: RaceField = getRaceField(race)): number {
  return (
    Math.round(typicalModelSeconds(race, field.segments, race.recommendedLevel) * field.timeScale) +
    (field.segments.length - 1) * field.stopS.normal
  )
}

/**
 * The typical runner of a level as they race (owner decision, 4 November 2026): they train like a
 * player (each attribute: 16, its share of the level table's attribute points, plus the training
 * gains per level) and wear the best shop gear of that level in each slot. The older
 * `referenceAthlete` stays for results saved before the segment engine.
 */
export function typicalRunner(level: number): RaceRunner {
  const value =
    16 + getAttributePointsBetween(1, level) / ATTRIBUTE_IDS.length + SIM.referenceTrainingGainPerLevel * (level - 1)
  const base: RaceAthleteInput = {
    attributes: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, value])) as Attributes,
    // From 25 + the training bonus at level 1 to Fitness 90 at level 30 (owner decisions, 29 October
    // and 4 November 2026).
    fitness: Math.min(90, 25 + SIM.referenceFitnessBonus + ((65 - SIM.referenceFitnessBonus) * (level - 1)) / 29),
    fatigue: SIM.referenceFatigue,
  }
  const equipment: string[] = []
  if (C.typicalGear) {
    for (const slot of ['shoes', 'pack', 'poles'] as const) {
      let best: EquipmentItem | undefined
      for (const item of EQUIPMENT_ITEMS) {
        if (item.slot !== slot || item.price === null || (item.level ?? 0) > level) continue
        if (!best || (item.level ?? 0) > (best.level ?? 0)) best = item
      }
      if (best) equipment.push(best.id)
    }
  }
  return { ...base, equipment }
}

/**
 * Running seconds (no stop time, before the race's time scale) of the typical runner of `level`:
 * Target pace, Normal stops, the typical gel and bar. The same model the player's own race uses.
 */
function typicalModelSeconds(race: Race, segments: RaceSegment[], level: number): number {
  const model: RaceField = {
    segments,
    fatigueScale: getFatigueScale(race, segments),
    timeScale: 1,
    stopS: { quick: 0, normal: 0, slow: 0 },
    fatigueWeight: fatiguePaceWeight(courseEffortKm(generateCourse(race))),
    rivalBaseS: [],
    rivalArrivalsS: segments.map(() => []),
    rivalFinishS: [],
  }
  const ctx: StepContext = { race, field: model, runner: typicalRunner(level), dayForm: 0, nutrition: C.typicalNutrition }
  return runPlan(ctx, 'target', 'normal').elapsedS
}

export function snapshotRunner(attributes: Attributes, fitness: number, fatigue: number, equipment: readonly string[]): RaceRunner {
  return { attributes: { ...attributes }, fitness, fatigue, equipment: [...equipment] }
}
