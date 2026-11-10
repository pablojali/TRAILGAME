import { describe, expect, it } from 'vitest'
import type { MajorConfig, MajorEventInput } from '../domain/major/major'
import { handleMajorOp, MajorStoreError, type MajorEvent, type MajorStore } from './majorOps'
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
  return { store, logs, events }
}

const deps = (store: MajorStore) => ({ store, authenticate: async (t: string | null) => t, now: () => NOW })
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
})
