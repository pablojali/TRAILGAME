import type { AttributeId, ProfileId } from '../domain/athlete/athlete'
import { isProfileId, STARTING_PROFILE } from '../domain/athlete/profiles'
import { isSessionType, type SessionType } from '../domain/training/sessions'
import { setAppearance } from '../game-engine/appearance'
import { allocateAttributePoint } from '../game-engine/attributes'
import { applyFitnessDecay } from '../game-engine/fitnessDecay'
import { buyItem, setItemEquipped } from '../game-engine/equipment'
import { createInitialGameState, type AthleteIdentity, type GameState } from '../game-engine/gameState'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import { enterRace, startRace, stepRace } from '../game-engine/races'
import { executeCurrentDay, planSession, type DayRef } from '../game-engine/training'
import { parseGameState, SCHEMA_VERSION } from '../repositories/gameRepository'
import { applyMajorReward, type MajorRewardPayload } from '../game-engine/majorRewards'

/**
 * Server-authoritative career operations, run in the Supabase Edge Function `career-ops`.
 * Phase 3B.1: the server owns everything progression (XP and level, Fitness, Fatigue, attributes
 * and points, the completed days of the week, forced rest and race results and prizes). Phase
 * 3B.2: it also owns the economy and equipment (coins, owned items, what is worn, race entries
 * and their fees). Every change to those is computed here with the game's own engine (training
 * days, race days, attribute points, purchases, equipping, race entry); the client only sends the
 * request and plays the state the server returns.
 *
 * Fields the client still owns (name, sex and look, the week's plan from today on) are taken from its
 * snapshot when it is up to date with the server. Nothing here touches Supabase directly: storage
 * and authentication are injected (src/server/supabaseRest.ts).
 */

export interface CareerRecord {
  version: number
  schemaVersion: number
  state: unknown
}

export type CommitStatus = 'saved' | 'conflict' | 'duplicate' | 'foreign-operation'

export interface CareerOpsStore {
  load(userId: string): Promise<CareerRecord | null>
  /** A recorded operation, if this id was used before. */
  operation(operationId: string): Promise<{ userId: string; response: unknown } | null>
  /** commit_career: version-checked, idempotent, atomic. */
  commit(input: {
    userId: string
    baseVersion: number | null
    state: GameState
    operationId: string | null
    kind: OperationKind
    response: Record<string, unknown> | null
  }): Promise<{ status: CommitStatus; version: number | null; response: unknown }>
  /** Sunday Major rewards waiting for this player (phase 5). */
  majorRewards?(userId: string): Promise<{ id: string; payload: MajorRewardPayload }[]>
  /** Marks rewards as applied, once the career that holds them is saved. */
  markMajorRewards?(ids: string[]): Promise<void>
}

export interface CareerOpsDeps {
  store: CareerOpsStore
  /** The signed-in user's id for a bearer token, or null if it is not valid. */
  authenticate(token: string | null): Promise<string | null>
  now(): number
}

export type OperationKind =
  | 'train'
  | 'race-start'
  | 'race-step'
  | 'allocate'
  | 'buy'
  | 'equip'
  | 'enter-race'
  | 'save'
  | 'new-career'
  | 'claim'

interface WithSnapshot {
  /** The cloud version the client's snapshot is based on. */
  baseVersion: number | null
  /** The client's current career, for the fields it owns. Ignored unless up to date. */
  snapshot?: unknown
}

export type CareerOpRequest =
  | ({ action: 'train'; operationId: string; ref: DayRef; session: SessionType } & WithSnapshot)
  /**
   * Race Engine V1: the client sends decisions only. `race-start` runs the first segment with the
   * chosen intensity, taking the gel and bar asked for; each `race-step` makes the stop at the aid
   * station and runs the next segment (`segment`: its index); the last step finishes the race.
   */
  | ({
      action: 'race-start'
      operationId: string
      ref: DayRef
      entryId: string
      intensity: Intensity
      gel: boolean
      bar: boolean
    } & WithSnapshot)
  | ({ action: 'race-step'; operationId: string; segment: number; stop: AidStop; intensity: Intensity } & WithSnapshot)
  | ({ action: 'allocate'; operationId: string; attribute: AttributeId; expectedSpent: number } & WithSnapshot)
  /** `price`: the price the player saw; the catalog's price is charged, and a different one refused. */
  | ({ action: 'buy'; operationId: string; itemId: string; price: number } & WithSnapshot)
  | ({ action: 'equip'; operationId: string; itemId: string; equipped: boolean } & WithSnapshot)
  /** Free; the server checks the runner's level against the race's minimum. */
  | ({ action: 'enter-race'; operationId: string; raceId: string } & WithSnapshot)
  | ({ action: 'save'; snapshot: unknown } & WithSnapshot)
  /** Adds the Sunday Major results waiting for the player now (phase 5); nothing else changes. */
  | ({ action: 'claim'; operationId: string } & WithSnapshot)
  | { action: 'new-career'; baseVersion: number | null; profile: ProfileId; identity: AthleteIdentity }

export type CareerOpResponse =
  | { ok: true; state: GameState; version: number; result?: unknown; duplicate?: true }
  /** `state`/`version`: the cloud career, when the request was refused because of it. */
  | { ok: false; error: string; state?: GameState; version?: number | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Attempts when another write lands between reading and committing. */
const MAX_ATTEMPTS = 3

/** A career as the server stores it: valid schema and content, or null. */
/** The player's career as the server has it now (Fitness decay applied), for other functions. */
export async function loadServerCareer(store: CareerOpsStore, userId: string, now: number): Promise<GameState | null> {
  const record = await store.load(userId)
  const state = record && readRecord(record, now)
  return state ? applyFitnessDecay(state, now).state : null
}

function readRecord(record: CareerRecord, now: number): GameState | null {
  if (record.schemaVersion !== SCHEMA_VERSION) return null
  return parseGameState(record.state, now)
}

/**
 * The server's career with the fields the client owns taken from the client's snapshot: name,
 * sex, country and look (validated by the engine), the Trail Coach progress and the planned sessions of today and the rest of the
 * week (validated by the engine).
 * Progression, coins, owned and worn items and race entries always stay the server's (Phase
 * 3B.2). An invalid result falls back to the server's career.
 */
export function mergeClientFields(server: GameState, client: GameState, now: number): GameState {
  let merged: GameState = {
    ...server,
    athlete: {
      ...server.athlete,
      name: client.athlete.name,
      sex: client.athlete.sex,
      ...(client.athlete.country === undefined ? {} : { country: client.athlete.country }),
    },
  }
  // The coach's progress is the player's; a welcome already done and moments already seen stay so
  // (a career from before the coach has none and gets none).
  if (client.coach && server.coach) {
    const seen = [...new Set([...(server.coach.seen ?? []), ...(client.coach.seen ?? [])])]
    merged.coach = {
      ...client.coach,
      welcomeDone: server.coach.welcomeDone || client.coach.welcomeDone,
      ...(seen.length ? { seen } : {}),
    }
  }
  const look = setAppearance(merged, client.athlete.appearance)
  if (look.ok) merged = look.state
  // The plan for today and the rest of the week (validated by the engine, day by day).
  if (client.week.number === server.week.number) {
    for (let index = server.week.currentDayIndex; index < server.week.days.length; index++) {
      const planned = client.week.days[index]?.session
      if (!planned || planned === merged.week.days[index]!.session) continue
      const plan = planSession(merged, { week: server.week.number, dayIndex: index }, planned)
      if (plan.ok) merged = plan.value
    }
  }
  return parseGameState(JSON.parse(JSON.stringify(merged)), now) ?? server
}

/**
 * The Sunday Major results waiting for the player, added to the career before anything else
 * (phase 5). Idempotent: a result already in the career (its entry id is the event's) is skipped.
 */
function withMajorRewards(career: GameState, rewards: readonly { id: string; payload: MajorRewardPayload }[]): GameState {
  let state = career
  for (const reward of rewards) state = applyMajorReward(state, reward.payload)?.state ?? state
  return state
}

async function pendingMajorRewards(deps: CareerOpsDeps, userId: string) {
  try {
    return (await deps.store.majorRewards?.(userId)) ?? []
  } catch {
    // The race's result waits for the next request; the operation itself goes on.
    return []
  }
}

async function markMajorRewards(deps: CareerOpsDeps, rewards: readonly { id: string }[]) {
  if (rewards.length === 0) return
  try {
    await deps.store.markMajorRewards?.(rewards.map((r) => r.id))
  } catch {
    // Marked at a later request; the career already holds the result, so it is not applied twice.
  }
}

type Computation =
  | { ok: true; state: GameState; result?: Record<string, unknown> }
  | { ok: false; error: string }

/** The engine step of each progression operation, on the server's (decayed) career. */
function compute(request: CareerOpRequest, career: GameState, now: number): Computation {
  switch (request.action) {
    case 'train': {
      let state = career
      if (!isSessionType(request.session)) return { ok: false, error: 'unknown-session' }
      if (state.week.days[state.week.currentDayIndex]?.session !== request.session) {
        const plan = planSession(state, request.ref, request.session)
        if (!plan.ok) return { ok: false, error: plan.error }
        state = plan.value
      }
      const executed = executeCurrentDay(state, request.ref, now)
      if (!executed.ok) return { ok: false, error: executed.error }
      const { state: next, ...result } = executed.value
      return { ok: true, state: next, result: { ...result } }
    }
    case 'race-start': {
      const decisions = { intensity: request.intensity, gel: request.gel, bar: request.bar }
      const started = startRace(career, request.ref, request.entryId, decisions, now)
      if (!started.ok) return { ok: false, error: started.error }
      return { ok: true, state: started.state, result: { finished: false } }
    }
    case 'race-step': {
      const decisions = { segment: request.segment, stop: request.stop, intensity: request.intensity }
      const stepped = stepRace(career, decisions, now)
      if (!stepped.ok) return { ok: false, error: stepped.error }
      if (!stepped.value.finished) return { ok: true, state: stepped.value.state, result: { finished: false } }
      const { state: next, ...result } = stepped.value.value
      return { ok: true, state: next, result: { finished: true, ...result } }
    }
    case 'allocate': {
      const allocated = allocateAttributePoint(career, request.attribute, request.expectedSpent)
      if (!allocated.ok) return { ok: false, error: allocated.error }
      return { ok: true, state: allocated.state }
    }
    case 'buy': {
      const bought = buyItem(career, request.itemId, request.price)
      if (!bought.ok) return { ok: false, error: bought.error }
      return { ok: true, state: bought.state }
    }
    case 'equip': {
      const changed = setItemEquipped(career, request.itemId, request.equipped)
      if (!changed.ok) return { ok: false, error: changed.error }
      return { ok: true, state: changed.state }
    }
    case 'enter-race': {
      const entered = enterRace(career, request.raceId, now)
      if (!entered.ok) return { ok: false, error: entered.error }
      return { ok: true, state: entered.state, result: { entry: entered.entry } }
    }
    case 'claim':
      // The waiting Major results were already added to `career` (withMajorRewards).
      return { ok: true, state: career }
    default:
      return { ok: false, error: 'bad-request' }
  }
}

function isRef(value: unknown): value is DayRef {
  const ref = value as DayRef
  return typeof ref === 'object' && ref !== null && Number.isInteger(ref.week) && Number.isInteger(ref.dayIndex)
}

/** Shape checks on the request body (the engine checks the rules). */
function validRequest(body: unknown): body is CareerOpRequest {
  if (typeof body !== 'object' || body === null) return false
  const request = body as Record<string, unknown>
  const base = request.baseVersion === null || Number.isInteger(request.baseVersion)
  switch (request.action) {
    case 'train':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId) && isRef(request.ref) && typeof request.session === 'string'
    case 'race-start':
      return (
        base &&
        typeof request.operationId === 'string' &&
        UUID.test(request.operationId) &&
        isRef(request.ref) &&
        typeof request.entryId === 'string' &&
        typeof request.intensity === 'string' &&
        typeof request.gel === 'boolean' &&
        typeof request.bar === 'boolean'
      )
    case 'race-step':
      return (
        base &&
        typeof request.operationId === 'string' &&
        UUID.test(request.operationId) &&
        Number.isInteger(request.segment) &&
        typeof request.stop === 'string' &&
        typeof request.intensity === 'string'
      )
    case 'allocate':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId) && typeof request.attribute === 'string' && Number.isInteger(request.expectedSpent)
    case 'buy':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId) && typeof request.itemId === 'string' && Number.isInteger(request.price)
    case 'equip':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId) && typeof request.itemId === 'string' && typeof request.equipped === 'boolean'
    case 'enter-race':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId) && typeof request.raceId === 'string'
    case 'save':
      return base && request.snapshot !== undefined
    case 'claim':
      return base && typeof request.operationId === 'string' && UUID.test(request.operationId)
    case 'new-career': {
      const identity = request.identity as Record<string, unknown> | undefined
      return base && isProfileId(request.profile) && typeof identity === 'object' && identity !== null && typeof identity.name === 'string'
    }
    default:
      return false
  }
}

export interface HttpResult {
  status: number
  body: CareerOpResponse
}

const fail = (status: number, error: string, extra: Partial<Extract<CareerOpResponse, { ok: false }>> = {}): HttpResult => ({
  status,
  body: { ok: false, error, ...extra },
})

/** Handles one request from a signed-in player. Never trusts the client for progression or the economy. */
export async function handleCareerOp(token: string | null, body: unknown, deps: CareerOpsDeps): Promise<HttpResult> {
  const userId = await deps.authenticate(token)
  if (!userId) return fail(401, 'unauthorized')
  if (!validRequest(body)) return fail(400, 'bad-request')
  const request = body
  const now = deps.now()

  if (request.action === 'new-career') return newCareer(userId, request, deps, now)
  if (request.action === 'save') return save(userId, request, deps, now)

  // Progression and economy operations: an operation id already used is answered from its record.
  const previous = await deps.store.operation(request.operationId)
  if (previous) return replay(userId, previous, deps, now)

  const rewards = await pendingMajorRewards(deps, userId)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await deps.store.load(userId)
    if (!record) return fail(409, 'no-career')
    const server = readRecord(record, now)
    if (!server) return fail(409, 'cloud-unreadable')
    const client = request.baseVersion === record.version && request.snapshot !== undefined ? parseGameState(request.snapshot, now) : null
    const merged = client ? mergeClientFields(server, client, now) : server
    const career = withMajorRewards(applyFitnessDecay(merged, now).state, rewards)
    // Nothing waiting: nothing to save.
    if (request.action === 'claim' && career.raceEntries.length === server.raceEntries.length) {
      await markMajorRewards(deps, rewards)
      return { status: 200, body: { ok: true, state: career, version: record.version } }
    }
    const computed = compute(request, career, now)
    if (!computed.ok) return fail(422, computed.error, { state: career, version: record.version })
    const committed = await deps.store.commit({
      userId,
      baseVersion: record.version,
      state: computed.state,
      operationId: request.operationId,
      kind: request.action,
      response: computed.result ? { result: computed.result } : {},
    })
    if (committed.status === 'saved') {
      await markMajorRewards(deps, rewards)
      return { status: 200, body: { ok: true, state: computed.state, version: committed.version!, result: computed.result } }
    }
    if (committed.status === 'duplicate') return replay(userId, { userId, response: committed.response }, deps, now)
    if (committed.status === 'foreign-operation') return fail(403, 'forbidden')
    // conflict: another write landed first; compute again on the new career.
  }
  return fail(409, 'busy')
}

/** A repeated operation: the stored result and the current career, nothing applied again. */
async function replay(userId: string, previous: { userId: string; response: unknown }, deps: CareerOpsDeps, now: number): Promise<HttpResult> {
  if (previous.userId !== userId) return fail(403, 'forbidden')
  const record = await deps.store.load(userId)
  const state = record && readRecord(record, now)
  if (!record || !state) return fail(409, 'no-career')
  const response = (previous.response ?? {}) as { result?: unknown }
  return { status: 200, body: { ok: true, state, version: record.version, result: response.result, duplicate: true } }
}

/**
 * A snapshot from the client's sync: with no cloud career it becomes the cloud career (first
 * upload); otherwise only the fields the client owns are taken, and only if the client is up to
 * date (else a conflict with the cloud career is returned).
 */
async function save(userId: string, request: Extract<CareerOpRequest, { action: 'save' }>, deps: CareerOpsDeps, now: number): Promise<HttpResult> {
  const client = parseGameState(request.snapshot, now)
  if (!client) return fail(400, 'malformed-snapshot')
  const rewards = await pendingMajorRewards(deps, userId)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await deps.store.load(userId)
    if (!record) {
      if (request.baseVersion !== null) return fail(409, 'conflict', { version: null })
      const created = await deps.store.commit({ userId, baseVersion: null, state: client, operationId: null, kind: 'save', response: null })
      if (created.status === 'saved') return { status: 200, body: { ok: true, state: client, version: created.version! } }
      continue
    }
    const server = readRecord(record, now)
    if (!server) return fail(409, 'cloud-unreadable', { version: record.version })
    if (request.baseVersion !== record.version) return fail(409, 'conflict', { state: server, version: record.version })
    const merged = withMajorRewards(mergeClientFields(applyFitnessDecay(server, now).state, client, now), rewards)
    const committed = await deps.store.commit({ userId, baseVersion: record.version, state: merged, operationId: null, kind: 'save', response: null })
    if (committed.status === 'saved') {
      await markMajorRewards(deps, rewards)
      return { status: 200, body: { ok: true, state: merged, version: committed.version! } }
    }
  }
  return fail(409, 'busy')
}

/**
 * A new career (first one, or chosen to replace the cloud career): created here from the profile
 * and identity, never from client values. Replacing needs the version the player saw.
 */
async function newCareer(userId: string, request: Extract<CareerOpRequest, { action: 'new-career' }>, deps: CareerOpsDeps, now: number): Promise<HttpResult> {
  // Every new career starts as an All-rounder (owner decision, 1 November 2026), whatever profile
  // an older client asks for.
  const fresh = parseGameState(JSON.parse(JSON.stringify(createInitialGameState(STARTING_PROFILE, now, request.identity))), now)
  if (!fresh) return fail(400, 'bad-request')
  const record = await deps.store.load(userId)
  const baseVersion = record ? record.version : null
  if (request.baseVersion !== baseVersion) return fail(409, 'conflict', { version: baseVersion })
  const committed = await deps.store.commit({ userId, baseVersion, state: fresh, operationId: null, kind: 'new-career', response: null })
  if (committed.status !== 'saved') return fail(409, 'conflict', { version: committed.version })
  return { status: 200, body: { ok: true, state: fresh, version: committed.version! } }
}
