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
      result: { shoes: { itemId: 'starter-shoes', durabilityPct: 100, band: { raceStart: 'ok' } } },
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
