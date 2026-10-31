import { describe, expect, it } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { executeCurrentDay } from '../game-engine/training'
import { applyFitnessDecay } from '../game-engine/fitnessDecay'
import { newGame, onSunday, T0, withAthlete, withEntry } from '../test/gameFixtures'
import { getRace } from '../domain/races/races'
import { getRaceRewards } from '../game-engine/races'
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

  it('ignores progression and economy values in the client snapshot, keeping only the fields the client owns', async () => {
    const memory = memoryStore()
    const career = newGame()
    memory.seed('ana', career)
    const forged = {
      ...withAthlete(career, { xp: 99_999, fitness: 100, fatigue: 0 }),
      athlete: {
        ...withAthlete(career, { xp: 99_999 }).athlete,
        attributes: { ...career.athlete.attributes, speed: 999 },
        appearance: { ...career.athlete.appearance, outfit: 'shirt-l1-01' as const },
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
    expect(response.body.state.athlete.appearance.outfit).toBe('shirt-l1-01')
    // Coins are the server's since Phase 3B.2.
    expect(response.body.state.coins).toBe(career.coins)
  })
})

describe('career-ops: race days and attribute points on the server', () => {
  it('runs the race entered on the server, once', async () => {
    const memory = memoryStore()
    const sunday = onSunday(newGame())
    const entered = withEntry(sunday, 'RACE-001')
    memory.seed('ana', entered.state)
    const body = { action: 'race', operationId: op(5), baseVersion: 1, ref: ref(sunday), entryId: entered.entry.id }
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
  it('a sync save keeps the server\'s progression and economy and takes only the client-owned fields', async () => {
    const memory = memoryStore()
    const career = withAthlete(newGame(), { xp: 300 })
    memory.seed('ana', career, 4)
    const forged: GameState = {
      ...withAthlete(career, { xp: 50_000, fatigue: 0, name: 'Anita' }),
      coins: 9_999,
      ownedEquipment: ['starter-shoes', 'trail-shoes', 'poles-2'],
      equipment: ['trail-shoes'],
    }
    const response = await handleCareerOp('token-ana', { action: 'save', baseVersion: 4, snapshot: forged }, deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.athlete).toMatchObject({ xp: 300, name: 'Anita' })
    expect(response.body.state).toMatchObject({ coins: career.coins, ownedEquipment: career.ownedEquipment, equipment: [] })
    expect(memory.stateOf('ana')).toMatchObject({ coins: career.coins, athlete: { xp: 300 } })
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

describe('career-ops: economy and equipment on the server (Phase 3B.2)', () => {
  const rich = (coins: number) => ({ ...newGame(), coins })
  const call = (memory: ReturnType<typeof memoryStore>, body: Record<string, unknown>, user = 'ana') =>
    handleCareerOp(`token-${user}`, { baseVersion: 1, ...body }, deps(memory))

  it('buys an item at the catalog price, once', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(100))
    const body = { action: 'buy', operationId: op(1), itemId: 'poles', price: 25 }
    const response = await call(memory, body)
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.coins).toBe(75)
    expect(response.body.state.ownedEquipment).toContain('poles')
    // The same request again: answered from the record, not charged twice.
    expect((await call(memory, body)).body).toMatchObject({ ok: true, duplicate: true, state: { coins: 75 } })
    // A new request for the same item: already owned.
    expect((await call(memory, { ...body, operationId: op(2), baseVersion: 2 })).body).toMatchObject({ ok: false, error: 'already-owned' })
    expect(memory.stateOf('ana').coins).toBe(75)
    expect(memory.commits()).toBe(1)
  })

  it('refuses unknown items, a price that is not the catalog\'s, and missing coins', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(30))
    expect((await call(memory, { action: 'buy', operationId: op(1), itemId: 'jetpack', price: 0 })).body).toMatchObject({ ok: false, error: 'unknown-item' })
    // The client cannot set the price: a cheaper (or any other) price is refused.
    expect((await call(memory, { action: 'buy', operationId: op(2), itemId: 'trail-shoes', price: 1 })).body).toMatchObject({ ok: false, error: 'price-changed' })
    expect((await call(memory, { action: 'buy', operationId: op(3), itemId: 'trail-shoes', price: 70 })).body).toMatchObject({ ok: false, error: 'insufficient-coins', state: { coins: 30 } })
    expect((await call(memory, { action: 'buy', operationId: op(4), itemId: 'poles', price: 'free' })).status).toBe(400)
    expect(memory.commits()).toBe(0)
  })

  it('ignores coins and items in the snapshot sent with a purchase', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(10))
    const forged = { ...rich(5_000), ownedEquipment: ['starter-shoes', 'hydration-backpack-2'] }
    const response = await call(memory, { action: 'buy', operationId: op(1), itemId: 'trail-shoes', price: 70, snapshot: forged })
    expect(response.body).toMatchObject({ ok: false, error: 'insufficient-coins', state: { coins: 10 } })
    expect(memory.stateOf('ana').ownedEquipment).toEqual(['starter-shoes'])
  })

  it('applies two purchases racing for the same coins once', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(30))
    const [a, b] = await Promise.all([
      call(memory, { action: 'buy', operationId: op(1), itemId: 'poles', price: 25 }),
      call(memory, { action: 'buy', operationId: op(2), itemId: 'hydration-backpack', price: 30 }),
    ])
    const outcomes = [a.body, b.body].map((body) => (body.ok ? 'ok' : body.error)).sort()
    expect(outcomes).toEqual(['insufficient-coins', 'ok'])
    expect(memory.stateOf('ana').coins).toBeGreaterThanOrEqual(0)
    expect(memory.commits()).toBe(1)
  })

  it('equips only owned items, one per slot, and takes them off', async () => {
    const memory = memoryStore()
    memory.seed('ana', { ...rich(0), ownedEquipment: ['starter-shoes', 'trail-shoes', 'poles'] })
    const equip = (n: number, itemId: string, equipped: boolean, baseVersion: number) =>
      call(memory, { action: 'equip', operationId: op(n), itemId, equipped, baseVersion })
    expect((await equip(1, 'starter-shoes', true, 1)).body).toMatchObject({ ok: true, state: { equipment: ['starter-shoes'] } })
    // Same slot: replaces the shoes; another slot: added.
    expect((await equip(2, 'trail-shoes', true, 2)).body).toMatchObject({ ok: true, state: { equipment: ['trail-shoes'] } })
    expect((await equip(3, 'poles', true, 3)).body).toMatchObject({ ok: true, state: { equipment: ['trail-shoes', 'poles'] } })
    expect((await equip(4, 'poles-2', true, 4)).body).toMatchObject({ ok: false, error: 'not-owned' })
    expect((await equip(5, 'cape', true, 4)).body).toMatchObject({ ok: false, error: 'unknown-item' })
    expect((await equip(6, 'trail-shoes', false, 4)).body).toMatchObject({ ok: true, state: { equipment: ['poles'] } })
    expect(memory.stateOf('ana').equipment).toEqual(['poles'])
  })

  it('enters an eligible runner for free, once, without touching coins', async () => {
    const memory = memoryStore()
    // Level 2 (100 XP): Forest First Steps (recommended Level 4) opens at Level 2.
    memory.seed('ana', { ...withAthlete(newGame(), { xp: 100 }), coins: 40 })
    const body = { action: 'enter-race', operationId: op(1), raceId: 'RACE-001' }
    const response = await call(memory, body)
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.raceEntries).toMatchObject([{ raceId: 'RACE-001', status: 'pending', entryType: 'free', feePaid: 0 }])
    expect(response.body.state.coins).toBe(40)
    expect(response.body.result).toMatchObject({ entry: { raceId: 'RACE-001' } })
    // The same request again: answered from the record.
    expect((await call(memory, body)).body).toMatchObject({ ok: true, duplicate: true, state: { coins: 40 } })
    // A new request for the same race: already entered, nothing charged or added.
    expect((await call(memory, { ...body, operationId: op(2), baseVersion: 2 })).body).toMatchObject({ ok: false, error: 'already-entered', state: { coins: 40 } })
    expect((await call(memory, { action: 'enter-race', operationId: op(3), raceId: 'RACE-002', baseVersion: 2 })).body).toMatchObject({ ok: false, error: 'race-scheduled' })
    expect((await call(memory, { action: 'enter-race', operationId: op(4), raceId: 'RACE-999', baseVersion: 2 })).body).toMatchObject({ ok: false, error: 'unknown-race' })
    expect(memory.stateOf('ana')).toMatchObject({ coins: 40, raceEntries: [{ raceId: 'RACE-001' }] })
    expect(memory.commits()).toBe(1)
  })

  it('rejects a runner below the race\'s minimum level, changing nothing', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(1000))
    // Level 1: Forest First Steps opens at Level 2, Ridge Runner at 9.
    expect((await call(memory, { action: 'enter-race', operationId: op(1), raceId: 'RACE-001' })).body).toMatchObject({ ok: false, error: 'level-too-low' })
    expect((await call(memory, { action: 'enter-race', operationId: op(2), raceId: 'RACE-004' })).body).toMatchObject({ ok: false, error: 'level-too-low' })
    expect(memory.stateOf('ana')).toMatchObject({ coins: 1000, raceEntries: [] })
    expect(memory.commits()).toBe(0)
  })

  it('takes the level from the server\'s career: a level, fee or entry sent by the client changes nothing', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(10))
    const forged = { ...withAthlete(newGame(), { xp: 63_700 }), coins: 10 }
    const response = await call(memory, {
      action: 'enter-race',
      operationId: op(1),
      raceId: 'RACE-012',
      level: 50,
      minimumLevel: 1,
      fee: 0,
      snapshot: forged,
    })
    expect(response.body).toMatchObject({ ok: false, error: 'level-too-low', state: { coins: 10, raceEntries: [], athlete: { xp: 0 } } })
    expect(memory.commits()).toBe(0)
  })

  it('creates one entry when the same registration arrives twice at once', async () => {
    const memory = memoryStore()
    memory.seed('ana', withAthlete(newGame(), { xp: 100 }))
    const [a, b] = await Promise.all([
      call(memory, { action: 'enter-race', operationId: op(1), raceId: 'RACE-001' }),
      call(memory, { action: 'enter-race', operationId: op(2), raceId: 'RACE-001' }),
    ])
    const outcomes = [a.body, b.body].map((body) => (body.ok ? 'ok' : body.error)).sort()
    expect(outcomes).toEqual(['already-entered', 'ok'])
    expect(memory.stateOf('ana').raceEntries).toHaveLength(1)
    expect(memory.commits()).toBe(1)
  })

  it('pays race prizes on the server, once, from the server\'s entry (never the client\'s)', async () => {
    const memory = memoryStore()
    const sunday = { ...onSunday(withAthlete(newGame(), { xp: 100 })), coins: 0 }
    memory.seed('ana', sunday)
    // An entry forged on the device is ignored: the server has no pending entry, so no race.
    const forged = withEntry(sunday, 'RACE-001')
    expect(
      (await call(memory, { action: 'race', operationId: op(1), ref: ref(sunday), entryId: forged.entry.id, snapshot: forged.state })).body,
    ).toMatchObject({ ok: false, error: 'unknown-entry' })
    // Entered on the server, then raced: the prize is the engine's, paid once.
    const entered = await call(memory, { action: 'enter-race', operationId: op(2), raceId: 'RACE-001' })
    if (!entered.body.ok) throw new Error(entered.body.error)
    const entryId = entered.body.state.raceEntries[0]!.id
    const body = { action: 'race', operationId: op(3), ref: ref(sunday), entryId, baseVersion: 2 }
    const raced = await call(memory, body)
    if (!raced.body.ok) throw new Error(raced.body.error)
    const result = raced.body.state.raceEntries[0]!
    if (result.status !== 'finished') throw new Error('not finished')
    expect(raced.body.state.coins).toBe(result.result.coinsAwarded)
    // Prizes unchanged by free entry: the engine's catalog prizes for the position and level.
    const rewards = getRaceRewards(getRace('RACE-001')!, result.result.position, result.result.levelAtStart)
    expect(result.result).toMatchObject({ coinsAwarded: rewards.coinsAwarded, grossPrize: rewards.grossPrize, netCoins: rewards.coinsAwarded })
    expect((await call(memory, body)).body).toMatchObject({ ok: true, duplicate: true })
    expect((await call(memory, { ...body, operationId: op(4), baseVersion: 3 })).body).toMatchObject({ ok: false })
    expect(memory.stateOf('ana').coins).toBe(result.result.coinsAwarded)
  })

  it('acts only on the signed-in player\'s career', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(100))
    memory.seed('leo', rich(100))
    await call(memory, { action: 'buy', operationId: op(1), itemId: 'poles', price: 25 }, 'leo')
    expect(memory.stateOf('ana').coins).toBe(100)
    expect((await call(memory, { action: 'buy', operationId: op(1), itemId: 'poles', price: 25 }, 'ana')).status).toBe(403)
    expect((await handleCareerOp(null, { action: 'buy', operationId: op(2), baseVersion: 1, itemId: 'poles', price: 25 }, deps(memory))).status).toBe(401)
    expect(memory.stateOf('ana').coins).toBe(100)
  })
})
