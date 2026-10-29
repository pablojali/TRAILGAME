import { ATTRIBUTE_IDS, type AttributeId, type Attributes } from '../domain/athlete/athlete'
import type { Race } from '../domain/races/races'
import { getRaceEffect } from '../domain/equipment/items'
import { RACE_SIMULATION as C } from '../domain/races/simulationConfig'

/**
 * Race simulation (M4.2), exactly as approved in docs/RACE_SIMULATION_PROPOSAL.md (revision 2, with
 * D1–D10). Pure and deterministic: the same inputs and day form always give the same result. The
 * reference prototype in docs/race-simulation/prototype.mjs implements the same formulas in the same
 * order; the tests check both give identical results.
 */

export type SegmentType = 'runnable' | 'climb' | 'descent'

/** A course segment in whole metres. A descent loses the gain of the climb before it. */
export interface CourseSegment {
  type: SegmentType
  lengthM: number
  gainM: number
  lossM: number
  /** 0–3; only descents use it. */
  technicality: number
}

/** What the simulation reads from the athlete when the race starts. */
export interface RaceAthleteInput {
  attributes: Attributes
  /** 0–100 */
  fitness: number
  /** 0–100 */
  fatigue: number
  /** Equipped item ids; their race effects apply (owner approval, 29 October 2026). */
  equipment?: readonly string[]
}

export interface RaceSimulationResult {
  /** Finishing time in whole seconds. */
  timeS: number
  /** 1 = winner. */
  position: number
  fieldSize: number
  /** Day form applied, as a fraction (e.g. −0.015 = 1.5 % faster). */
  dayForm: number
}

export class InvalidCourseError extends Error {}

/** Splits an integer total into `parts` integers that differ by at most 1 and sum exactly to it. */
export function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Course for a race: `runnable, (climb, descent, runnable) × n`, with `n = ceil(gain / 600)`.
 * Lengths and gains are whole metres and sum exactly to the catalog values.
 */
export function generateCourse(race: Race): CourseSegment[] {
  const distanceM = Math.round(race.distanceKm * 1000)
  const gainM = race.elevationGainM
  if (!Number.isInteger(gainM) || gainM < 0 || distanceM <= 0) {
    throw new InvalidCourseError(`${race.id}: invalid distance or gain`)
  }
  if (gainM === 0) return [{ type: 'runnable', lengthM: distanceM, gainM: 0, lossM: 0, technicality: 0 }]

  const climbs = Math.ceil(gainM / C.maxGainPerClimbM)
  const climbTotalM = Math.round(C.climbShare[race.category] * distanceM)
  const runnableTotalM = distanceM - 2 * climbTotalM
  const climbLengths = splitEvenly(climbTotalM, climbs)
  const descentLengths = splitEvenly(climbTotalM, climbs)
  const runnableLengths = splitEvenly(runnableTotalM, climbs + 1)
  const gains = splitEvenly(gainM, climbs)

  const segments: CourseSegment[] = []
  for (let i = 0; i < climbs; i++) {
    segments.push({ type: 'runnable', lengthM: runnableLengths[i]!, gainM: 0, lossM: 0, technicality: 0 })
    segments.push({ type: 'climb', lengthM: climbLengths[i]!, gainM: gains[i]!, lossM: 0, technicality: 0 })
    segments.push({
      type: 'descent',
      lengthM: descentLengths[i]!,
      gainM: 0,
      lossM: gains[i]!,
      technicality: race.technicality,
    })
  }
  segments.push({ type: 'runnable', lengthM: runnableLengths[climbs]!, gainM: 0, lossM: 0, technicality: 0 })

  for (const s of segments) {
    if (!(s.lengthM > 0)) throw new InvalidCourseError(`${race.id}: non-positive ${s.type} segment`)
    if ((s.gainM + s.lossM) / s.lengthM > C.maxAverageGradient) {
      throw new InvalidCourseError(`${race.id}: gradient above ${C.maxAverageGradient * 100}%`)
    }
  }
  return segments
}

/** ITRA-style effort: 1 effort-km per km, plus 1 per 100 m of ascent. */
export function effortKm(segment: CourseSegment): number {
  return segment.lengthM / 1000 + segment.gainM / 100
}

export function courseEffortKm(course: readonly CourseSegment[]): number {
  return course.reduce((sum, s) => sum + effortKm(s), 0)
}

const runnableAbility = (a: Attributes) => 0.75 * a.speed + 0.25 * a.endurance
const climbAbility = (a: Attributes) => 0.7 * a.climbing + 0.3 * a.endurance
const technicalDescentAbility = (a: Attributes) => 0.7 * a.technical + 0.3 * a.speed
const durability = (a: Attributes) => 0.6 * a.endurance + 0.4 * a.recovery

function segmentAbility(segment: CourseSegment, a: Attributes): number {
  if (segment.type === 'climb') {
    const w = Math.min(1, segment.gainM / segment.lengthM / C.climbWeightFullGradient)
    return w * climbAbility(a) + (1 - w) * runnableAbility(a)
  }
  if (segment.type === 'descent') {
    const t = segment.technicality / 3
    return t * technicalDescentAbility(a) + (1 - t) * runnableAbility(a)
  }
  return runnableAbility(a)
}

/** Finishing time in seconds, before rounding. `dayForm` is a fraction; 0 means none. */
export function raceSeconds(course: readonly CourseSegment[], athlete: RaceAthleteInput, dayForm = 0): number {
  // Equipment bonuses are added for the race only; the athlete's attributes are not changed.
  const gear = getRaceEffect(athlete.equipment ?? [])
  const a = Object.fromEntries(
    ATTRIBUTE_IDS.map((id) => [id, athlete.attributes[id] + gear.attributes[id]]),
  ) as Attributes
  const fitnessFactor = 1 + (C.fitnessSlope * (50 - athlete.fitness)) / 50
  // D9 (variant V1): Consistency softens the effect of Fatigue.
  const fatigueScale = Math.pow(C.abilityReference / a.consistency, C.abilityExponent)
  const fatigueFactor = 1 + (C.fatigueSlope * athlete.fatigue * fatigueScale) / 100
  const durabilityScore = durability(a)
  let minutes = 0
  let effortBefore = 0
  for (const s of course) {
    const e = effortKm(s)
    const abilityFactor = Math.pow(C.abilityReference / segmentAbility(s, a), C.abilityExponent)
    const technicalFactor =
      s.type === 'descent'
        ? 1 + C.technicalPenaltyPerLevel * gear.technicalPenalty * s.technicality * (1 - a.technical / 100)
        : 1
    const slowdown =
      1 +
      C.slowdownRate * gear.slowdown * (effortBefore / C.slowdownReferenceEffortKm) * (C.abilityReference / durabilityScore)
    const gearFactor = s.type === 'climb' ? gear.climb : s.type === 'descent' ? gear.descent : gear.runnable
    minutes +=
      e *
      C.basePaceMinPerEffortKm *
      abilityFactor *
      technicalFactor *
      slowdown *
      gearFactor *
      fitnessFactor *
      fatigueFactor *
      (1 + dayForm)
    effortBefore += e
  }
  return minutes * 60
}

/** The runner the field is built around ("a typical runner in this field"); finishes about 24th. */
export function referenceAthlete(recommendedLevel: number): RaceAthleteInput {
  const value = 16 + (recommendedLevel - 1) / 3
  return {
    attributes: Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, value])) as Attributes,
    // Reaches Fitness 90 at level 30 (owner decision, 29 October 2026, for levels up to 50).
    fitness: Math.min(90, 25 + (65 * (recommendedLevel - 1)) / 29),
    fatigue: C.referenceFatigue,
  }
}

/** Rival finishing times in whole seconds, fastest first. */
export function rivalTimes(race: Race, course: readonly CourseSegment[] = generateCourse(race)): number[] {
  const reference = raceSeconds(course, referenceAthlete(race.recommendedLevel))
  const n = C.fieldSize - 1
  return Array.from({ length: n }, (_, i) =>
    Math.round(reference * (C.rivalFastest + C.rivalSpread * Math.pow((i + 0.5) / n, C.rivalExponent))),
  )
}

/** Runs the race. Position = 1 + rivals strictly faster; a tie goes to the athlete. */
export function simulateRace(race: Race, athlete: RaceAthleteInput, dayForm = 0): RaceSimulationResult {
  const course = generateCourse(race)
  const timeS = Math.round(raceSeconds(course, athlete, dayForm))
  const position = 1 + rivalTimes(race, course).filter((t) => t < timeS).length
  return { timeS, position, fieldSize: C.fieldSize, dayForm }
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** One value in [0, 1) from the mulberry32 generator. */
export function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Day form (D1): within ±4 % × (1 − Consistency / 100), fixed for an entry. Save it with the
 * result; a reload never draws it again.
 */
export function getDayForm(raceId: string, entryId: string, enteredAt: number, consistency: number): number {
  const u = mulberry32(fnv1a(`${raceId}|${entryId}|${enteredAt}`))
  return (2 * u - 1) * C.dayFormMax * (1 - consistency / 100)
}

export type ExplanationFactorId = 'fitness' | 'fatigue' | AttributeId | 'day-form' | 'equipment'

export interface ExplanationFactor {
  id: ExplanationFactorId
  /** The athlete's value (day form: the fraction applied). */
  value: number
  /** The typical runner's value (day form: 0). */
  reference: number
  /** Effect measured on its own, in whole seconds: negative = it made the athlete faster. */
  effectS: number
}

export interface RaceExplanation {
  /** Finishing time of the typical runner in this field, in whole seconds. */
  referenceTimeS: number
  /** Athlete time minus typical time, in whole seconds: negative = faster. */
  gapS: number
  /** The largest single effects (at most 3, each at least 0.5 % of the time), largest first. */
  factors: ExplanationFactor[]
}

/**
 * Explains a result (D10). Each input is measured on its own: the race is run again with only that
 * input set to the typical runner's value. Effects interact (the model multiplies), so they are
 * never added up; the total gap is reported separately. Inputs with no effect are never listed.
 */
export function explainRace(race: Race, athlete: RaceAthleteInput, dayForm = 0): RaceExplanation {
  const course = generateCourse(race)
  const reference = referenceAthlete(race.recommendedLevel)
  const actual = raceSeconds(course, athlete, dayForm)
  const referenceTime = raceSeconds(course, reference)

  const candidates: ExplanationFactor[] = []
  for (const id of ['fitness', 'fatigue'] as const) {
    const swapped = raceSeconds(course, { ...athlete, [id]: reference[id] }, dayForm)
    candidates.push({ id, value: athlete[id], reference: reference[id], effectS: Math.round(actual - swapped) })
  }
  for (const id of ATTRIBUTE_IDS) {
    const swapped = raceSeconds(
      course,
      { ...athlete, attributes: { ...athlete.attributes, [id]: reference.attributes[id] } },
      dayForm,
    )
    candidates.push({
      id,
      value: athlete.attributes[id],
      reference: reference.attributes[id],
      effectS: Math.round(actual - swapped),
    })
  }
  if (athlete.equipment?.length) {
    // The typical runner has no equipment: measured as the time without it.
    candidates.push({
      id: 'equipment',
      value: athlete.equipment.length,
      reference: 0,
      effectS: Math.round(actual - raceSeconds(course, { ...athlete, equipment: [] }, dayForm)),
    })
  }
  if (dayForm !== 0) {
    candidates.push({
      id: 'day-form',
      value: dayForm,
      reference: 0,
      effectS: Math.round(actual - raceSeconds(course, athlete)),
    })
  }

  const minimum = actual * C.explanationMinShare
  const factors = candidates
    .filter((f) => Math.abs(f.effectS) >= minimum && f.effectS !== 0)
    .sort((x, y) => Math.abs(y.effectS) - Math.abs(x.effectS))
    .slice(0, C.explanationCount)

  return {
    referenceTimeS: Math.round(referenceTime),
    gapS: Math.round(actual) - Math.round(referenceTime),
    factors,
  }
}
