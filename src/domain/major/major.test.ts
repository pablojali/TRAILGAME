import { describe, expect, it } from 'vitest'
import { bandOfLevel, canTransition, MAJOR_STATUSES, nextSundayStart, validateBands, validateConfig, validateEventInput } from './major'

const BANDS = [
  { name: 'Banda 1', min: 1, max: 8 },
  { name: 'Banda 2', min: 9, max: 16 },
  { name: 'Banda 3', min: 17, max: null },
]

describe('Sunday Major rules (owner specification, 10 November 2026)', () => {
  it('accepts contiguous bands from level 1 with an open last band, and refuses gaps and overlaps', () => {
    expect(validateBands(BANDS)).toBeNull()
    expect(validateBands([{ name: 'Todos', min: 1, max: null }])).toBeNull()
    expect(validateBands([])).toBe('count')
    expect(validateBands([{ name: 'A', min: 2, max: null }])).toBe('start')
    expect(validateBands([{ name: 'A', min: 1, max: 8 }, { name: 'B', min: 8, max: null }])).toBe('gap-or-overlap')
    expect(validateBands([{ name: 'A', min: 1, max: 8 }, { name: 'B', min: 10, max: null }])).toBe('gap-or-overlap')
    expect(validateBands([{ name: 'A', min: 1, max: 8 }])).toBe('last-open')
    expect(validateBands([{ name: 'A', min: 1, max: null }, { name: 'B', min: 2, max: null }])).toBe('only-last-open')
    expect(validateBands([{ name: ' ', min: 1, max: null }])).toBe('name')
    expect(validateBands([{ name: 'A', min: 1, max: 0 }, { name: 'B', min: 1, max: null }])).toBe('range')
  })

  it('finds the band of a level', () => {
    expect(bandOfLevel(BANDS, 1)?.name).toBe('Banda 1')
    expect(bandOfLevel(BANDS, 9)?.name).toBe('Banda 2')
    expect(bandOfLevel(BANDS, 60)?.name).toBe('Banda 3')
  })

  it('moves forward only, cancels before the finish, and stops at FINISHED and CANCELLED', () => {
    expect(canTransition('DRAFT', 'SCHEDULED')).toBe(true)
    expect(canTransition('SCHEDULED', 'DRAFT')).toBe(false)
    expect(canTransition('SCHEDULED', 'RUNNING')).toBe(false)
    for (const status of MAJOR_STATUSES.filter((s) => s !== 'FINISHED' && s !== 'CANCELLED')) {
      expect(canTransition(status, 'CANCELLED')).toBe(true)
    }
    expect(MAJOR_STATUSES.some((s) => canTransition('FINISHED', s) || canTransition('CANCELLED', s))).toBe(false)
  })

  it('checks a draft: name, a catalog race, a future Sunday in UTC', () => {
    const now = Date.UTC(2026, 10, 10, 12) // Tuesday
    const event = { name: 'Major', description: '', raceId: 'RACE-002', scheduledStartAt: '2026-11-15T18:00:00Z' }
    expect(validateEventInput(event, now)).toBeNull()
    expect(validateEventInput({ ...event, name: ' ' }, now)).toBe('name')
    expect(validateEventInput({ ...event, raceId: 'RACE-999' }, now)).toBe('race')
    expect(validateEventInput({ ...event, scheduledStartAt: '2026-11-14T18:00:00Z' }, now)).toBe('not-sunday')
    expect(validateEventInput({ ...event, scheduledStartAt: '2026-11-08T18:00:00Z' }, now)).toBe('past')
    expect(validateEventInput({ ...event, scheduledStartAt: 'soon' }, now)).toBe('start')
  })

  it('checks the configuration', () => {
    const config = { startTimeUtc: '18:00', registrationOpenDays: 6, readyMinutes: 30, decisionWindowS: 90, runningS: 150, participantLimit: 50, bands: BANDS }
    expect(validateConfig(config)).toBeNull()
    expect(validateConfig({ ...config, startTimeUtc: '25:00' })).toBe('start-time')
    expect(validateConfig({ ...config, decisionWindowS: 10 })).toBe('window')
    expect(validateConfig({ ...config, participantLimit: 51 })).toBe('limit')
  })

  it('finds the next Sunday at the start time, in UTC', () => {
    expect(new Date(nextSundayStart(Date.UTC(2026, 10, 10, 12), '18:00')).toISOString()).toBe('2026-11-15T18:00:00.000Z')
    // On Sunday before the time: today; after it: next week.
    expect(new Date(nextSundayStart(Date.UTC(2026, 10, 15, 17), '18:00')).toISOString()).toBe('2026-11-15T18:00:00.000Z')
    expect(new Date(nextSundayStart(Date.UTC(2026, 10, 15, 19), '18:00')).toISOString()).toBe('2026-11-22T18:00:00.000Z')
  })
})

describe('Major plans', () => {
  it('needs an intensity per segment and a stop after every segment but the last', async () => {
    const { validatePlan, defaultPlan } = await import('./major')
    const plan = defaultPlan(3)
    expect(validatePlan(plan, 3)).toEqual(plan)
    expect(validatePlan({ ...plan, style: 'balanced', gel: true }, 3)).toMatchObject({ style: 'balanced', gel: true })
    expect(validatePlan(plan, 4)).toBeNull()
    expect(validatePlan({ ...plan, segments: [...plan.segments.slice(0, 2), { intensity: 'target', stop: 'quick' }] }, 3)).toBeNull()
    expect(validatePlan({ ...plan, segments: [{ intensity: 'sprint', stop: 'normal' }, ...plan.segments.slice(1)] }, 3)).toBeNull()
    expect(validatePlan({ ...plan, style: 'wild' }, 3)).toBeNull()
  })
})
