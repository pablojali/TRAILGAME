import { describe, expect, it } from 'vitest'
import { createInitialGameState, type GameState } from '../game-engine/gameState'
import { executeCurrentDay } from '../game-engine/training'
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
  let state = createInitialGameState()
  for (let i = 0; i < days; i++) {
    const result = executeCurrentDay(state, { week: state.week.number, dayIndex: state.week.currentDayIndex })
    if (!result.ok) throw new Error(result.error)
    state = result.value.state
  }
  return state
}

function saveOf(state: unknown, schemaVersion: unknown = SCHEMA_VERSION) {
  return JSON.stringify({ schemaVersion, savedAt: '2026-01-01T00:00:00.000Z', state })
}

describe('localStorage game repository', () => {
  it('starts a new demo when nothing is saved', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    expect(repo.load()).toEqual({ state: createInitialGameState(), status: 'new' })
  })

  it('round-trips a saved game with a schema version', () => {
    const storage = memoryStorage()
    const repo = createLocalStorageGameRepository(storage)
    const state = progressedState(3)

    expect(repo.save(state)).toBe(true)
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ schemaVersion: SCHEMA_VERSION })
    expect(repo.load()).toEqual({ state, status: 'loaded' })
  })

  it('round-trips a game in a later week', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = progressedState(9)
    repo.save(state)
    expect(repo.load().state).toEqual(state)
  })

  it('clear removes the saved game', () => {
    const storage = memoryStorage()
    const repo = createLocalStorageGameRepository(storage)
    repo.save(progressedState(2))
    repo.clear()
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(repo.load().status).toBe('new')
  })

  const valid = progressedState(2)
  const invalidSaves: [string, string][] = [
    ['non-JSON text', '{not json'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a missing schema version', JSON.stringify({ state: valid })],
    ['an outdated schema version', saveOf(valid, 0)],
    ['a future schema version', saveOf(valid, SCHEMA_VERSION + 1)],
    ['a missing state', saveOf(undefined)],
    ['fitness above 100', saveOf({ ...valid, athlete: { ...valid.athlete, fitness: 101 } })],
    ['negative fatigue', saveOf({ ...valid, athlete: { ...valid.athlete, fatigue: -1 } })],
    ['non-integer XP', saveOf({ ...valid, athlete: { ...valid.athlete, xp: 'lots' } })],
    ['an unknown archetype', saveOf({ ...valid, athlete: { ...valid.athlete, archetype: 'wizard' } })],
    [
      'a missing attribute',
      saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { endurance: 50 } } }),
    ],
    ['an unknown session', saveOf({ ...valid, week: { ...valid.week, days: valid.week.days.map((d) => ({ ...d, session: 'nap' })) } })],
    ['six days', saveOf({ ...valid, week: { ...valid.week, days: valid.week.days.slice(1) } })],
    ['a current day out of range', saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 7 } })],
    [
      'a completed day without an outcome',
      saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 3 } }),
    ],
    [
      'a future day with an outcome',
      saveOf({ ...valid, week: { ...valid.week, currentDayIndex: 1 } }),
    ],
  ]

  it.each(invalidSaves)('recovers from %s without throwing and clears it', (_, raw) => {
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    const repo = createLocalStorageGameRepository(storage)
    expect(repo.load()).toEqual({ state: createInitialGameState(), status: 'recovered' })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
  })

  it('works without storage', () => {
    const repo = createLocalStorageGameRepository(null)
    expect(repo.load().status).toBe('new')
    expect(repo.save(createInitialGameState())).toBe(false)
    expect(() => repo.clear()).not.toThrow()
  })

  it('reports a failed save and survives a throwing storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const repo = createLocalStorageGameRepository(throwing)
    expect(repo.load().status).toBe('new')
    expect(repo.save(createInitialGameState())).toBe(false)
    expect(() => repo.clear()).not.toThrow()
  })
})
