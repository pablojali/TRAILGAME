import { describe, expect, it } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { allocateAttributePoint } from '../game-engine/attributes'
import { execute, newGame, T0, withAthlete } from '../test/gameFixtures'
import { M1_SAVE } from '../test/legacySaves'
import { createLocalStorageGameRepository, SAVE_KEY, SCHEMA_VERSION } from './gameRepository'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

function progressedState(days: number): GameState {
  let state = newGame('climber')
  for (let i = 0; i < days; i++) state = execute(state, T0 + i * 1000).state
  return state
}

function saveOf(state: unknown, schemaVersion: unknown = SCHEMA_VERSION) {
  return JSON.stringify({ schemaVersion, savedAt: '2026-01-01T00:00:00.000Z', state })
}

describe('localStorage game repository', () => {
  it('reports an empty store without creating a career', () => {
    const storage = memoryStorage()
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({ status: 'empty' })
    expect(storage.data.size).toBe(0)
  })

  it('round-trips a v2 career', () => {
    const storage = memoryStorage()
    const repo = createLocalStorageGameRepository(storage)
    const state = progressedState(3)

    expect(repo.save(state)).toBe(true)
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ schemaVersion: 2 })
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
  })

  it('round-trips spent attribute points and a later week', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const leveled = withAthlete(progressedState(9), { xp: 260 })
    const result = allocateAttributePoint(leveled, 'speed', 0)
    if (!result.ok) throw new Error(result.error)
    repo.save(result.state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state: result.state })
  })

  it('clear removes the saved career', () => {
    const storage = memoryStorage()
    const repo = createLocalStorageGameRepository(storage)
    repo.save(progressedState(2))
    repo.clear()
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(repo.load(T0)).toEqual({ status: 'empty' })
  })

  it('detects an M1 (v1) save and leaves it untouched', () => {
    const storage = memoryStorage({ [SAVE_KEY]: M1_SAVE })
    const repo = createLocalStorageGameRepository(storage)
    expect(repo.load(T0)).toEqual({ status: 'incompatible', reason: 'legacy-v1' })
    expect(storage.data.get(SAVE_KEY)).toBe(M1_SAVE)
  })

  it.each([0, 3, 99, 2.5])('reports schema version %s as unsupported', (version) => {
    const raw = saveOf(progressedState(1), version)
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({
      status: 'incompatible',
      reason: 'unsupported-version',
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  const valid = withAthlete(progressedState(2), { xp: 120, spentAttributePoints: 1 })
  valid.athlete.attributes.speed += 1
  const malformed: [string, string][] = [
    ['non-JSON text', '{not json'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a missing schema version', JSON.stringify({ state: valid })],
    ['a string schema version', saveOf(valid, '2')],
    ['a missing state', saveOf(undefined)],
    ['an M1-shaped state under v2', saveOf(JSON.parse(M1_SAVE).state)],
    ['an unknown profile', saveOf({ ...valid, athlete: { ...valid.athlete, profile: 'ultrarunner' } })],
    ['fitness above 100', saveOf({ ...valid, athlete: { ...valid.athlete, fitness: 101 } })],
    ['negative fatigue', saveOf({ ...valid, athlete: { ...valid.athlete, fatigue: -1 } })],
    ['non-integer XP', saveOf({ ...valid, athlete: { ...valid.athlete, xp: 'lots' } })],
    ['an attribute below 1', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, speed: 0 } } })],
    ['an attribute above 100', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, speed: 101 } } })],
    ['a missing attribute', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { endurance: 16 } } })],
    ['attributes that do not match points spent', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, climbing: 25 } } })],
    ['more points spent than earned', saveOf({ ...valid, athlete: { ...valid.athlete, spentAttributePoints: 3 } })],
    ['negative points spent', saveOf({ ...valid, athlete: { ...valid.athlete, spentAttributePoints: -1 } })],
    ['an unknown session', saveOf({ ...valid, week: { ...valid.week, days: valid.week.days.map((d) => ({ ...d, session: 'nap' })) } })],
    ['six days', saveOf({ ...valid, week: { ...valid.week, days: valid.week.days.slice(1) } })],
    ['a current day out of range', saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 7 } })],
    ['a completed day without an outcome', saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 3 } })],
    ['a future day with an outcome', saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 1 } })],
  ]

  it.each(malformed)('reports %s as malformed without deleting it', (_, raw) => {
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({
      status: 'incompatible',
      reason: 'malformed',
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('accepts the valid fixture used for the malformed cases', () => {
    const repo = createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: saveOf(valid) }))
    expect(repo.load(T0).status).toBe('loaded')
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', '2026-01-01'],
  ])('replaces a %s decay reference with the load time', (_, reference) => {
    const raw = saveOf({ ...valid, fitnessDecayReference: reference })
    const result = createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0 + 5)
    expect(result).toMatchObject({ status: 'loaded', state: { fitnessDecayReference: T0 + 5 } })
  })

  it('keeps a future decay reference for the decay rule to handle', () => {
    const raw = saveOf({ ...valid, fitnessDecayReference: T0 + 1e9 })
    const result = createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0)
    expect(result).toMatchObject({ status: 'loaded', state: { fitnessDecayReference: T0 + 1e9 } })
  })

  it('works without storage', () => {
    const repo = createLocalStorageGameRepository(null)
    expect(repo.load(T0)).toEqual({ status: 'empty' })
    expect(repo.save(newGame())).toBe(false)
    expect(() => repo.clear()).not.toThrow()
  })

  it('reports a failed save and survives a throwing storage', () => {
    const fail = () => {
      throw new Error('blocked')
    }
    const repo = createLocalStorageGameRepository({ getItem: fail, setItem: fail, removeItem: fail })
    expect(repo.load(T0)).toEqual({ status: 'empty' })
    expect(repo.save(newGame())).toBe(false)
    expect(() => repo.clear()).not.toThrow()
  })
})
