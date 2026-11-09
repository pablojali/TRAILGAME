import { describe, expect, it } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { executeCurrentDay } from '../game-engine/training'
import { applyFitnessDecay } from '../game-engine/fitnessDecay'
import { execute, newGame, onSunday, T0, withAthlete, withEntry } from '../test/gameFixtures'
import { getRace } from '../domain/races/races'
import { getRaceRewards, raceCurrentDay } from '../game-engine/races'
import { getEditionField } from '../game-engine/raceEngine'
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
    const sunday = onSunday(withAthlete(newGame(), { xp: 100 }))
    const entered = withEntry(sunday, 'RACE-001')
    memory.seed('ana', entered.state)
    const start = { action: 'race-start', operationId: op(5), baseVersion: 1, ref: ref(sunday), entryId: entered.entry.id, intensity: 'target', gel: false, bar: false }
    expect((await handleCareerOp('token-ana', start, deps(memory))).body).toMatchObject({ ok: true })
    const step = { action: 'race-step', operationId: op(6), baseVersion: 2, segment: 1, stop: 'normal', intensity: 'target' }
    const response = await handleCareerOp('token-ana', step, deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    const finished = response.body.state.raceEntries[0]!
    expect(finished.status).toBe('finished')
    expect(response.body.state.athlete.xp).toBeGreaterThan(0)
    expect((await handleCareerOp('token-ana', step, deps(memory))).body).toMatchObject({ ok: true, duplicate: true })
    expect(memory.commits()).toBe(2)
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

  it('a sync save takes the plan for today and the rest of the week, never completed days', async () => {
    const memory = memoryStore()
    const career = execute(newGame()).state // Monday done, today is Tuesday
    memory.seed('ana', career, 4)
    const days = career.week.days.map((d, i) => (i === 0 ? { ...d, session: 'long-run' as const } : i >= 3 ? { ...d, session: 'rest' as const } : d))
    const response = await handleCareerOp('token-ana', { action: 'save', baseVersion: 4, snapshot: { ...career, week: { ...career.week, days } } }, deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.state.week.days.map((d) => d.session)).toEqual(['easy-run', 'intervals', 'rest', 'rest', 'rest', 'rest', 'rest'])
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

  it('a new career is an All-rounder built by the server from the identity, and replaces only the version seen', async () => {
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
    // An older client still asking for a profile gets the All-rounder, every attribute at 16.
    expect(response.body.state.athlete).toMatchObject({
      profile: 'all-rounder',
      xp: 0,
      name: 'Ana',
      attributes: { endurance: 16, climbing: 16, speed: 16, technical: 16, recovery: 16, consistency: 16 },
    })
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

  it('sells gel and cereal bar packs once per operation, refusing a wrong price or equipping them', async () => {
    const memory = memoryStore()
    memory.seed('ana', rich(25))
    expect((await call(memory, { action: 'buy', operationId: op(1), itemId: 'energy-gel', price: 0 })).body).toMatchObject({ ok: false, error: 'price-changed' })
    const first = await call(memory, { action: 'buy', operationId: op(2), itemId: 'energy-gel', price: 10 })
    expect(first.body).toMatchObject({ ok: true, state: { coins: 15, consumables: { gel: 3, bar: 0 } } })
    // The same operation again is replayed, never charged twice.
    const replay = await call(memory, { action: 'buy', operationId: op(2), itemId: 'energy-gel', price: 10 })
    expect(replay.body).toMatchObject({ ok: true, state: { coins: 15, consumables: { gel: 3, bar: 0 } } })
    await call(memory, { action: 'buy', operationId: op(3), itemId: 'cereal-bar', price: 10 })
    expect(memory.stateOf('ana')).toMatchObject({ coins: 5, consumables: { gel: 3, bar: 3 }, ownedEquipment: ['starter-shoes'] })
    expect((await call(memory, { action: 'equip', operationId: op(4), itemId: 'energy-gel', equipped: true })).body).toMatchObject({ ok: false, error: 'consumable' })
    expect(memory.commits()).toBe(2)
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
    // Level 1: Pine Loop Challenge opens at Level 3, Ridge Runner at 6.
    expect((await call(memory, { action: 'enter-race', operationId: op(1), raceId: 'RACE-003' })).body).toMatchObject({ ok: false, error: 'level-too-low' })
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
    const decisions = { intensity: 'target', gel: false, bar: false }
    expect(
      (await call(memory, { action: 'race-start', operationId: op(1), ref: ref(sunday), entryId: forged.entry.id, snapshot: forged.state, ...decisions })).body,
    ).toMatchObject({ ok: false, error: 'unknown-entry' })
    // Entered on the server, then raced: the prize is the engine's, paid once.
    const entered = await call(memory, { action: 'enter-race', operationId: op(2), raceId: 'RACE-001' })
    if (!entered.body.ok) throw new Error(entered.body.error)
    const entryId = entered.body.state.raceEntries[0]!.id
    expect((await call(memory, { action: 'race-start', operationId: op(3), ref: ref(sunday), entryId, baseVersion: 2, ...decisions })).body).toMatchObject({ ok: true })
    const body = { action: 'race-step', operationId: op(4), segment: 1, stop: 'normal', intensity: 'target', baseVersion: 3 }
    const raced = await call(memory, body)
    if (!raced.body.ok) throw new Error(raced.body.error)
    const result = raced.body.state.raceEntries[0]!
    if (result.status !== 'finished') throw new Error('not finished')
    expect(raced.body.state.coins).toBe(result.result.coinsAwarded)
    // Prizes unchanged by free entry: the engine's catalog prizes for the position and level.
    const rewards = getRaceRewards(getRace('RACE-001')!, result.result.position, result.result.levelAtStart)
    expect(result.result).toMatchObject({ coinsAwarded: rewards.coinsAwarded, grossPrize: rewards.grossPrize, netCoins: rewards.coinsAwarded })
    expect((await call(memory, body)).body).toMatchObject({ ok: true, duplicate: true })
    expect((await call(memory, { ...body, operationId: op(5), baseVersion: 4 })).body).toMatchObject({ ok: false, error: 'no-race-in-progress' })
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

describe('career-ops: races step by step on the server (Race Engine V1)', () => {
  /** A level-2 runner on race Sunday with a free entry for Forest First Steps (2 segments), as the server holds it. */
  function sundayEntry(overrides: Partial<GameState['athlete']> = {}, consumables = { gel: 1, bar: 1 }) {
    const made = withEntry(withAthlete(newGame(), { xp: 100, ...overrides }), 'RACE-001')
    const entry = { ...made.entry, entryType: 'free' as const }
    return { state: { ...onSunday({ ...made.state, raceEntries: [entry] }), coins: 5, consumables }, entry }
  }
  const startBody = (n: number, career: GameState, entryId: string, extra: Record<string, unknown> = {}) => ({
    action: 'race-start',
    operationId: op(n),
    baseVersion: 1,
    ref: ref(career),
    entryId,
    intensity: 'target',
    gel: false,
    bar: false,
    ...extra,
  })
  const stepBody = (n: number, baseVersion: number, extra: Record<string, unknown> = {}) => ({
    action: 'race-step',
    operationId: op(n),
    baseVersion,
    segment: 1,
    stop: 'normal',
    intensity: 'target',
    ...extra,
  })
  /** What the engine gives with the default plan on the server's career (decay applied, as the server does). */
  function engineResult(career: GameState, entryId: string) {
    const expected = raceCurrentDay(applyFitnessDecay(career, NOW).state, ref(career), entryId, NOW)
    if (!expected.ok) throw new Error(expected.error)
    return expected.value
  }
  async function race(memory: ReturnType<typeof memoryStore>, career: GameState, entryId: string, user = 'ana') {
    const started = await handleCareerOp(`token-${user}`, startBody(1, career, entryId), deps(memory))
    if (!started.body.ok) throw new Error(started.body.error)
    return handleCareerOp(`token-${user}`, stepBody(2, started.body.version), deps(memory))
  }

  it('runs the first segment at the start and keeps the race in progress on the server, awarding nothing yet', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const response = await handleCareerOp('token-ana', startBody(1, state, entry.id, { intensity: 'hard', gel: true }), deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    const stored = memory.stateOf('ana')
    expect(stored.activeRace).toMatchObject({ entryId: entry.id, nutrition: { gel: true, bar: false }, splits: [{ intensity: 'hard' }] })
    expect(stored.consumables).toEqual({ gel: 0, bar: 1 })
    expect(stored).toMatchObject({ coins: 5, athlete: { xp: 100 }, week: { currentDayIndex: 6 } })
    expect(stored.raceEntries[0]!.status).toBe('pending')
    expect(response.body.result).toEqual({ finished: false })
  })

  it('finishes with the engine on the server\'s career: result, XP, coins, Fitness, Fatigue, history', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const response = await race(memory, state, entry.id)
    if (!response.body.ok) throw new Error(response.body.error)
    const expected = engineResult(state, entry.id)
    expect(response.body.state).toEqual(expected.state)
    expect(memory.stateOf('ana')).toEqual(expected.state)
    expect(response.body.result).toMatchObject({ finished: true, levelBefore: expected.levelBefore, levelAfter: expected.levelAfter })
    const finished = response.body.state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    expect(finished.result).toEqual(expected.entry.result)
    expect(response.body.state.coins).toBe(5 + expected.entry.result.coinsAwarded)
    expect(response.body.state.athlete.xp).toBe(100 + expected.entry.result.xpAwarded)
    expect(response.body.state.athlete.fatigue).toBe(state.athlete.fatigue + expected.entry.result.fatigueChange)
    expect(response.body.state.activeRace).toBeNull()
    // Sunday's race completes the week: the next week starts.
    expect(response.body.state.week).toMatchObject({ number: 2, currentDayIndex: 0 })
  })

  it('ranks the runner among the NPC rivals computed by the server, aid-station stops included', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const response = await race(memory, state, entry.id)
    if (!response.body.ok) throw new Error(response.body.error)
    const finished = response.body.state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    const { result } = finished
    // This edition's rivals: the race's field on their form of the day, fixed by the entry and the start.
    expect(result.rivalTimesS).toEqual(getEditionField(getRace('RACE-001')!, `RACE-001|${entry.id}|${result.startedAt}`).rivalFinishS)
    expect(result.position).toBe(1 + result.rivalTimesS!.filter((t) => t < result.timeS).length)
    expect(result.fieldSize).toBe(30)
  })

  it('refuses races that are not registered, not today, already run or unknown, changing nothing', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const run = (body: Record<string, unknown>) => handleCareerOp('token-ana', body, deps(memory))
    expect((await run(startBody(1, state, 'entry-9'))).body).toMatchObject({ ok: false, error: 'unknown-entry' })
    expect((await run(startBody(2, state, 'RACE-999'))).body).toMatchObject({ ok: false, error: 'unknown-entry' })
    expect((await run(startBody(3, state, entry.id, { ref: { week: 1, dayIndex: 3 } }))).body).toMatchObject({ ok: false, error: 'day-completed' })
    expect((await run(stepBody(4, 1))).body).toMatchObject({ ok: false, error: 'no-race-in-progress' })
    // Monday: entered, but races are run on Sundays.
    const monday = withEntry(withAthlete(newGame(), { xp: 100 }), 'RACE-001')
    memory.seed('leo', monday.state)
    expect((await handleCareerOp('token-leo', startBody(5, monday.state, monday.entry.id), deps(memory))).body).toMatchObject({
      ok: false,
      error: 'not-race-day',
    })
    expect(memory.commits()).toBe(0)
    expect(memory.stateOf('ana')).toEqual(JSON.parse(JSON.stringify(state)))
    // Started once; a second start (new operation id) is refused; after the finish, already run.
    expect((await run(startBody(6, state, entry.id))).body).toMatchObject({ ok: true })
    expect((await run(startBody(7, state, entry.id, { baseVersion: 2 }))).body).toMatchObject({ ok: false, error: 'race-in-progress' })
    expect((await run(stepBody(8, 2))).body).toMatchObject({ ok: true })
    expect((await run(startBody(9, state, entry.id, { baseVersion: 3 }))).body).toMatchObject({ ok: false })
    expect(memory.commits()).toBe(2)
  })

  it('refuses a free entry below the race\'s minimum level; entries paid under the earlier rules still run', async () => {
    const memory = memoryStore()
    // Level 2 holding a free entry for Ridge Runner (opens at Level 6): only reachable by tampering.
    const made = withEntry(withAthlete(newGame(), { xp: 100 }), 'RACE-004')
    const freeEntry = { ...made.entry, entryType: 'free' as const }
    const low = { state: { ...made.state, raceEntries: [freeEntry] }, entry: freeEntry }
    memory.seed('ana', onSunday(low.state))
    expect((await handleCareerOp('token-ana', startBody(1, onSunday(low.state), low.entry.id), deps(memory))).body).toMatchObject({
      ok: false,
      error: 'level-too-low',
    })
    const paid = { ...low.entry, entryType: 'early' as const, feePaid: 125 }
    const legacy = onSunday({ ...low.state, raceEntries: [paid] })
    memory.seed('leo', legacy)
    expect((await handleCareerOp('token-leo', startBody(2, legacy, paid.id), deps(memory))).body).toMatchObject({ ok: true })
  })

  it('accepts decisions only: unknown or malformed decisions are refused, nothing changes', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const run = (body: Record<string, unknown>) => handleCareerOp('token-ana', body, deps(memory))
    for (const extra of [{ intensity: 7 }, { gel: 'yes' }, { bar: undefined }, { ref: 'sunday' }]) {
      expect((await run(startBody(1, state, entry.id, extra))).status).toBe(400)
    }
    expect((await run(startBody(2, state, entry.id, { intensity: 'sprint' }))).body).toMatchObject({ ok: false, error: 'unknown-intensity' })
    expect((await run(startBody(3, state, entry.id, { strategy: 'aggressive', intensity: 'flat-out' }))).body).toMatchObject({ ok: false, error: 'unknown-intensity' })
    expect(memory.commits()).toBe(0)
    expect((await run(startBody(4, state, entry.id))).body).toMatchObject({ ok: true })
    for (const extra of [{ segment: 1.5 }, { stop: 3 }, { intensity: null }]) {
      expect((await run(stepBody(5, 2, extra))).status).toBe(400)
    }
    expect((await run(stepBody(6, 2, { stop: 'nap' }))).body).toMatchObject({ ok: false, error: 'unknown-stop' })
    expect((await run(stepBody(7, 2, { segment: 2 }))).body).toMatchObject({ ok: false, error: 'wrong-segment' })
    expect(memory.commits()).toBe(1)
  })

  it('takes the gel and bar from the server\'s stock, never the client\'s', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry({}, { gel: 0, bar: 0 })
    memory.seed('ana', state)
    const forged = { ...state, consumables: { gel: 9, bar: 9 } }
    expect((await handleCareerOp('token-ana', startBody(1, state, entry.id, { gel: true, snapshot: forged }), deps(memory))).body).toMatchObject({
      ok: false,
      error: 'no-gel',
    })
    expect((await handleCareerOp('token-ana', startBody(2, state, entry.id, { bar: true, snapshot: forged }), deps(memory))).body).toMatchObject({
      ok: false,
      error: 'no-bar',
    })
    expect(memory.commits()).toBe(0)
  })

  it('ignores a fabricated position, time, rewards, attributes and equipment sent by the client', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const forged: GameState = {
      ...withAthlete(state, { xp: 50_000, fitness: 100, fatigue: 0, attributes: { ...state.athlete.attributes, speed: 999, endurance: 999 } }),
      coins: 99_999,
      ownedEquipment: ['starter-shoes', 'trail-shoes-light'],
      equipment: ['trail-shoes-light'],
      raceEntries: [{ ...entry, status: 'finished', result: { position: 1, timeS: 1 } } as never],
    }
    const fake = { snapshot: forged, position: 1, timeS: 60, coinsAwarded: 9_999, xpAwarded: 9_999, result: { position: 1 }, elapsedS: 1, fatigue: 0 }
    const started = await handleCareerOp('token-ana', startBody(1, state, entry.id, fake), deps(memory))
    if (!started.body.ok) throw new Error(started.body.error)
    // A forged race in progress in the snapshot is ignored too.
    const forgedActive = { ...started.body.state, activeRace: { ...started.body.state.activeRace!, elapsedS: 1, inRaceFatigue: 0 } }
    const response = await handleCareerOp('token-ana', stepBody(2, started.body.version, { ...fake, snapshot: forgedActive }), deps(memory))
    if (!response.body.ok) throw new Error(response.body.error)
    const expected = engineResult(state, entry.id)
    expect(response.body.state).toEqual(expected.state)
    const finished = response.body.state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    expect(finished.result.equipment).toEqual([])
    expect(finished.result.attributes.speed).toBe(state.athlete.attributes.speed)
  })

  it('applies each step once: a repeated request, or two at once, run it and pay it once', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const start = startBody(1, state, entry.id)
    expect((await handleCareerOp('token-ana', start, deps(memory))).body).toMatchObject({ ok: true })
    expect((await handleCareerOp('token-ana', start, deps(memory))).body).toMatchObject({ ok: true, duplicate: true })
    const step = stepBody(2, 2)
    const first = await handleCareerOp('token-ana', step, deps(memory))
    const again = await handleCareerOp('token-ana', step, deps(memory))
    expect(again.body).toMatchObject({ ok: true, duplicate: true })
    if (!first.body.ok || !again.body.ok) throw new Error('failed')
    expect(again.body.state.coins).toBe(first.body.state.coins)
    expect(memory.commits()).toBe(2)

    // Two starts and two steps at once (different operation ids): each applied once.
    const memory2 = memoryStore()
    memory2.seed('ana', state)
    const starts = await Promise.all([
      handleCareerOp('token-ana', startBody(1, state, entry.id), deps(memory2)),
      handleCareerOp('token-ana', startBody(2, state, entry.id, { intensity: 'hard' }), deps(memory2)),
    ])
    expect(starts.map((r) => r.body.ok).sort()).toEqual([false, true])
    const steps = await Promise.all([
      handleCareerOp('token-ana', stepBody(3, 2), deps(memory2)),
      handleCareerOp('token-ana', stepBody(4, 2, { stop: 'slow' }), deps(memory2)),
    ])
    expect(steps.map((r) => r.body.ok).sort()).toEqual([false, true])
    expect(memory2.commits()).toBe(2)
    const finished = memory2.stateOf('ana').raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    expect(memory2.stateOf('ana').coins).toBe(5 + finished.result.coinsAwarded)
  })

  it('recomputes on a version conflict (another write landed first) and applies the step once', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const started = await handleCareerOp('token-ana', startBody(1, state, entry.id), deps(memory))
    if (!started.body.ok) throw new Error(started.body.error)
    const inRace = started.body.state
    // Another device saves (a new look) between the step's read and its commit.
    const store: CareerOpsStore = {
      ...memory.store,
      commit: (() => {
        let interfered = false
        return async (input) => {
          if (!interfered) {
            interfered = true
            memory.seed('ana', { ...inRace, athlete: { ...inRace.athlete, name: 'Ana B.' } }, 3)
          }
          return memory.store.commit(input)
        }
      })(),
    }
    const response = await handleCareerOp('token-ana', stepBody(2, 2), { ...deps(memory), store })
    if (!response.body.ok) throw new Error(response.body.error)
    expect(response.body.version).toBe(4)
    expect(response.body.state.athlete.name).toBe('Ana B.')
    expect(response.body.state.raceEntries[0]!.status).toBe('finished')
    expect(memory.commits()).toBe(2)
  })

  it('keeps the injury outcome: minimum XP, −15 Fitness, 5 forced rest days, prize still paid', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry({ fatigue: 90, fitness: 40 })
    memory.seed('ana', state)
    const response = await race(memory, state, entry.id)
    if (!response.body.ok) throw new Error(response.body.error)
    const finished = response.body.state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    expect(finished.result).toMatchObject({ injured: true, xpAwarded: 18, fitnessChange: -15 })
    expect(response.body.state).toMatchObject({ forcedRestDays: 5, coins: 5 + finished.result.coinsAwarded, athlete: { xp: 118 } })
  })

  it('no longer runs a race in one request: the old operation is a bad request', async () => {
    const memory = memoryStore()
    const { state, entry } = sundayEntry()
    memory.seed('ana', state)
    const response = await handleCareerOp('token-ana', { action: 'race', operationId: op(1), baseVersion: 1, ref: ref(state), entryId: entry.id }, deps(memory))
    expect(response).toMatchObject({ status: 400, body: { ok: false, error: 'bad-request' } })
    expect(memory.commits()).toBe(0)
  })
})
