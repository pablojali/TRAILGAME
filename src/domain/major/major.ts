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
