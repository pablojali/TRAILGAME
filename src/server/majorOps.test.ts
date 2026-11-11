import { describe, expect, it } from 'vitest'
import type { MajorConfig, MajorEventInput, MajorRunnerSnapshot } from '../domain/major/major'
import type { GameState } from '../game-engine/gameState'
import { newGame, withAthlete } from '../test/gameFixtures'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import type { MajorRunnerState } from '../game-engine/majorRace'
import type { RaceStore } from './majorOrchestrator'
import { handleMajorOp, MajorStoreError, type MajorEvent, type MajorRegistration, type MajorStore } from './majorOps'
import { refusalOf } from './majorRest'

const NOW = Date.UTC(2026, 10, 10, 12)
const ADMIN = 'admin-1'
const PLAYER = 'player-1'
const ID = '11111111-1111-4111-8111-111111111111'

function fakeStore() {
  let config: MajorConfig = {
    startTimeUtc: '18:00', registrationOpenDays: 6, readyMinutes: 30, decisionWindowS: 90, runningS: 150, participantLimit: 50,
    bands: [{ name: 'Todos', min: 1, max: null }],
  }
  const events = new Map<string, MajorEvent>()
  const logs: string[] = []
  const regs = new Map<string, MajorRegistration>()
  const registered: { level: number; name: string; country: string | null }[] = []
  const readies: MajorRunnerSnapshot[] = []
  let advanced = 0
  let decided: { stop: AidStop; intensity: Intensity; source: 'PLAYER' | 'AUTO' } | null = null
  const closed = false
  const make = (id: string, input: MajorEventInput): MajorEvent => ({
    id, ...input, status: 'DRAFT', registrationOpenAt: null, readyOpenAt: null, decisionWindowS: null, runningS: null,
    participantLimit: null, bands: null, publishedAt: null, cancelReason: null, bannerPath: null, clips: {}, categories: [],
  })
  const store: MajorStore = {
    isAdmin: async (user) => user === ADMIN,
    getConfig: async () => config,
    setConfig: async (value) => { config = value },
    listEvents: async () => [...events.values()],
    createEvent: async (input) => { const e = make(ID, input); events.set(ID, e); return e },
    updateDraft: async (id, input) => {
      const e = events.get(id)
      if (!e || e.status !== 'DRAFT') return null
      const next = { ...e, ...input }
      events.set(id, next)
      return next
    },
    publish: async (id) => {
      const e = events.get(id)
      if (!e) throw new MajorStoreError('not-found')
      if (e.status !== 'DRAFT') throw new MajorStoreError('not-draft')
      const next = { ...e, status: 'SCHEDULED' as const }
      events.set(id, next)
      return next
    },
    cancel: async (id, _user, reason) => { const next = { ...events.get(id)!, status: 'CANCELLED' as const, cancelReason: reason }; events.set(id, next); return next },
    log: async (_e, _u, kind) => { logs.push(kind) },
    getEvent: async (id) => { const e = events.get(id); if (!e) throw new MajorStoreError('not-found'); return e },
    signUpload: async (path) => `token-for-${path}`,
    setBanner: async (id, path) => { const next = { ...events.get(id)!, bannerPath: path }; events.set(id, next); return next },
    advance: async () => { advanced++ },
    playerMajors: async (userId) =>
      [...events.values()].filter((e) => e.status !== 'DRAFT').map((e) => ({ ...e, entrants: {}, registration: regs.get(`${e.id}:${userId}`) ?? null })),
    register: async (eventId, userId, entry) => {
      registered.push(entry)
      regs.set(`${eventId}:${userId}`, { categoryIdx: 1, level: entry.level, list: 'main', status: 'REGISTERED', registeredAt: '', readyAt: null, plan: null })
    },
    withdraw: async (eventId, userId) => {
      if (!regs.has(`${eventId}:${userId}`)) throw new MajorStoreError('not-registered')
      regs.delete(`${eventId}:${userId}`)
    },
    savePlan: async (eventId, userId, plan) => { regs.set(`${eventId}:${userId}`, { ...regs.get(`${eventId}:${userId}`)!, plan }) },
    setReady: async (eventId, userId, snapshot) => {
      readies.push(snapshot)
      regs.set(`${eventId}:${userId}`, { ...regs.get(`${eventId}:${userId}`)!, status: 'READY', readyAt: 'now' })
    },
    raceView: async (eventId, userId) =>
      userId === PLAYER && eventId === ID
        ? {
            category: { idx: 1, name: 'Banda 1', phase: 'PA', segment: 0, segments: 2, phaseEndsAt: '2026-11-15T18:04:00Z' },
            runners: [
              { slot: 1, kind: 'PLAYER', name: 'Ana', country: 'AR', level: 3, state: raceState(1300, 30) },
              { slot: 2, kind: 'NPC', name: 'Bo', country: 'FR', level: 4, state: raceState(1290, 25) },
            ],
            mySlot: 1,
            myDecision: decided,
          }
        : null,
    decide: async (_e, _u, _segment, stop, intensity) => {
      if (closed) throw new MajorStoreError('window-closed')
      decided = { stop, intensity, source: 'PLAYER' }
    },
    setClip: async (id, segment, path) => {
      const e = events.get(id)!
      const clips = { ...e.clips }
      if (path) clips[String(segment)] = path
      else delete clips[String(segment)]
      const next = { ...e, clips }
      events.set(id, next)
      return next
    },
  }
  return { store, logs, events, registered, readies, advanced: () => advanced }
}

const career = withAthlete({ ...newGame(), consumables: { gel: 2, bar: 0 } }, { xp: 2700, fatigue: 22 })
const noRaces: RaceStore = {
  startableEvents: async () => [],
  grid: async () => [],
  start: async () => false,
  dueCategories: async () => [],
  categoryGrid: async () => [],
  decisions: async () => [],
  commitStep: async () => false,
}

function raceState(arrivalS: number, fatigue: number): MajorRunnerState {
  return {
    progress: { elapsedS: arrivalS, fatigue, splits: [{ intensity: 'target', segmentS: arrivalS, arrivalS, fatigue, position: 1 }] },
    next: 'target',
  }
}

const deps = (store: MajorStore, loaded: GameState | null = career, tickAuthorized = false) => ({
  store,
  race: noRaces,
  tickAuthorized,
  authenticate: async (t: string | null) => t,
  loadCareer: async () => loaded,
  now: () => NOW,
})
const EVENT = { name: ' Major de noviembre ', description: '', raceId: 'RACE-002', scheduledStartAt: '2026-11-15T18:00:00Z' }

describe('major-ops (Sunday Major, phase 1)', () => {
  it('needs a signed-in user, and admin rights for everything but whoami', async () => {
    const { store } = fakeStore()
    expect((await handleMajorOp(null, { action: 'whoami' }, deps(store))).status).toBe(401)
    expect((await handleMajorOp(PLAYER, { action: 'whoami' }, deps(store))).body).toEqual({ ok: true, userId: PLAYER, admin: false })
    expect((await handleMajorOp(PLAYER, { action: 'events-list' }, deps(store))).body).toEqual({ ok: false, error: 'not-admin' })
    expect((await handleMajorOp(PLAYER, { action: 'event-create', event: EVENT }, deps(store))).status).toBe(403)
    expect((await handleMajorOp(ADMIN, { action: 'nope' }, deps(store))).status).toBe(400)
  })

  it('creates, edits, publishes and cancels, refusing invalid input and edits after publishing', async () => {
    const { store, logs } = fakeStore()
    const created = await handleMajorOp(ADMIN, { action: 'event-create', event: EVENT }, deps(store))
    expect(created.body).toMatchObject({ ok: true, event: { name: 'Major de noviembre', scheduledStartAt: '2026-11-15T18:00:00.000Z' } })
    expect((await handleMajorOp(ADMIN, { action: 'event-create', event: { ...EVENT, scheduledStartAt: '2026-11-14T18:00:00Z' } }, deps(store))).body).toEqual({ ok: false, error: 'event-not-sunday' })
    expect((await handleMajorOp(ADMIN, { action: 'event-update', id: ID, event: { ...EVENT, name: 'Otro' } }, deps(store))).body).toMatchObject({ ok: true, event: { name: 'Otro' } })
    expect((await handleMajorOp(ADMIN, { action: 'event-publish', id: ID }, deps(store))).body).toMatchObject({ ok: true, event: { status: 'SCHEDULED' } })
    expect((await handleMajorOp(ADMIN, { action: 'event-update', id: ID, event: EVENT }, deps(store))).body).toEqual({ ok: false, error: 'not-draft' })
    expect((await handleMajorOp(ADMIN, { action: 'event-publish', id: ID }, deps(store))).body).toEqual({ ok: false, error: 'not-draft' })
    expect((await handleMajorOp(ADMIN, { action: 'event-cancel', id: ID, reason: ' ' }, deps(store))).body).toEqual({ ok: false, error: 'cancel-reason' })
    expect((await handleMajorOp(ADMIN, { action: 'event-cancel', id: ID, reason: 'Tormenta' }, deps(store))).body).toMatchObject({ ok: true, event: { status: 'CANCELLED', cancelReason: 'Tormenta' } })
    expect(logs).toEqual(['created', 'edited'])
  })

  it('validates the configuration before saving it', async () => {
    const { store } = fakeStore()
    const config = (await handleMajorOp(ADMIN, { action: 'config-get' }, deps(store))).body.config as MajorConfig
    const bad = { ...config, bands: [{ name: 'A', min: 1, max: 8 }, { name: 'B', min: 10, max: null }] }
    expect((await handleMajorOp(ADMIN, { action: 'config-set', config: bad }, deps(store))).body).toEqual({ ok: false, error: 'config-gap-or-overlap' })
    const good = { ...config, startTimeUtc: '17:30' }
    expect((await handleMajorOp(ADMIN, { action: 'config-set', config: good }, deps(store))).body).toMatchObject({ ok: true, config: { startTimeUtc: '17:30' } })
  })

  it('maps the database refusals', () => {
    expect(refusalOf('major event x is not a draft')?.refusal).toBe('not-draft')
    expect(refusalOf('major event x starts too soon to be published')?.refusal).toBe('too-soon')
    expect(refusalOf('major event x is CANCELLED and cannot change')?.refusal).toBe('final')
    expect(refusalOf('major event x not found')?.refusal).toBe('not-found')
    expect(refusalOf('something else')).toBeNull()
  })

  it('hands signed uploads for the banner and each segment’s clip, and saves only this event’s paths', async () => {
    const { store, events } = fakeStore()
    await handleMajorOp(ADMIN, { action: 'event-create', event: EVENT }, deps(store))
    const banner = await handleMajorOp(ADMIN, { action: 'media-upload', id: ID, kind: 'banner' }, deps(store))
    const bannerPath = `events/${ID}/banner-${NOW}.jpg`
    expect(banner.body).toEqual({ ok: true, uploads: [{ path: bannerPath, token: `token-for-${bannerPath}` }] })
    const clip = await handleMajorOp(ADMIN, { action: 'media-upload', id: ID, kind: 'clip', segment: 2 }, deps(store))
    expect((clip.body.uploads as { path: string }[]).map((u) => u.path)).toEqual([`events/${ID}/segment-2-${NOW}.mp4`, `events/${ID}/segment-2-${NOW}.jpg`])
    // Riverside Trail has 2 segments.
    expect((await handleMajorOp(ADMIN, { action: 'media-upload', id: ID, kind: 'clip', segment: 3 }, deps(store))).body).toEqual({ ok: false, error: 'media-segment' })
    expect((await handleMajorOp(PLAYER, { action: 'media-upload', id: ID, kind: 'banner' }, deps(store))).status).toBe(403)

    expect((await handleMajorOp(ADMIN, { action: 'media-set', id: ID, kind: 'banner', path: bannerPath }, deps(store))).body).toMatchObject({ ok: true, event: { bannerPath } })
    expect((await handleMajorOp(ADMIN, { action: 'media-set', id: ID, kind: 'banner', path: 'events/other/banner-1.jpg' }, deps(store))).body).toEqual({ ok: false, error: 'media-path' })
    expect((await handleMajorOp(ADMIN, { action: 'media-set', id: ID, kind: 'clip', segment: 2, path: `events/${ID}/segment-1-5.mp4` }, deps(store))).body).toEqual({ ok: false, error: 'media-path' })
    expect((await handleMajorOp(ADMIN, { action: 'media-set', id: ID, kind: 'clip', segment: 2, path: `events/${ID}/segment-2-${NOW}.mp4` }, deps(store))).body).toMatchObject({ ok: true, event: { clips: { 2: `events/${ID}/segment-2-${NOW}.mp4` } } })
    expect((await handleMajorOp(ADMIN, { action: 'media-set', id: ID, kind: 'clip', segment: 2, path: null }, deps(store))).body).toMatchObject({ ok: true, event: { clips: {} } })

    // Until the race is run.
    events.set(ID, { ...events.get(ID)!, status: 'RUNNING' })
    expect((await handleMajorOp(ADMIN, { action: 'media-upload', id: ID, kind: 'banner' }, deps(store))).body).toEqual({ ok: false, error: 'media-closed' })
  })

  it('lets players register with their level frozen from the server career, plan and confirm READY', async () => {
    const fake = fakeStore()
    const { store, events } = fake
    await handleMajorOp(ADMIN, { action: 'event-create', event: EVENT }, deps(store))
    events.set(ID, { ...events.get(ID)!, status: 'REGISTRATION_OPEN' })
    // Any signed-in player, no admin rights needed; the clock runs on every call.
    const list = await handleMajorOp(PLAYER, { action: 'majors' }, deps(store))
    expect(list.body).toMatchObject({ ok: true, majors: [{ id: ID, registration: null }] })
    expect(fake.advanced()).toBe(1)
    expect((await handleMajorOp(PLAYER, { action: 'register', id: ID }, deps(store, null))).body).toEqual({ ok: false, error: 'no-career' })
    await handleMajorOp(PLAYER, { action: 'register', id: ID }, deps(store))
    expect(fake.registered).toEqual([{ level: 10, name: career.athlete.name, country: career.athlete.country ?? null }])

    // Riverside Trail: 2 segments, a stop after the first only.
    const plan = { style: 'balanced', gel: true, bar: true, segments: [{ intensity: 'hard', stop: 'quick' }, { intensity: 'hard', stop: null }] }
    expect((await handleMajorOp(PLAYER, { action: 'save-plan', id: ID, plan: { ...plan, segments: plan.segments.slice(0, 1) } }, deps(store))).body).toEqual({ ok: false, error: 'plan-invalid' })
    expect((await handleMajorOp(PLAYER, { action: 'save-plan', id: ID, plan }, deps(store))).body).toMatchObject({ ok: true, majors: [{ registration: { plan } }] })

    await handleMajorOp(PLAYER, { action: 'ready', id: ID }, deps(store))
    // The runner as the server has them; only the gel is in stock.
    expect(fake.readies).toEqual([{ level: 10, attributes: career.athlete.attributes, fitness: career.athlete.fitness, fatigue: 22, equipment: career.equipment, nutrition: { gel: true, bar: false } }])
    expect((await handleMajorOp(PLAYER, { action: 'withdraw', id: ID }, deps(store))).body).toMatchObject({ ok: true })
    expect((await handleMajorOp(PLAYER, { action: 'withdraw', id: ID }, deps(store))).body).toEqual({ ok: false, error: 'not-registered' })
    expect((await handleMajorOp(PLAYER, { action: 'ready', id: ID }, deps(store))).body).toEqual({ ok: false, error: 'not-registered' })
  })

  it('runs the scheduler’s tick only with its secret', async () => {
    const { store } = fakeStore()
    expect((await handleMajorOp(null, { action: 'tick' }, deps(store))).status).toBe(401)
    expect((await handleMajorOp(null, { action: 'tick' }, deps(store, career, true))).body).toEqual({ ok: true, started: 0, steps: 0 })
  })

  it('shows the live race to a runner on the grid: standings with gaps, their energy, and takes their decision', async () => {
    const { store } = fakeStore()
    const state = await handleMajorOp(PLAYER, { action: 'race-state', id: ID }, deps(store))
    expect(state.body).toMatchObject({
      ok: true,
      race: {
        category: { phase: 'PA', segment: 0 },
        standings: [
          { slot: 2, position: 1, gapS: 0, kind: 'NPC', name: 'Bo', me: false },
          { slot: 1, position: 2, gapS: 10, kind: 'PLAYER', name: 'Ana', me: true },
        ],
        me: { slot: 1, energy: 70, next: 'target' },
        myDecision: null,
      },
    })
    expect((await handleMajorOp(ADMIN, { action: 'race-state', id: ID }, deps(store))).body).toEqual({ ok: false, error: 'not-on-grid' })
    expect((await handleMajorOp(PLAYER, { action: 'decide', id: ID, segment: 0, stop: 'nap', intensity: 'hard' }, deps(store))).status).toBe(400)
    expect((await handleMajorOp(PLAYER, { action: 'decide', id: ID, segment: 0, stop: 'quick', intensity: 'hard' }, deps(store))).body).toMatchObject({
      ok: true,
      race: { myDecision: { stop: 'quick', intensity: 'hard', source: 'PLAYER' } },
    })
  })
})
