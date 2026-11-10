import { getRace } from '../races/races'

/**
 * Sunday Major (owner specification, 10 November 2026; docs/MAJOR_PHASE0_AUDIT.md). Shared rules of
 * the event manager, used by the Edge Function `major-ops` and by Trail Studio. The database
 * enforces the same rules (supabase/migrations/20261111090000_major_events.sql).
 */
export const MAJOR_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'REGISTRATION_OPEN',
  'LOCKED',
  'STARTING',
  'RUNNING',
  'FINISHED',
  'CANCELLED',
] as const
export type MajorStatus = (typeof MAJOR_STATUSES)[number]

/** Forward-only state machine; CANCELLED from any state before FINISHED (same as the database). */
export const MAJOR_TRANSITIONS: Record<MajorStatus, readonly MajorStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['LOCKED', 'CANCELLED'],
  LOCKED: ['STARTING', 'CANCELLED'],
  STARTING: ['RUNNING', 'CANCELLED'],
  RUNNING: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
}

export function canTransition(from: MajorStatus, to: MajorStatus): boolean {
  return MAJOR_TRANSITIONS[from].includes(to)
}

/** A level band: levels `min` to `max` (null: and above). */
export interface MajorBand {
  name: string
  min: number
  max: number | null
}

export type BandsProblem = 'count' | 'name' | 'start' | 'gap-or-overlap' | 'range' | 'last-open' | 'only-last-open'

/** Bands must run from level 1 with no gap or overlap, the last one open-ended; 1–12 of them. */
export function validateBands(bands: readonly MajorBand[]): BandsProblem | null {
  if (bands.length < 1 || bands.length > 12) return 'count'
  let expected = 1
  for (const [i, band] of bands.entries()) {
    const name = band.name.trim()
    if (name.length < 1 || name.length > 40) return 'name'
    if (!Number.isInteger(band.min)) return 'range'
    if (i === 0 && band.min !== 1) return 'start'
    if (band.min !== expected) return 'gap-or-overlap'
    const last = i === bands.length - 1
    if (last && band.max !== null) return 'last-open'
    if (!last) {
      if (band.max === null) return 'only-last-open'
      if (!Number.isInteger(band.max) || band.max < band.min) return 'range'
      expected = band.max + 1
    }
  }
  return null
}

/** The band of a level (bands assumed valid). */
export function bandOfLevel<T extends MajorBand>(bands: readonly T[], level: number): T | undefined {
  return bands.find((band) => level >= band.min && (band.max === null || level <= band.max))
}

export interface MajorConfig {
  /** "HH:MM", UTC. */
  startTimeUtc: string
  registrationOpenDays: number
  readyMinutes: number
  decisionWindowS: number
  runningS: number
  participantLimit: number
  bands: MajorBand[]
}

export type ConfigProblem = BandsProblem | 'start-time' | 'registration-days' | 'ready-minutes' | 'window' | 'running' | 'limit'

export function validateConfig(config: MajorConfig): ConfigProblem | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.startTimeUtc)) return 'start-time'
  if (!inRange(config.registrationOpenDays, 1, 13)) return 'registration-days'
  if (!inRange(config.readyMinutes, 5, 180)) return 'ready-minutes'
  if (!inRange(config.decisionWindowS, 30, 600)) return 'window'
  if (!inRange(config.runningS, 30, 900)) return 'running'
  if (!inRange(config.participantLimit, 2, 50)) return 'limit'
  return validateBands(config.bands)
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

/** What an administrator sets on a draft. */
export interface MajorEventInput {
  name: string
  description: string
  raceId: string
  /** ISO 8601 with time zone (UTC). */
  scheduledStartAt: string
}

export type EventProblem = 'name' | 'description' | 'race' | 'start' | 'not-sunday' | 'past'

/** A draft's fields: a catalog race, a Sunday (UTC) start in the future. */
export function validateEventInput(input: MajorEventInput, now: number): EventProblem | null {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) return 'name'
  if (input.description.length > 500) return 'description'
  if (!getRace(input.raceId)) return 'race'
  const start = Date.parse(input.scheduledStartAt)
  if (!Number.isFinite(start)) return 'start'
  if (new Date(start).getUTCDay() !== 0) return 'not-sunday'
  if (start <= now) return 'past'
  return null
}

/** The next Sunday at `startTimeUtc` (UTC) strictly after `now`, as epoch ms. */
export function nextSundayStart(now: number, startTimeUtc: string): number {
  const [hours, minutes] = startTimeUtc.split(':').map(Number) as [number, number]
  const date = new Date(now)
  const daysAhead = (7 - date.getUTCDay()) % 7
  let start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysAhead, hours, minutes)
  if (start <= now) start += 7 * 86_400_000
  return start
}

/** The intensities and aid-station stops a Major plan may use (the race engine's). */
const PLAN_INTENSITIES = ['recovery', 'easy', 'target', 'hard'] as const
const PLAN_STOPS = ['quick', 'normal', 'slow'] as const
const PLAN_STYLES = ['conservative', 'balanced', 'aggressive'] as const

/**
 * A runner's Major plan (owner specification §4, phase 2): the strategy style, the gel and bar to
 * take, and for each segment its intensity and the stop at the aid station after it (the last
 * segment has none). The server applies it at every aid station where the runner does not decide
 * in time; it is frozen when the race starts.
 */
export interface MajorPlan {
  style: (typeof PLAN_STYLES)[number] | null
  gel: boolean
  bar: boolean
  segments: { intensity: (typeof PLAN_INTENSITIES)[number]; stop: (typeof PLAN_STOPS)[number] | null }[]
}

export function validatePlan(value: unknown, segmentCount: number): MajorPlan | null {
  if (typeof value !== 'object' || value === null) return null
  const plan = value as Record<string, unknown>
  if (plan.style !== null && !PLAN_STYLES.includes(plan.style as never)) return null
  if (typeof plan.gel !== 'boolean' || typeof plan.bar !== 'boolean') return null
  if (!Array.isArray(plan.segments) || plan.segments.length !== segmentCount) return null
  const segments: MajorPlan['segments'] = []
  for (const [i, raw] of plan.segments.entries()) {
    if (typeof raw !== 'object' || raw === null) return null
    const { intensity, stop } = raw as Record<string, unknown>
    if (!PLAN_INTENSITIES.includes(intensity as never)) return null
    const last = i === segmentCount - 1
    if (last ? stop !== null : !PLAN_STOPS.includes(stop as never)) return null
    segments.push({ intensity: intensity as MajorPlan['segments'][number]['intensity'], stop: stop as MajorPlan['segments'][number]['stop'] })
  }
  return { style: plan.style as MajorPlan['style'], gel: plan.gel, bar: plan.bar, segments }
}

/** Target pace and Normal stops: the plan of a runner who never set one. */
export function defaultPlan(segmentCount: number): MajorPlan {
  return {
    style: null,
    gel: false,
    bar: false,
    segments: Array.from({ length: segmentCount }, (_, i) => ({ intensity: 'target', stop: i === segmentCount - 1 ? null : 'normal' })),
  }
}

/** The runner as they confirmed READY: what the race uses (owner decisions 1 and 7). */
export interface MajorRunnerSnapshot {
  level: number
  attributes: Record<string, number>
  fitness: number
  fatigue: number
  equipment: string[]
  /** Taken only when in stock at READY; deducted from the career when the race starts. */
  nutrition: { gel: boolean; bar: boolean }
}
