import { describe, expect, it } from 'vitest'
import { defaultAppearance } from '../domain/athlete/appearance'
import type { GameState } from '../game-engine/gameState'
import { allocateAttributePoint } from '../game-engine/attributes'
import { enterRace, raceCurrentDay } from '../game-engine/races'
import { execute, newGame, onSunday, T0, withAthlete } from '../test/gameFixtures'
import { M1_SAVE } from '../test/legacySaves'
import { createLocalStorageGameRepository, LEGACY_DEFAULT_SEX, SAVE_KEY, SCHEMA_VERSION } from './gameRepository'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const ENTRY = {
  id: 'entry-1',
  raceId: 'RACE-001',
  entryType: 'free',
  feePaid: 0,
  levelAtEntry: 1,
  enteredAt: 0,
  status: 'pending',
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

  it('round-trips the cosmetic sex and name', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = newGame('endurance', T0, { name: 'Leo', sex: 'male' })
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
  })

  it('loads a v2 career saved before the sex field existed, as male, without rewriting it', () => {
    const state = progressedState(3)
    const athleteWithoutSex: Partial<GameState['athlete']> = { ...state.athlete }
    delete athleteWithoutSex.sex
    delete athleteWithoutSex.appearance
    const raw = saveOf({ ...state, athlete: athleteWithoutSex })
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    const result = createLocalStorageGameRepository(storage).load(T0)
    expect(LEGACY_DEFAULT_SEX).toBe('male')
    expect(result).toEqual({
      status: 'loaded',
      state: { ...state, athlete: { ...state.athlete, sex: 'male', appearance: defaultAppearance('male') } },
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('loads a career saved before appearance existed with the default appearance, without rewriting it', () => {
    const state = progressedState(3)
    const athleteWithoutAppearance: Partial<GameState['athlete']> = { ...state.athlete, sex: 'male' }
    delete athleteWithoutAppearance.appearance
    const raw = saveOf({ ...state, athlete: athleteWithoutAppearance })
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    const result = createLocalStorageGameRepository(storage).load(T0)
    expect(result).toEqual({
      status: 'loaded',
      state: { ...state, athlete: { ...state.athlete, sex: 'male', appearance: defaultAppearance('male') } },
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('loads a career saved before races existed with the starting 25 coins and no entries, without rewriting it', () => {
    const state = progressedState(2)
    const withoutRaces: Partial<GameState> = { ...state }
    delete withoutRaces.coins
    delete withoutRaces.raceEntries
    const raw = saveOf(withoutRaces)
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({
      status: 'loaded',
      state: { ...state, coins: 25, raceEntries: [] },
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('round-trips coins and race entries', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    // Level 11: Ridge Runner's standard fee (50).
    const entered = enterRace({ ...withAthlete(newGame(), { xp: 3_250 }), coins: 300 }, 'RACE-004', 50, T0)
    if (!entered.ok) throw new Error(entered.error)
    repo.save(entered.state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state: entered.state })
  })

  it.each([
    ['negative coins', { coins: -1 }],
    ['fractional coins', { coins: 1.5 }],
    ['entries that are not a list', { raceEntries: {} }],
    ['an unknown race', { raceEntries: [{ ...ENTRY, raceId: 'RACE-999' }] }],
    ['an unknown entry type', { raceEntries: [{ ...ENTRY, entryType: 'vip' }] }],
    ['a duplicated entry id', { raceEntries: [ENTRY, { ...ENTRY, raceId: 'RACE-002' }] }],
    ['two pending entries for one race', { raceEntries: [ENTRY, { ...ENTRY, id: 'entry-2' }] }],
  ])('rejects %s as invalid data', (_, overrides) => {
    const raw = saveOf({ ...newGame(), ...overrides })
    expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0)).toEqual({
      status: 'incompatible',
      reason: 'malformed',
    })
  })

  it('round-trips a raced day with its finished entry and result', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const entered = enterRace(newGame(), 'RACE-001', 0, T0)
    if (!entered.ok) throw new Error(entered.error)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0 + 1000)
    if (!raced.ok) throw new Error(raced.error)
    repo.save(raced.value.state)
    expect(repo.load(T0 + 1000)).toEqual({ status: 'loaded', state: raced.value.state })
  })

  it('rejects inconsistent race results', () => {
    const entered = enterRace(newGame(), 'RACE-001', 0, T0)
    if (!entered.ok) throw new Error(entered.error)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0 + 1000)
    if (!raced.ok) throw new Error(raced.error)
    // The race ended the week; put a race-day outcome in the current week to test its link too.
    const after = raced.value.state
    const state = {
      ...after,
      week: {
        ...after.week,
        currentDayIndex: 1,
        days: after.week.days.map((d, i) =>
          i === 0 ? { ...d, outcome: { xpGained: 0, fitnessChange: 0, fatigueChange: 10, raceEntryId: 'entry-1' } } : d,
        ),
      },
    }
    expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: saveOf(state) })).load(T0).status).toBe('loaded')
    const finished = state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    const variants: unknown[] = [
      // Net coins that do not match the fee paid.
      { ...state, raceEntries: [{ ...finished, result: { ...finished.result, netCoins: finished.result.netCoins + 1 } }] },
      // A finished entry without its result.
      { ...state, raceEntries: [{ ...finished, result: undefined }] },
      // A race day pointing to a pending entry.
      { ...state, raceEntries: [{ ...finished, status: 'pending', result: undefined }] },
      // A race day pointing to an entry that does not exist.
      { ...state, raceEntries: [] },
      // A position outside the field.
      { ...state, raceEntries: [{ ...finished, result: { ...finished.result, position: 51 } }] },
    ]
    for (const variant of variants) {
      const raw = saveOf(variant)
      expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0)).toEqual({
        status: 'incompatible',
        reason: 'malformed',
      })
    }
  })

  it('round-trips a chosen appearance', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = newGame('climber', T0, {
      name: 'Ana',
      sex: 'female',
      appearance: { hair: 'natural', skin: 'tone-3', outfit: 'white-tshirt' },
    })
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
  })

  it.each([
    ['not an object', 'braid'],
    ['unknown values', { hair: 'mohawk', skin: 'blue', outfit: 'tuxedo' }],
    ['Stage A placeholder values', { hair: 'curly', skin: 'tone-2', outfit: 'basic' }],
  ])('never rejects a career for an invalid appearance (%s): it uses the defaults', (_, appearance) => {
    const state = newGame()
    const raw = saveOf({ ...state, athlete: { ...state.athlete, appearance } })
    const result = createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0)
    expect(result.status).toBe('loaded')
    const loaded = result.status === 'loaded' ? result.state.athlete.appearance : null
    expect(loaded).toEqual({ hair: 'natural', skin: 'tone-2', outfit: 'none' })
  })

  it('loads a career saved before equipment existed with nothing equipped, without rewriting it', () => {
    const state = progressedState(2)
    const withoutEquipment: Partial<GameState> = { ...state }
    delete withoutEquipment.equipment
    const raw = saveOf(withoutEquipment)
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({ status: 'loaded', state: { ...state, equipment: [] } })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('loads a career saved before the shop existed owning the starter shoes, and rejects inconsistent ownership', () => {
    const state = progressedState(1)
    const withoutOwned: Partial<GameState> = { ...state }
    delete withoutOwned.ownedEquipment
    expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: saveOf(withoutOwned) })).load(T0)).toEqual({
      status: 'loaded',
      state: { ...state, ownedEquipment: ['starter-shoes'] },
    })
    for (const variant of [
      { ...newGame(), ownedEquipment: ['poles'] }, // starting equipment missing
      { ...newGame(), ownedEquipment: ['starter-shoes', 'starter-shoes'] },
      { ...newGame(), ownedEquipment: ['starter-shoes', 'jetpack'] },
      { ...newGame(), equipment: ['poles'] }, // equipped but not owned
    ]) {
      expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: saveOf(variant) })).load(T0)).toEqual({
        status: 'incompatible',
        reason: 'malformed',
      })
    }
  })

  it('round-trips equipped items and rejects unknown or duplicated ones', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = { ...newGame(), equipment: ['starter-shoes'] }
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
    for (const equipment of [['jetpack'], ['starter-shoes', 'starter-shoes'], 'starter-shoes']) {
      const raw = saveOf({ ...newGame(), equipment })
      expect(createLocalStorageGameRepository(memoryStorage({ [SAVE_KEY]: raw })).load(T0)).toEqual({
        status: 'incompatible',
        reason: 'malformed',
      })
    }
  })

  it('round-trips an injury: forced Rest days and the injured outcome', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const injured = execute(withAthlete(newGame(), { fatigue: 95 })).state
    expect(injured.forcedRestDays).toBe(5)
    expect(injured.week.days[0]!.outcome?.injured).toBe(true)
    repo.save(injured)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state: injured })
  })

  it('loads a career saved before the injury rule existed with no forced Rest days', () => {
    const state = progressedState(2)
    const withoutField: Partial<GameState> = { ...state }
    delete withoutField.forcedRestDays
    const raw = saveOf(withoutField)
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({ status: 'loaded', state })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it.each([
    // Default plan: day 3 is Rest, day 2 Intervals; day 0 has no previous day this week.
    ['after a training day', 2, true],
    ['after a Rest day', 3, false],
    ['on Monday (unknown)', 0, false],
    ['on Monday of week 2 (unknown)', 7, false],
  ])('loads a career saved before recovery Rest existed: previous day %s', (_, days, expected) => {
    const state = progressedState(days)
    const withoutField: Partial<GameState> = { ...state }
    delete withoutField.previousDayActive
    const raw = saveOf(withoutField)
    const storage = memoryStorage({ [SAVE_KEY]: raw })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({
      status: 'loaded',
      state: { ...state, previousDayActive: expected },
    })
    expect(storage.data.get(SAVE_KEY)).toBe(raw)
  })

  it('drops the daily-reward field of saves from earlier the same day (lastPlayedDay)', () => {
    const state = progressedState(1)
    const storage = memoryStorage({ [SAVE_KEY]: saveOf({ ...state, lastPlayedDay: '2026-10-30' }) })
    expect(createLocalStorageGameRepository(storage).load(T0)).toEqual({ status: 'loaded', state })
  })

  it('round-trips an attribute above 100 (no upper limit since 30 October 2026)', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = newGame()
    state.athlete.attributes.speed = 120.3
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
  })

  it('round-trips decimal Fitness, attributes trained by sessions and their outcomes (30 October 2026)', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = progressedState(4) // Easy run, Intervals, Rest, Hills
    expect(state.athlete.fitness).toBe(21.75)
    expect(state.athlete.attributes).toMatchObject({ endurance: 16.1, speed: 13.1, climbing: 20.1 })
    expect(state.week.days[0]!.outcome!.attributeGain).toEqual({ attribute: 'endurance', amount: 0.1 })
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
  })

  it('round-trips the previous day and rejects a non-boolean one', () => {
    const repo = createLocalStorageGameRepository(memoryStorage())
    const state = progressedState(2)
    repo.save(state)
    expect(repo.load(T0)).toEqual({ status: 'loaded', state })
    const storage = memoryStorage({ [SAVE_KEY]: saveOf({ ...state, previousDayActive: 'yes' }) })
    expect(createLocalStorageGameRepository(storage).load(T0)).toMatchObject({ status: 'incompatible' })
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
    ['an invalid sex', saveOf({ ...valid, athlete: { ...valid.athlete, sex: 'other' } })],
    ['too many forced Rest days', saveOf({ ...valid, forcedRestDays: 6 })],
    ['negative forced Rest days', saveOf({ ...valid, forcedRestDays: -1 })],
    // Day 4 of the fixture is Hills, so it cannot be a forced Rest day.
    ['a forced Rest day planned as training', saveOf({ ...valid, forcedRestDays: 2 })],
    [
      'a non-boolean injury flag',
      saveOf({
        ...valid,
        week: {
          ...valid.week,
          days: valid.week.days.map((d, i) => (i === 0 ? { ...d, outcome: { ...d.outcome, injured: 'yes' } } : d)),
        },
      }),
    ],
    ['a null sex', saveOf({ ...valid, athlete: { ...valid.athlete, sex: null } })],
    ['fitness above 100', saveOf({ ...valid, athlete: { ...valid.athlete, fitness: 101 } })],
    ['negative fatigue', saveOf({ ...valid, athlete: { ...valid.athlete, fatigue: -1 } })],
    ['non-integer XP', saveOf({ ...valid, athlete: { ...valid.athlete, xp: 'lots' } })],
    ['an attribute below 1', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, speed: 0 } } })],
    ['a missing attribute', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { endurance: 16 } } })],
    ['attributes below the points spent', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, climbing: 10 } } })],
    ['an attribute with 3 decimals', saveOf({ ...valid, athlete: { ...valid.athlete, attributes: { ...valid.athlete.attributes, climbing: 20.125 } } })],
    ['Fitness with 3 decimals', saveOf({ ...valid, athlete: { ...valid.athlete, fitness: 23.125 } })],
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
