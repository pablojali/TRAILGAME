import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { newGame, T0 } from '../test/gameFixtures'
import type { CareerOpsStore, CareerRecord } from './careerOps'
import type { MajorStore } from './majorOps'
import type { RaceStore } from './majorOrchestrator'

// Equipment wear on (wear_speed 1), for this file only: the server decides wear, the injury draw and
// the race-entry checks (brief B-6a). The test setup already loaded the engine with wear off, so the
// server is loaded again here with the table changed.
vi.doMock('../data/economy.csv?raw', () => ({ default: 'key,value\ncoins_per_premium,100\nwear_speed,1\n' }))
vi.resetModules()
const { handleCareerOp } = await import('./careerOps')
const { handleMajorOp } = await import('./majorOps')

const NOW = T0 + 3_600_000
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function memoryStore(state: GameState) {
  let record: CareerRecord = { version: 1, schemaVersion: 2, state: JSON.parse(JSON.stringify(state)) }
  const store: CareerOpsStore = {
    load: async () => structuredClone(record),
    operation: async () => null,
    async commit({ state: next, kind, response }) {
      record = { version: record.version + 1, schemaVersion: 2, state: JSON.parse(JSON.stringify(next)) }
      return { status: 'saved', version: record.version, response: { ...(response ?? {}), kind } }
    },
  }
  return { store, state: () => record.state as GameState }
}

const deps = (store: CareerOpsStore) => ({ store, authenticate: async () => 'ana', now: () => NOW })
const shod = (equipment: string[] = ['starter-shoes']): GameState => ({ ...newGame(), equipment })

describe('career-ops with equipment wear on', () => {
  it('wears the equipped shoes on a training day and answers with the gear\'s wear', async () => {
    const memory = memoryStore(shod())
    const response = await handleCareerOp('t', { action: 'train', operationId: op(1), baseVersion: 1, ref: { week: 1, dayIndex: 0 }, session: 'easy-run' }, deps(memory.store))
    expect(response.status).toBe(200)
    expect(memory.state().wear).toEqual({ 'starter-shoes': 0.053333 })
    expect(response.body).toMatchObject({ ok: true, result: { gear: [{ itemId: 'starter-shoes', durabilityPct: 95, remainingKm: 142 }] } })
  })

  it('refuses a race entry with no shoes on, and gives the shoes\' band when entering', async () => {
    const bare = memoryStore(shod([]))
    expect((await handleCareerOp('t', { action: 'enter-race', operationId: op(2), baseVersion: 1, raceId: 'RACE-001' }, deps(bare.store))).body).toMatchObject({
      ok: false,
      error: 'no-shoes-equipped',
    })
    const ready = memoryStore(shod())
    expect((await handleCareerOp('t', { action: 'enter-race', operationId: op(3), baseVersion: 1, raceId: 'RACE-001' }, deps(ready.store))).body).toMatchObject({
      ok: true,
      result: { shoes: { itemId: 'starter-shoes', durabilityPct: 100, band: { raceStart: 'ok' } }, prediction: { lasts: true } },
    })
  })

  it('replaces worn shoes when they are bought again', async () => {
    const memory = memoryStore({ ...shod(['trail-shoes-basic']), ownedEquipment: ['starter-shoes', 'trail-shoes-basic'], coins: 50, wear: { 'trail-shoes-basic': 0.7 } })
    const response = await handleCareerOp('t', { action: 'buy', operationId: op(4), baseVersion: 1, itemId: 'trail-shoes-basic', price: 35 }, deps(memory.store))
    expect(response.status).toBe(200)
    expect(memory.state()).toMatchObject({ coins: 15, equipment: ['trail-shoes-basic'] })
    expect(memory.state().wear).toEqual({})
  })
})

describe('major-ops with equipment wear on', () => {
  it('refuses a Major registration with worn-out shoes', async () => {
    const registered: unknown[] = []
    const store = {
      advance: async () => undefined,
      register: async (...args: unknown[]) => void registered.push(args),
      playerMajors: async () => [],
    } as unknown as MajorStore
    const majorDeps = (career: GameState) => ({
      store,
      race: {} as RaceStore,
      tickAuthorized: false,
      authenticate: async (t: string | null) => t,
      loadCareer: async () => career,
      now: () => NOW,
    })
    const id = '11111111-1111-4111-8111-111111111111'
    const worn = { ...shod(), wear: { 'starter-shoes': 1 } }
    expect((await handleMajorOp('player', { action: 'register', id }, majorDeps(worn))).body).toEqual({ ok: false, error: 'shoes-worn-out' })
    expect(registered).toEqual([])
    expect((await handleMajorOp('player', { action: 'register', id }, majorDeps(shod()))).body).toMatchObject({ ok: true })
    expect(registered).toHaveLength(1)
  })
})

describe('major-ops READY with equipment wear on (owner decision D9)', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  function readyStore() {
    const readies: unknown[] = []
    const store = {
      advance: async () => undefined,
      playerMajors: async () => [{ id, registration: { status: 'REGISTERED', plan: null } }],
      setReady: async (_e: string, _u: string, snapshot: unknown) => void readies.push(snapshot),
    } as unknown as MajorStore
    return { store, readies }
  }
  const majorDeps = (store: MajorStore, career: GameState) => ({
    store,
    race: {} as RaceStore,
    tickAuthorized: false,
    authenticate: async (t: string | null) => t,
    loadCareer: async () => career,
    now: () => NOW,
  })

  it('refuses READY with worn-out shoes, and takes the gear\'s wear into the snapshot otherwise', async () => {
    const worn = readyStore()
    expect((await handleMajorOp('player', { action: 'ready', id }, majorDeps(worn.store, { ...shod(), wear: { 'starter-shoes': 1 } }))).body).toEqual({
      ok: false,
      error: 'shoes-worn-out',
    })
    expect(worn.readies).toEqual([])
    const fine = readyStore()
    await handleMajorOp('player', { action: 'ready', id }, majorDeps(fine.store, { ...shod(), wear: { 'starter-shoes': 0.25 } }))
    expect(fine.readies).toEqual([expect.objectContaining({ equipment: ['starter-shoes'], wear: { speed: 1, used: { 'starter-shoes': 0.25 } } })])
  })
})

describe('career-ops: no equipment changes during a race, with wear on', () => {
  it('refuses equipping while a race is in progress', async () => {
    const racing = { ...shod(), ownedEquipment: ['starter-shoes', 'trail-shoes-basic'], activeRace: {} as GameState['activeRace'] }
    // The engine's own check (the save check would refuse this fake race, so it is called directly).
    const { setItemEquipped } = await import('../game-engine/equipment')
    expect(setItemEquipped(racing as GameState, 'trail-shoes-basic', true)).toEqual({ ok: false, error: 'race-in-progress' })
  })
})

describe('career-ops: withdrawing from a race day whose shoes cannot start (owner decision, 22 November 2026)', () => {
  it('closes the day as Rest and drops the entry; training that day is still refused', async () => {
    const { onSunday, withEntry } = await import('../test/gameFixtures')
    const { state } = withEntry(onSunday({ ...shod(), wear: { 'starter-shoes': 1 } }), 'RACE-001')
    const memory = memoryStore(state)
    const ref = { week: state.week.number, dayIndex: state.week.currentDayIndex }
    const train = await handleCareerOp('t', { action: 'train', operationId: op(10), baseVersion: 1, ref, session: 'rest' }, deps(memory.store))
    expect(train.body).toMatchObject({ ok: false, error: 'race-day' })
    const withdrawn = await handleCareerOp('t', { action: 'withdraw-race', operationId: op(11), baseVersion: 1, ref }, deps(memory.store))
    expect(withdrawn.body).toMatchObject({ ok: true, result: { didNotStart: 'RACE-001', executed: { session: 'rest' } } })
    expect(memory.state().raceEntries).toEqual([])
    expect(memory.state().week.number).toBe(state.week.number + 1)
  })
})
