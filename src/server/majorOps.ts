import {
  validateConfig,
  validateEventInput,
  type MajorBand,
  type MajorConfig,
  type MajorEventInput,
  type MajorStatus,
} from '../domain/major/major'

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
  categories: MajorCategory[]
}

/** Database refusals the administrator can act on. */
export type MajorStoreRefusal = 'not-found' | 'not-draft' | 'too-soon' | 'final'

export class MajorStoreError extends Error {
  readonly refusal: MajorStoreRefusal
  constructor(refusal: MajorStoreRefusal) {
    super(refusal)
    this.refusal = refusal
  }
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
}

export interface MajorOpsDeps {
  store: MajorStore
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

export interface MajorResponse {
  status: number
  body: Record<string, unknown>
}

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
      return { action: body.action }
    case 'config-set':
      return isConfig(body.config) ? { action: 'config-set', config: body.config } : null
    case 'event-create':
      return isEventInput(body.event) ? { action: 'event-create', event: body.event } : null
    case 'event-update':
      return id && isEventInput(body.event) ? { action: 'event-update', id, event: body.event } : null
    case 'event-publish':
      return id ? { action: 'event-publish', id } : null
    case 'event-cancel':
      return id && typeof body.reason === 'string' ? { action: 'event-cancel', id, reason: body.reason } : null
    default:
      return null
  }
}

export async function handleMajorOp(token: string | null, body: unknown, deps: MajorOpsDeps): Promise<MajorResponse> {
  const userId = await deps.authenticate(token)
  if (!userId) return refuse(401, 'not-signed-in')
  const request = parseMajorRequest(body)
  if (!request) return refuse(400, 'bad-request')
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
      case 'event-cancel': {
        const reason = request.reason.trim()
        if (reason.length < 1 || reason.length > 300) return refuse(422, 'cancel-reason')
        return ok({ event: await deps.store.cancel(request.id, userId, reason) })
      }
    }
  } catch (error) {
    if (error instanceof MajorStoreError) return refuse(error.refusal === 'not-found' ? 404 : 409, error.refusal)
    throw error
  }
}

function cleanInput(input: MajorEventInput): MajorEventInput {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    raceId: input.raceId,
    scheduledStartAt: new Date(Date.parse(input.scheduledStartAt)).toISOString(),
  }
}
