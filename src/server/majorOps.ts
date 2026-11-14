import {
  validateConfig,
  validateEventInput,
  type MajorBand,
  type MajorConfig,
  type MajorEventInput,
  type MajorPlan,
  type MajorRunnerSnapshot,
  type MajorStatus,
  validatePlan,
} from '../domain/major/major'
import { getLevel } from '../domain/athlete/levels'
import { getRace } from '../domain/races/races'
import type { GameState } from '../game-engine/gameState'
import { automaticDecision, majorStandings, type MajorRunnerState } from '../game-engine/majorRace'
import { majorPrize } from '../game-engine/majorRewards'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import { advanceMajorRaces, type RaceStore } from './majorOrchestrator'

const STOPS: readonly AidStop[] = ['quick', 'normal', 'slow']
const INTENSITIES: readonly Intensity[] = ['recovery', 'easy', 'target', 'hard']
import { getRaceSegments } from '../game-engine/raceEngine'

/**
 * The Edge Function `major-ops` (Sunday Major, phase 1: the event manager). Administrators create,
 * edit, publish and cancel Majors and set the global configuration. Every request carries the
 * user's access token; the server checks that the user is in `major_admins` before anything else.
 * The admin rights live in the database only: nothing secret reaches a browser. Storage and
 * authentication are injected (src/server/majorRest.ts).
 */

export interface MajorCategory {
  idx: number
  name: string
  minLevel: number
  maxLevel: number | null
}

export interface MajorEvent {
  id: string
  name: string
  description: string
  raceId: string
  scheduledStartAt: string
  status: MajorStatus
  registrationOpenAt: string | null
  readyOpenAt: string | null
  decisionWindowS: number | null
  runningS: number | null
  participantLimit: number | null
  bands: MajorBand[] | null
  publishedAt: string | null
  cancelReason: string | null
  /** In the Storage bucket `major-media`; null: none. */
  bannerPath: string | null
  /** Clip per segment number ("1", "2", …); missing: the course race's own clip. */
  clips: Record<string, string>
  categories: MajorCategory[]
}

/** Database refusals the administrator can act on. */
export type MajorStoreRefusal =
  | 'not-found'
  | 'window-closed'
  | 'not-on-grid'
  | 'not-draft'
  | 'too-soon'
  | 'final'
  | 'closed'
  | 'ready-closed'
  | 'already-registered'
  | 'not-registered'
  | 'no-category'

export class MajorStoreError extends Error {
  readonly refusal: MajorStoreRefusal
  constructor(refusal: MajorStoreRefusal) {
    super(refusal)
    this.refusal = refusal
  }
}

/** A player's registration to a Major (phase 2). */
export interface MajorRegistration {
  categoryIdx: number
  /** Frozen at registration (owner decision 3). */
  level: number
  list: 'main' | 'waitlist'
  status: 'REGISTERED' | 'READY' | 'WITHDRAWN' | 'RACING' | 'ABSENT'
  registeredAt: string
  readyAt: string | null
  plan: MajorPlan | null
}

/** A published Major as a player sees it: their registration and how many are entered per category. */
export interface PlayerMajor extends MajorEvent {
  registration: MajorRegistration | null
  /** By category index: entries on the main list and on the waiting list. */
  entrants: Record<number, { main: number; waitlist: number }>
}

export interface MajorStore {
  isAdmin(userId: string): Promise<boolean>
  getConfig(): Promise<MajorConfig>
  setConfig(config: MajorConfig, userId: string): Promise<void>
  listEvents(): Promise<MajorEvent[]>
  createEvent(input: MajorEventInput, userId: string): Promise<MajorEvent>
  /** Only while DRAFT; null when the event is not a draft (or does not exist). */
  updateDraft(id: string, input: MajorEventInput): Promise<MajorEvent | null>
  publish(id: string, userId: string, now: number): Promise<MajorEvent>
  cancel(id: string, userId: string, reason: string): Promise<MajorEvent>
  log(eventId: string | null, userId: string, kind: string, detail: Record<string, unknown>): Promise<void>
  getEvent(id: string): Promise<MajorEvent>
  /** A one-time signed upload to `path` in the media bucket: the token for the upload. */
  signUpload(path: string): Promise<string>
  setBanner(id: string, path: string | null): Promise<MajorEvent>
  setClip(id: string, segment: number, path: string | null): Promise<MajorEvent>
  /** Runs the clock (opens registration, locks grids at the start): idempotent. */
  advance(now: number): Promise<void>
  playerMajors(userId: string, now: number): Promise<PlayerMajor[]>
  register(eventId: string, userId: string, entry: { level: number; name: string; country: string | null }, now: number): Promise<void>
  withdraw(eventId: string, userId: string, now: number): Promise<void>
  savePlan(eventId: string, userId: string, plan: MajorPlan, now: number): Promise<void>
  setReady(eventId: string, userId: string, snapshot: MajorRunnerSnapshot, now: number): Promise<void>
  /** The player's category in the live race; null if they are not on the grid. */
  raceView(eventId: string, userId: string): Promise<RaceView | null>
  /** The player's decision at the open aid station (refused once the window closes). */
  decide(eventId: string, userId: string, segment: number, stop: AidStop, intensity: Intensity): Promise<void>
  /** The post-race report for admins (phase 5): each category's runners with their result. */
  report(eventId: string): Promise<MajorReport>
  /** Every runner for admins (owner request, 14 November 2026): the players' careers and the NPCs. */
  runners(): Promise<RunnerRow[]>
}

/**
 * A runner in Trail Studio's Corredores tab: a player's career or a ranking NPC. Admins only;
 * no account detail (email, user id) leaves the server.
 */
export interface RunnerRow {
  kind: 'PLAYER' | 'NPC'
  name: string
  sex: 'male' | 'female' | null
  country: string | null
  level: number
  xp: number
  /** Players: coins and finished races; NPCs: null. */
  coins: number | null
  racesFinished: number | null
  /** Players: career creation and last save (ISO); NPCs: null. */
  createdAt: string | null
  lastActiveAt: string | null
  /** NPCs: strength (5–95) and races per week; players: null. */
  strength: number | null
  racesPerWeek: number | null
}

const numberOr = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

/** A player's row from their stored career (the game's save snapshot); tolerant of old saves. */
export function careerRunnerRow(state: unknown, createdAt: string, updatedAt: string): RunnerRow {
  const game = isRecord(state) ? state : {}
  const athlete = isRecord(game.athlete) ? game.athlete : {}
  const xp = Math.max(0, Math.floor(numberOr(athlete.xp, 0)))
  const entries = Array.isArray(game.raceEntries) ? game.raceEntries : []
  return {
    kind: 'PLAYER',
    name: typeof athlete.name === 'string' && athlete.name.trim() ? athlete.name.trim() : '—',
    sex: athlete.sex === 'male' || athlete.sex === 'female' ? athlete.sex : null,
    country: typeof athlete.country === 'string' && /^[A-Z]{2}$/.test(athlete.country) ? athlete.country : null,
    level: getLevel(xp),
    xp,
    coins: Math.floor(numberOr(game.coins, 0)),
    racesFinished: entries.filter((e) => isRecord(e) && e.status === 'finished').length,
    createdAt,
    lastActiveAt: updatedAt,
    strength: null,
    racesPerWeek: null,
  }
}

/** A runner in the admin's post-race report: who was an NPC is shown here only. */
export interface MajorReportRow {
  slot: number
  kind: 'PLAYER' | 'NPC'
  name: string
  country: string | null
  level: number
  position: number | null
  timeS: number | null
  /** Players: whether their result is already in their career. */
  claimed: boolean | null
}

export interface MajorReport {
  categories: { idx: number; name: string; phase: string; players: number; npcs: number; rows: MajorReportRow[] }[]
}

/** A runner of the player's category, as the live race shows them (phase 3). */
export interface RaceViewRunner {
  slot: number
  kind: 'PLAYER' | 'NPC'
  name: string
  country: string | null
  level: number
  state: MajorRunnerState | null
}

/** What `race-state` needs: the player's category, its runners and the player's own decision. */
export interface RaceView {
  category: { idx: number; name: string; phase: 'WAITING' | 'RUNNING' | 'PA' | 'FINISHED'; segment: number; segments: number | null; phaseEndsAt: string | null }
  /** The event's course. */
  raceId: string
  runners: RaceViewRunner[]
  mySlot: number
  /** The player's decision for the open aid station, if any. */
  myDecision: { stop: AidStop; intensity: Intensity; source: 'PLAYER' | 'AUTO' } | null
  /** By slot: whether the runner's last aid station was their own decision or their plan. */
  sources: Record<number, 'PLAYER' | 'AUTO'>
  /** The player's frozen plan. */
  myPlan: MajorPlan | null
  /** The event's running phase and decision window, in seconds. */
  runningS: number
  windowS: number
}

export interface MajorOpsDeps {
  store: MajorStore
  /** The race orchestrator's storage (phase 3). */
  race: RaceStore
  /** True when the request carries the scheduler's secret (the `tick` action). */
  tickAuthorized?: boolean
  /** The player's career as the server has it (Fitness decay applied); null if none. */
  loadCareer(userId: string): Promise<GameState | null>
  authenticate(token: string | null): Promise<string | null>
  now(): number
}

export type MajorRequest =
  | { action: 'whoami' }
  | { action: 'config-get' }
  | { action: 'config-set'; config: MajorConfig }
  | { action: 'events-list' }
  | { action: 'event-create'; event: MajorEventInput }
  | { action: 'event-update'; id: string; event: MajorEventInput }
  | { action: 'event-publish'; id: string }
  | { action: 'event-cancel'; id: string; reason: string }
  | { action: 'event-report'; id: string }
  | { action: 'runners' }
  | { action: 'media-upload'; id: string; kind: 'banner' | 'clip'; segment: number | null }
  | { action: 'media-set'; id: string; kind: 'banner' | 'clip'; segment: number | null; path: string | null }
  | { action: 'majors' }
  | { action: 'register'; id: string }
  | { action: 'withdraw'; id: string }
  | { action: 'save-plan'; id: string; plan: unknown }
  | { action: 'ready'; id: string }
  | { action: 'tick' }
  | { action: 'race-state'; id: string }
  | { action: 'decide'; id: string; segment: number; stop: AidStop; intensity: Intensity }

export interface MajorResponse {
  status: number
  body: Record<string, unknown>
}

/** Banners and clips may change until the race is run (cosmetic: owner request, 10 November 2026). */
const MEDIA_EDITABLE: readonly MajorStatus[] = ['DRAFT', 'SCHEDULED', 'REGISTRATION_OPEN', 'LOCKED', 'STARTING']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ok = (body: Record<string, unknown> = {}): MajorResponse => ({ status: 200, body: { ok: true, ...body } })
const refuse = (status: number, error: string): MajorResponse => ({ status, body: { ok: false, error } })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEventInput(value: unknown): value is MajorEventInput {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.raceId === 'string' &&
    typeof value.scheduledStartAt === 'string'
  )
}

function isBand(value: unknown): value is MajorBand {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.min === 'number' &&
    (value.max === null || typeof value.max === 'number')
  )
}

function isConfig(value: unknown): value is MajorConfig {
  return (
    isRecord(value) &&
    typeof value.startTimeUtc === 'string' &&
    ['registrationOpenDays', 'readyMinutes', 'decisionWindowS', 'runningS', 'participantLimit'].every(
      (key) => typeof value[key] === 'number',
    ) &&
    Array.isArray(value.bands) &&
    value.bands.every(isBand)
  )
}

export function parseMajorRequest(body: unknown): MajorRequest | null {
  if (!isRecord(body) || typeof body.action !== 'string') return null
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  switch (body.action) {
    case 'whoami':
    case 'config-get':
    case 'events-list':
    case 'majors':
    case 'tick':
      return { action: body.action }
    case 'race-state':
      return id ? { action: 'race-state', id } : null
    case 'decide':
      return id && Number.isInteger(body.segment) && STOPS.includes(body.stop as AidStop) && INTENSITIES.includes(body.intensity as Intensity)
        ? { action: 'decide', id, segment: body.segment as number, stop: body.stop as AidStop, intensity: body.intensity as Intensity }
        : null
    case 'register':
    case 'withdraw':
    case 'ready':
      return id ? { action: body.action, id } : null
    case 'save-plan':
      return id && isRecord(body.plan) ? { action: 'save-plan', id, plan: body.plan } : null
    case 'config-set':
      return isConfig(body.config) ? { action: 'config-set', config: body.config } : null
    case 'event-create':
      return isEventInput(body.event) ? { action: 'event-create', event: body.event } : null
    case 'event-update':
      return id && isEventInput(body.event) ? { action: 'event-update', id, event: body.event } : null
    case 'event-publish':
      return id ? { action: 'event-publish', id } : null
    case 'event-report':
      return id ? { action: 'event-report', id } : null
    case 'runners':
      return { action: 'runners' }
    case 'event-cancel':
      return id && typeof body.reason === 'string' ? { action: 'event-cancel', id, reason: body.reason } : null
    case 'media-upload':
    case 'media-set': {
      const kind = body.kind === 'banner' || body.kind === 'clip' ? body.kind : null
      const segment = kind === 'clip' && Number.isInteger(body.segment) ? (body.segment as number) : null
      if (!id || !kind || (kind === 'clip' && segment === null)) return null
      if (body.action === 'media-upload') return { action: 'media-upload', id, kind, segment }
      if (body.path !== null && typeof body.path !== 'string') return null
      return { action: 'media-set', id, kind, segment, path: body.path as string | null }
    }
    default:
      return null
  }
}

export async function handleMajorOp(token: string | null, body: unknown, deps: MajorOpsDeps): Promise<MajorResponse> {
  // The scheduler's tick: no user, its own secret (checked by the function before calling here).
  if (isRecord(body) && body.action === 'tick') {
    if (!deps.tickAuthorized) return refuse(401, 'not-signed-in')
    const now = deps.now()
    await deps.store.advance(now)
    return ok(await advanceMajorRaces(deps.race, now))
  }
  const userId = await deps.authenticate(token)
  if (!userId) return refuse(401, 'not-signed-in')
  const request = parseMajorRequest(body)
  if (!request) return refuse(400, 'bad-request')
  try {
    const played = await playerOp(request, userId, deps)
    if (played) return played
  } catch (error) {
    if (error instanceof MajorStoreError) return refuse(error.refusal === 'not-found' ? 404 : 409, error.refusal)
    throw error
  }
  const admin = await deps.store.isAdmin(userId)
  if (request.action === 'whoami') return ok({ userId, admin })
  if (!admin) return refuse(403, 'not-admin')

  try {
    switch (request.action) {
      case 'config-get':
        return ok({ config: await deps.store.getConfig() })
      case 'config-set': {
        const problem = validateConfig(request.config)
        if (problem) return refuse(422, `config-${problem}`)
        await deps.store.setConfig(request.config, userId)
        await deps.store.log(null, userId, 'config-set', { config: request.config })
        return ok({ config: await deps.store.getConfig() })
      }
      case 'events-list':
        return ok({ events: await deps.store.listEvents() })
      case 'event-create': {
        const problem = validateEventInput(request.event, deps.now())
        if (problem) return refuse(422, `event-${problem}`)
        const event = await deps.store.createEvent(cleanInput(request.event), userId)
        await deps.store.log(event.id, userId, 'created', {})
        return ok({ event })
      }
      case 'event-update': {
        const problem = validateEventInput(request.event, deps.now())
        if (problem) return refuse(422, `event-${problem}`)
        const event = await deps.store.updateDraft(request.id, cleanInput(request.event))
        if (!event) return refuse(409, 'not-draft')
        await deps.store.log(event.id, userId, 'edited', {})
        return ok({ event })
      }
      case 'event-publish':
        return ok({ event: await deps.store.publish(request.id, userId, deps.now()) })
      case 'media-upload':
      case 'media-set': {
        const event = await deps.store.getEvent(request.id)
        if (!MEDIA_EDITABLE.includes(event.status)) return refuse(409, 'media-closed')
        if (request.kind === 'clip') {
          const race = getRace(event.raceId)
          const segments = race ? getRaceSegments(race).length : 0
          if (request.segment! < 1 || request.segment! > segments) return refuse(422, 'media-segment')
        }
        if (request.action === 'media-upload') {
          const stamp = deps.now()
          const base = `events/${event.id}/${request.kind === 'banner' ? 'banner' : `segment-${request.segment}`}-${stamp}`
          if (request.kind === 'banner') {
            const path = `${base}.jpg`
            return ok({ uploads: [{ path, token: await deps.store.signUpload(path) }] })
          }
          // The clip and its poster picture (shown before it plays).
          const video = `${base}.mp4`
          const poster = `${base}.jpg`
          return ok({
            uploads: [
              { path: video, token: await deps.store.signUpload(video) },
              { path: poster, token: await deps.store.signUpload(poster) },
            ],
          })
        }
        const pattern = request.kind === 'banner' ? /^banner-\d+\.jpg$/ : new RegExp(`^segment-${request.segment}-\\d+\\.mp4$`)
        const prefix = `events/${event.id}/`
        if (request.path !== null && !(request.path.startsWith(prefix) && pattern.test(request.path.slice(prefix.length)))) {
          return refuse(422, 'media-path')
        }
        const updated =
          request.kind === 'banner'
            ? await deps.store.setBanner(event.id, request.path)
            : await deps.store.setClip(event.id, request.segment!, request.path)
        await deps.store.log(event.id, userId, 'media', { kind: request.kind, segment: request.segment, path: request.path })
        return ok({ event: updated })
      }
      case 'event-report':
        return ok({ report: await deps.store.report(request.id) })
      case 'runners':
        return ok({ runners: await deps.store.runners() })
      case 'event-cancel': {
        const reason = request.reason.trim()
        if (reason.length < 1 || reason.length > 300) return refuse(422, 'cancel-reason')
        return ok({ event: await deps.store.cancel(request.id, userId, reason) })
      }
      default:
        return refuse(400, 'bad-request')
    }
  } catch (error) {
    if (error instanceof MajorStoreError) return refuse(error.refusal === 'not-found' ? 404 : 409, error.refusal)
    throw error
  }
}

/**
 * Player actions (phase 2): the published Majors with the player's registration, registering with
 * the level frozen from the server's career, withdrawing, the race plan and READY with the runner
 * as the server has them now. Null for any other action.
 */
async function playerOp(request: MajorRequest, userId: string, deps: MajorOpsDeps): Promise<MajorResponse | null> {
  const now = deps.now()
  switch (request.action) {
    case 'majors':
      await deps.store.advance(now)
      await advanceQuietly(deps, now)
      return ok({ majors: await deps.store.playerMajors(userId, now), now: new Date(now).toISOString() })
    case 'race-state': {
      await advanceQuietly(deps, now)
      const view = await deps.store.raceView(request.id, userId)
      if (!view) return refuse(404, 'not-on-grid')
      return ok({ race: liveRace(view), now: new Date(now).toISOString() })
    }
    case 'decide': {
      await advanceQuietly(deps, now)
      await deps.store.decide(request.id, userId, request.segment, request.stop, request.intensity)
      const view = await deps.store.raceView(request.id, userId)
      return ok({ race: view && liveRace(view), now: new Date(now).toISOString() })
    }
    case 'register': {
      const career = await deps.loadCareer(userId)
      if (!career) return refuse(409, 'no-career')
      await deps.store.advance(now)
      const { athlete } = career
      await deps.store.register(request.id, userId, { level: getLevel(athlete.xp), name: athlete.name, country: athlete.country ?? null }, now)
      return ok({ majors: await deps.store.playerMajors(userId, now) })
    }
    case 'withdraw':
      await deps.store.withdraw(request.id, userId, now)
      return ok({ majors: await deps.store.playerMajors(userId, now) })
    case 'save-plan': {
      const event = await deps.store.getEvent(request.id)
      const race = getRace(event.raceId)
      const plan = race ? validatePlan(request.plan, getRaceSegments(race).length) : null
      if (!plan) return refuse(422, 'plan-invalid')
      await deps.store.savePlan(request.id, userId, plan, now)
      return ok({ majors: await deps.store.playerMajors(userId, now) })
    }
    case 'ready': {
      const career = await deps.loadCareer(userId)
      if (!career) return refuse(409, 'no-career')
      await deps.store.advance(now)
      const mine = (await deps.store.playerMajors(userId, now)).find((m) => m.id === request.id)?.registration
      if (!mine || (mine.status !== 'REGISTERED' && mine.status !== 'READY')) return refuse(409, 'not-registered')
      const { athlete } = career
      const snapshot: MajorRunnerSnapshot = {
        level: mine.level,
        attributes: { ...athlete.attributes },
        fitness: athlete.fitness,
        fatigue: athlete.fatigue,
        equipment: [...career.equipment],
        // Only what is in stock now (owner decision 7: deducted when the race starts).
        nutrition: { gel: (mine.plan?.gel ?? false) && career.consumables.gel > 0, bar: (mine.plan?.bar ?? false) && career.consumables.bar > 0 },
      }
      await deps.store.setReady(request.id, userId, snapshot, now)
      return ok({ majors: await deps.store.playerMajors(userId, now) })
    }
    default:
      return null
  }
}

/**
 * Players' requests also move the races on (owner specification §7: no browser decides, but any
 * request may run what is already due), so a late scheduler never holds a race up. Never fails the
 * request: the scheduler retries.
 */
async function advanceQuietly(deps: MajorOpsDeps, now: number): Promise<void> {
  try {
    await advanceMajorRaces(deps.race, now, 5)
  } catch (error) {
    console.error('major advance failed', error instanceof Error ? error.message : error)
  }
}

/** The live race for a player: the phase, the standings with gaps, and their own runner. */
export function liveRace(view: RaceView) {
  const withState = view.runners.filter((r): r is RaceViewRunner & { state: MajorRunnerState } => r.state !== null)
  const table = majorStandings(withState.map((r) => ({ slot: r.slot, state: r.state })))
  const bySlot = new Map(view.runners.map((r) => [r.slot, r]))
  const me = bySlot.get(view.mySlot)
  return {
    category: view.category,
    standings: table.map((row) => {
      const runner = bySlot.get(row.slot)!
      const last = runner.state?.progress.splits.at(-1)
      const me = row.slot === view.mySlot
      // NPCs are not identifiable (owner request, 11 November 2026): no kind, no level, and only the
      // player's own row says whether their last aid station was decided by their plan.
      return {
        ...row,
        name: runner.name,
        country: runner.country,
        me,
        intensity: last?.intensity ?? null,
        auto: me && view.sources[row.slot] === 'AUTO',
      }
    }),
    me: me?.state
      ? {
          slot: me.slot,
          elapsedS: me.state.progress.elapsedS,
          energy: Math.max(0, 100 - me.state.progress.fatigue),
          fatigue: me.state.progress.fatigue,
          next: me.state.next,
          splits: me.state.progress.splits,
        }
      : null,
    myDecision: view.myDecision,
    runningS: view.runningS,
    windowS: view.windowS,
    /** At the finish: what the place gives (added to the career at the player's next request). */
    prize: view.category.phase === 'FINISHED' ? finishPrize(view, table) : null,
    /** What the plan decides at the open aid station if the player sends nothing. */
    planned: me?.state && view.category.phase === 'PA' ? plannedDecision(view, me.state) : null,
  }
}

function finishPrize(view: RaceView, table: readonly { slot: number; position: number }[]) {
  const race = getRace(view.raceId)
  const mine = table.find((row) => row.slot === view.mySlot)
  if (!race || !mine) return null
  const prize = majorPrize(race, mine.position)
  return { coins: prize.coins, xp: prize.xp, points: prize.rankingPoints }
}

/** The player's plan for the open aid station (owner specification §5.2: applied without a decision). */
function plannedDecision(view: RaceView, state: MajorRunnerState) {
  const me = view.runners.find((r) => r.slot === view.mySlot)!
  return automaticDecision(
    { slot: me.slot, kind: me.kind, level: me.level, snapshot: null, plan: view.myPlan },
    state,
    view.category.segment,
    view.category.segments ?? 1,
  )
}

export type LiveRace = ReturnType<typeof liveRace>

function cleanInput(input: MajorEventInput): MajorEventInput {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    raceId: input.raceId,
    scheduledStartAt: new Date(Date.parse(input.scheduledStartAt)).toISOString(),
  }
}
