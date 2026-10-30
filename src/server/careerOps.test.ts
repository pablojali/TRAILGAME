import { describe, expect, it } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { enterRace } from '../game-engine/races'
import { executeCurrentDay } from '../game-engine/training'
import { applyFitnessDecay } from '../game-engine/fitnessDecay'
import { newGame, onSunday, T0, withAthlete } from '../test/gameFixtures'
import { handleCareerOp, type CareerOpsDeps, type CareerOpsStore, type CareerRecord, type OperationKind } from './careerOps'

const NOW = T0 + 60 * 60 * 1000
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** In-memory commit_career: one career per user, versions, recorded operation ids. */
function memoryStore() {
  const careers = new Map<string, CareerRecord>()
  const operations = new Map<string, { userId: string; kind: OperationKind; response: unknown }>()
  let commits = 0
  const store: CareerOpsStore = {
    async load(userId) {
      const record = careers.get(userId)
      return record ? structuredClone(record) : null
    },
    async operation(id) {
      const found = operations.get(id)
      return found ? { userId: found.userId, response: structuredClone(found.response) } : null
    },
    async commit({ userId, baseVersion, state, operationId, kind, response }) {
      await Promise.resolve()
      if (operationId && operations.has(operationId)) {
        const found = operations.get(operationId)!
        return found.userId === userId
          ? { status: 'duplicate', version: careers.get(userId)?.version ?? null, response: found.response }
          : { status: 'foreign-operation', version: null, response: null }
      }
      const current = careers.get(userId)
      if ((current?.version ?? null) !== baseVersion) return { status: 'conflict', version: current?.version ?? null, response: null }
      const version = (current?.version ?? 0) + 1
      careers.set(userId, { version, schemaVersion: 2, state: JSON.parse(JSON.stringify(state)) })
      commits++
      const stored = { ...(response ?? {}), version }
      if (operationId) operations.set(operationId, { userId, kind, response: stored })
      return { status: 'saved', version, response: stored }
    },
  }
  return {
    store,
    careers,
    operations,
    commits: () => commits,
    seed(userId: string, state: GameState, version = 1) {
      careers.set(userId, { version, schemaVersion: 2, state: JSON.parse(JSON.stringify(state)) })
    },
    stateOf: (userId: string) => careers.get(userId)!.state as GameState,
  }
}

function deps(memory: ReturnType<typeof memoryStore>): CareerOpsDeps {
  return {
    store: memory.store,
    // Tokens are "token-<user>"; anything else is not signed in.
    authenticate: async (token) => (token?.startsWith('token-') ? token.slice('token-'.length) : null),
    now: () => NOW,
  }
}

const ref = (state: GameState) => ({ week: state.week.number, dayIndex: state.week.currentDayIndex })

describe('career-ops: training on the server', () => {
  it('completes the day with the engine\'s own XP, Fitness and Fatigue, and stores it', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const response = await handleCareerOp(
      'token-ana',
      { action: 'train', operationId: op(1), baseVersion: 1, ref: ref(career), session: 'easy-run' },
      deps(memory),
    )
    const expected = executeCurrentDay(applyFitnessDecay(career, NOW).state, ref(career), NOW)
    if (!expected.ok) throw new Error(expected.error)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true, version: 2 })
    if (!response.body.ok) throw new Error('failed')
    expect(response.body.state).toEqual(expected.value.state)
    expect(response.body.state.athlete).toMatchObject({ xp: expected.value.state.athlete.xp })
    expect(response.body.result).toMatchObject({ outcome: expected.value.outcome, levelAfter: expected.value.levelAfter })
    expect(memory.stateOf('ana')).toEqual(expected.value.state)
  })

  it('trains the session the player chose for today (planned by the engine first)', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const response = await handleCareerOp(
      'token-ana',
      { action: 'train', operationId: op(1), baseVersion: 1, ref: ref(career), session: 'hills' },
      deps(memory),
    )
    expect(response.body.ok && response.body.state.week.days[0]).toMatchObject({ session: 'hills' })
  })

  it('refuses invalid requests without changing anything', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const run = (body: unknown) => handleCareerOp('token-ana', body, deps(memory))
    expect((await run({ action: 'train', operationId: op(1), baseVersion: 1, ref: { week: 1, dayIndex: 3 }, session: 'rest' })).body).toMatchObject({
      ok: false,
      error: 'day-not-current',
    })
    expect((await run({ action: 'train', operationId: op(2), baseVersion: 1, ref: ref(career), session: 'teleport' })).body).toMatchObject({
      ok: false,
      error: 'unknown-session',
    })
    expect((await run({ action: 'train', operationId: 'not-a-uuid', baseVersion: 1, ref: ref(career), session: 'rest' })).status).toBe(400)
    expect((await run({ action: 'level-up' })).status).toBe(400)
    expect((await handleCareerOp('token-nobody', { action: 'train', operationId: op(3), baseVersion: null, ref: ref(career), session: 'rest' }, deps(memory))).body).toMatchObject({
      ok: false,
      error: 'no-career',
    })
    expect(memory.commits()).toBe(0)
  })

  it('refuses requests without a valid sign-in', async () => {
    const memory = memoryStore()
    memory.seed('ana', newGame())
    const response = await handleCareerOp('forged', { action: 'train', operationId: op(1), baseVersion: 1, ref: { week: 1, dayIndex: 0 }, session: 'rest' }, deps(memory))
    expect(response).toEqual({ status: 401, body: { ok: false, error: 'unauthorized' } })
    expect(memory.commits()).toBe(0)
  })

  it('never applies the same operation id twice (a retried request)', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const body = { action: 'train', operationId: op(7), baseVersion: 1, ref: ref(career), session: 'easy-run' }
    const first = await handleCareerOp('token-ana', body, deps(memory))
    const again = await handleCareerOp('token-ana', body, deps(memory))
    expect(again.body).toMatchObject({ ok: true, duplicate: true, version: 2 })
    if (!first.body.ok || !again.body.ok) throw new Error('failed')
    expect(again.body.state).toEqual(first.body.state)
    expect(again.body.result).toEqual(first.body.result)
    expect(memory.commits()).toBe(1)
  })

  it('applies simultaneous requests once: same id once, different ids for the same day once', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const body = (id: number) => ({ action: 'train', operationId: op(id), baseVersion: 1, ref: ref(career), session: 'easy-run' })
    const same = await Promise.all([1, 1, 1].map((id) => handleCareerOp('token-ana', body(id), deps(memory))))
    expect(same.every((r) => r.body.ok)).toBe(true)
    expect(memory.commits()).toBe(1)

    const memory2 = memoryStore()
    memory2.seed('ana', career)
    const different = await Promise.all([1, 2, 3].map((id) => handleCareerOp('token-ana', body(id), deps(memory2))))
    expect(different.filter((r) => r.body.ok)).toHaveLength(1)
    expect(different.filter((r) => !r.body.ok).map((r) => !r.body.ok && r.body.error)).toEqual(['day-completed', 'day-completed'])
    expect(memory2.commits()).toBe(1)
    expect(memory2.stateOf('ana').week.currentDayIndex).toBe(1)
  })

  it('acts only on the signed-in player\'s career; another player cannot reuse an operation id', async () => {
    const memory = memoryStore()
    memory.seed('ana', newGame())
    memory.seed('leo', newGame())
    await handleCareerOp('token-ana', { action: 'train', operationId: op(1), baseVersion: 1, ref: { week: 1, dayIndex: 0 }, session: 'easy-run' }, deps(memory))
    expect(memory.stateOf('leo')).toEqual(JSON.parse(JSON.stringify(newGame())))
    const stolen = await handleCareerOp('token-leo', { action: 'train', operationId: op(1), baseVersion: 1, ref: { week: 1, dayIndex: 0 }, session: 'easy-run' }, deps(memory))
    expect(stolen).toEqual({ status: 403, body: { ok: false, error: 'forbidden' } })
    expect(memory.careers.get('leo')!.version).toBe(1)
  })

  it('ignores progression values in the client snapshot, keeping only the fields the client owns', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const forged = {
      ...withAthlete(career, { xp: 99_999, fitness: 100, fatigue: 0 }),
      athlete: {
        ...withAthlete(career, { xp: 99_999 }).athlete,
        attributes: { ...career.athlete.attributes, speed: 999 },
        appearance: { ...career.athlete.appearance, outfit: 'white-tshirt' as const },
      },
      coins: 40,
    }
    const response = await handleCareerOp(
      'token-ana',
      { action: 'train', operationId: op(1), baseVersion: 1, snapshot: forged, ref: ref(career), session: 'easy-run' },
      deps(memory),
    )
    if (!response.body.ok) throw new Error(response.body.error)
    const expected = executeCurrentDay(applyFitnessDecay(career, NOW).state, ref(career), NOW)
    if (!expected.ok) throw new Error(expected.error)
    expect(response.body.state.athlete.xp).toBe(expected.value.state.athlete.xp)
    expect(response.body.state.athlete.attributes.speed).toBe(expected.value.state.athlete.attributes.speed)
    expect(response.body.state.athlete.appearance.outfit).toBe('white-tshirt')
    expect(response.body.state.coins).toBe(40)
  })
})

describe('career-ops: race days and attribute points on the server', () => {
  it('runs the race entered on the device, once', async () => {
    const memory = memoryStore()
    const sunday = onSunday(newGame())
    memory.seed('ana', sunday)
    const entered = enterRace(sunday, 'RACE-001', 0, T0)
    if (!entered.ok) throw new Error(entered.error)
    const body = { action: 'race', operationId: op(5), baseVersion: 1, snapshot: entered.state, ref: ref(sunday), entryId: entered.entry.id }
    const response = await handleCareerOp('token-ana', body, deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    const finished = response.body.state.raceEntries[0]!
    expect(finished.status).toBe('finished')
    expect(response.body.state.athlete.xp).toBeGreaterThan(0)
    expect((await handleCareerOp('token-ana', body, deps(memory))).body).toMatchObject({ ok: true, duplicate: true })
    expect(memory.commits()).toBe(1)
  })

  it('spends attribute points with the engine\'s checks, once', async () => {
    const memory = memoryStore()
    memory.seed('ana', withAthlete(newGame(), { xp: 100 }))
    const body = (id: number, expectedSpent: number) => ({ action: 'allocate', operationId: op(id), baseVersion: 1, attribute: 'speed', expectedSpent })
    const first = await handleCareerOp('token-ana', body(1, 0), deps(memory))
    expect(first.body.ok && first.body.state.athlete.spentAttributePoints).toBe(1)
    expect((await handleCareerOp('token-ana', body(2, 0), deps(memory))).body).toMatchObject({ ok: false, error: 'stale-request' })
    expect((await handleCareerOp('token-ana', body(1, 0), deps(memory))).body).toMatchObject({ ok: true, duplicate: true })
    expect(memory.stateOf('ana').athlete.spentAttributePoints).toBe(1)
  })
})

describe('career-ops: snapshot saves and new careers', () => {
  it('a sync save keeps the server\'s progression and takes only the client-owned fields', async () => {
    const memory = memoryStore()
    const career = withAthlete(newGame(), { xp: 300 })
    memory.seed('ana', career, 4)
    const forged = { ...withAthlete(career, { xp: 50_000, fatigue: 0 }), coins: 70 }
    const response = await handleCareerOp('token-ana', { action: 'save', baseVersion: 4, snapshot: forged }, deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.athlete.xp).toBe(300)
    expect(response.body.state.coins).toBe(70)
    expect(memory.stateOf('ana').athlete.xp).toBe(300)
  })

  it('a stale sync save is refused with the cloud career, changing nothing', async () => {
    const memory = memoryStore()
    memory.seed('ana', withAthlete(newGame(), { xp: 300 }), 4)
    const response = await handleCareerOp('token-ana', { action: 'save', baseVersion: 3, snapshot: newGame() }, deps(memory))
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ ok: false, error: 'conflict', version: 4, state: { athlete: { xp: 300 } } })
    expect(memory.commits()).toBe(0)
  })

  it('a first save creates the cloud career; a malformed or unsupported snapshot is refused', async () => {
    const memory = memoryStore()
    const ok = await handleCareerOp('token-ana', { action: 'save', baseVersion: null, snapshot: newGame() }, deps(memory))
    expect(ok.body).toMatchObject({ ok: true, version: 1 })
    expect((await handleCareerOp('token-leo', { action: 'save', baseVersion: null, snapshot: { athlete: 'x' } }, deps(memory))).body).toMatchObject({
      ok: false,
      error: 'malformed-snapshot',
    })
  })

  it('a new career is built by the server from profile and identity, and replaces only the version seen', async () => {
    const memory = memoryStore()
    memory.seed('ana', withAthlete(newGame(), { xp: 900 }), 6)
    const body = (baseVersion: number | null) => ({
      action: 'new-career',
      baseVersion,
      profile: 'climber',
      identity: { name: 'Ana', sex: 'female' },
    })
    expect((await handleCareerOp('token-ana', body(5), deps(memory))).body).toMatchObject({ ok: false, error: 'conflict', version: 6 })
    const response = await handleCareerOp('token-ana', body(6), deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.athlete).toMatchObject({ profile: 'climber', xp: 0, name: 'Ana' })
    expect(response.body.state.coins).toBe(25)
    expect(response.body.version).toBe(7)
  })
})
