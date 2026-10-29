import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '../domain/economy/coins'
import { getRace, RACES } from '../domain/races/races'
import { currentRef, execute, newGame, onSunday, T0, withAthlete, withSession } from '../test/gameFixtures'
import type { GameState } from './gameState'
import {
  enterRace,
  getPendingEntry,
  getPrizeBand,
  getRaceFatigue,
  getRaceRewards,
  getStandings,
  previewRaceDay,
  raceCurrentDay,
} from './races'
import { getRaceWeek, getScheduledEntry, isRaceDayToday } from './raceSchedule'
import { rivalTimes, simulateRace } from './raceSimulation'
import { executeCurrentDay, planSession } from './training'

/** Level 11 (Ridge Runner's recommended level) needs 3,250 XP. */
function atLevel11(coins: number): GameState {
  return { ...withAthlete(newGame(), { xp: 3_250, spentAttributePoints: 0 }), coins }
}

describe('enterRace', () => {
  it('starts a new career with 25 coins and no entries (owner decision)', () => {
    expect(STARTING_COINS).toBe(25)
    expect(newGame()).toMatchObject({ coins: 25, raceEntries: [] })
  })

  it('enters a free Open race without changing the balance', () => {
    const result = enterRace(newGame(), 'RACE-001', 0, T0 + 5)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.coins).toBe(25)
    expect(result.entry).toEqual({
      id: 'entry-1',
      raceId: 'RACE-001',
      entryType: 'free',
      feePaid: 0,
      levelAtEntry: 1,
      enteredAt: T0 + 5,
      status: 'pending',
    })
    expect(getPendingEntry(result.state, 'RACE-001')).toEqual(result.entry)
  })

  it('charges the standard fee exactly once', () => {
    const first = enterRace(atLevel11(500), 'RACE-004', 50, T0)
    if (!first.ok) throw new Error(first.error)
    expect(first.state.coins).toBe(450)
    expect(first.entry).toMatchObject({ entryType: 'standard', feePaid: 50, levelAtEntry: 11 })
    // A repeated confirmation (double tap, reload) is rejected and charges nothing.
    expect(enterRace(first.state, 'RACE-004', 50, T0)).toEqual({ ok: false, error: 'already-entered' })
  })

  it('charges the early-entry fee below the recommended level, and allows one race per week', () => {
    const first = enterRace(atLevel11(1000), 'RACE-006', 125, T0)
    if (!first.ok) throw new Error(first.error)
    expect(first.entry).toMatchObject({ entryType: 'early', feePaid: 125 })
    expect(first.state.coins).toBe(875)
    // Races are run on Sundays, one per week: a second entry waits until this one is run.
    expect(enterRace(first.state, 'RACE-007', 300, T0)).toEqual({ ok: false, error: 'race-scheduled' })
  })

  it('rejects entry without enough coins and never makes the balance negative', () => {
    const state = atLevel11(49)
    expect(enterRace(state, 'RACE-004', 50, T0)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(enterRace(newGame(), 'RACE-012', 700, T0)).toEqual({ ok: false, error: 'insufficient-coins' })
  })

  it('rejects a fee that no longer applies, and unknown races', () => {
    expect(enterRace(atLevel11(500), 'RACE-004', 125, T0)).toEqual({ ok: false, error: 'fee-changed' })
    expect(enterRace(newGame(), 'RACE-999', 0, T0)).toEqual({ ok: false, error: 'unknown-race' })
  })

  it('does not change athlete, training or decay values', () => {
    const state = atLevel11(500)
    const result = enterRace(state, 'RACE-004', 50, T0 + 1000)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.athlete).toEqual(state.athlete)
    expect(result.state.week).toEqual(state.week)
    expect(result.state.fitnessDecayReference).toBe(state.fitnessDecayReference)
    expect(result.state.forcedRestDays).toBe(state.forcedRestDays)
  })

  it('keeps coins and entries when a training day is completed', () => {
    const entered = enterRace(atLevel11(500), 'RACE-004', 50, T0)
    if (!entered.ok) throw new Error(entered.error)
    const after = execute(entered.state).state
    expect(after.coins).toBe(450)
    expect(after.raceEntries).toEqual(entered.state.raceEntries)
  })
})

describe('raceCurrentDay', () => {
  const DAY = 24 * 60 * 60 * 1000

  function entered(state: GameState, raceId: string, fee: number) {
    const result = enterRace(state, raceId, fee, T0)
    if (!result.ok) throw new Error(result.error)
    return result
  }

  function race(state: GameState, entryId: string, now = T0 + 1000) {
    return raceCurrentDay(state, currentRef(state), entryId, now)
  }

  /** Entered, then moved to race Sunday. */
  function enteredOnSunday(state: GameState, raceId: string, fee: number) {
    const result = entered(state, raceId, fee)
    return { ...result, state: onSunday(result.state) }
  }

  it('runs on Sundays only; on race Sunday the day cannot be trained or re-planned', () => {
    const { state, entry } = entered(newGame(), 'RACE-001', 0)
    expect(getScheduledEntry(state)).toEqual(entry)
    expect(getRaceWeek(state)).toBe(1)
    expect(race(state, entry.id)).toEqual({ ok: false, error: 'not-race-day' })
    // Monday to Saturday train normally.
    expect(executeCurrentDay(state, currentRef(state), T0).ok).toBe(true)

    const sunday = onSunday(state)
    expect(isRaceDayToday(sunday)).toBe(true)
    expect(executeCurrentDay(sunday, currentRef(sunday), T0)).toEqual({ ok: false, error: 'race-day' })
    expect(planSession(sunday, currentRef(sunday), 'long-run')).toEqual({ ok: false, error: 'race-day' })
    expect(isRaceDayToday(onSunday(newGame()))).toBe(false)
  })

  it('moves the race to the next Sunday when Sunday is a forced Rest day, keeping the entry', () => {
    const { state, entry } = entered(newGame(), 'RACE-001', 0)
    const sunday = onSunday(state)
    const forced = {
      ...sunday,
      forcedRestDays: 1,
      week: { ...sunday.week, days: sunday.week.days.map((d, i) => (i === 6 ? { ...d, session: 'rest' as const } : d)) },
    }
    expect(isRaceDayToday(forced)).toBe(false)
    expect(getRaceWeek(forced)).toBe(2)
    const rested = executeCurrentDay(forced, currentRef(forced), T0)
    if (!rested.ok) throw new Error(rested.error)
    expect(getScheduledEntry(rested.value.state)?.id).toBe(entry.id)
    expect(getRaceWeek(rested.value.state)).toBe(2)
  })

  it('runs the race instead of the planned session and applies everything once', () => {
    const { state, entry } = enteredOnSunday(newGame('all-rounder'), 'RACE-001', 0)
    const result = race(state, entry.id, T0 + 5000)
    if (!result.ok) throw new Error(result.error)
    const { state: after, entry: finished } = result.value
    const sim = simulateRace(getRace('RACE-001')!, { attributes: state.athlete.attributes, fitness: 20, fatigue: 0 }, finished.result.dayForm)

    expect(finished.status).toBe('finished')
    expect(finished.result).toMatchObject({
      week: 1,
      day: 7,
      levelAtStart: 1,
      timeS: sim.timeS,
      position: sim.position,
      fieldSize: 50,
      fatigueChange: 10,
      fitnessChange: 0,
      injured: false,
    })
    const rewards = getRaceRewards(getRace('RACE-001')!, sim.position, 1)
    expect(finished.result.coinsAwarded).toBe(rewards.coinsAwarded)
    expect(finished.result.xpAwarded).toBe(rewards.xp)
    expect(finished.result.netCoins).toBe(rewards.coinsAwarded)
    // Sunday's planned Rest (Fitness −2, Fatigue −8) was not executed: only the race changed values.
    expect(after.athlete).toMatchObject({ xp: rewards.xp, fitness: 20, fatigue: 10 })
    // Sunday ends the week.
    expect(result.value.weekCompleted).toBe(true)
    expect(after.week).toMatchObject({ number: 2, currentDayIndex: 0 })
    expect(after.fitnessDecayReference).toBe(T0 + 5000)
    expect(after.coins).toBe(25 + rewards.coinsAwarded)
  })

  it('cannot be applied twice', () => {
    const { state, entry } = enteredOnSunday(newGame(), 'RACE-001', 0)
    const ref = currentRef(state)
    const first = raceCurrentDay(state, ref, entry.id, T0)
    if (!first.ok) throw new Error(first.error)
    // The same request again (double tap, stale screen): that Sunday is no longer current.
    expect(raceCurrentDay(first.value.state, ref, entry.id, T0)).toEqual({ ok: false, error: 'wrong-week' })
    // On the next day: the entry is no longer pending.
    expect(race(first.value.state, entry.id)).toEqual({ ok: false, error: 'already-finished' })
    expect(race(first.value.state, 'entry-9')).toEqual({ ok: false, error: 'unknown-entry' })
  })

  it('is locked during forced Rest days', () => {
    const injured = execute(withAthlete(newGame(), { fatigue: 95 })).state
    const { state, entry } = enteredOnSunday(injured, 'RACE-001', 0)
    expect(race(state, entry.id)).toEqual({ ok: false, error: 'forced-rest' })
  })

  it('applies the injury rule after a race: no XP, −15 Fitness, 5 forced Rest days; result and coins count', () => {
    const { state, entry } = enteredOnSunday(withAthlete(newGame(), { fitness: 60, fatigue: 90 }), 'RACE-001', 0)
    expect(previewRaceDay(state, getRace('RACE-001')!)).toEqual({ fatigueChange: 10, injured: true })
    const result = race(state, entry.id)
    if (!result.ok) throw new Error(result.error)
    const { state: after, entry: finished } = result.value
    expect(finished.result).toMatchObject({ injured: true, xpAwarded: 0, fitnessChange: -15, fatigueChange: 10 })
    expect(finished.result.coinsAwarded).toBeGreaterThan(0)
    expect(after.athlete).toMatchObject({ xp: 0, fitness: 45, fatigue: 100 })
    expect(after.forcedRestDays).toBe(5)
    // The forced Rest days fill the start of the next week.
    expect(after.week.days.slice(0, 5).every((d) => d.session === 'rest')).toBe(true)
  })

  it('judges rewards at the level when the race starts, not at entry', () => {
    // Entered at level 1 (free Open race), raced at level 4: 3 above the recommended level 1.
    const { state, entry } = enteredOnSunday(newGame(), 'RACE-001', 0)
    const levelled = withAthlete(state, { xp: 450, fitness: 95 })
    const result = race(levelled, entry.id)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.entry.levelAtEntry).toBe(1)
    expect(result.value.entry.result).toMatchObject({ levelAtStart: 4, multiplierPct: 0, coinsAwarded: 0, xpAwarded: 0 })
  })

  it('subtracts the fee paid at entry in the net coin change, and adds the prize to the balance', () => {
    const { state, entry } = enteredOnSunday(atLevel11(300), 'RACE-004', 50)
    expect(state.coins).toBe(250)
    const result = race(state, entry.id)
    if (!result.ok) throw new Error(result.error)
    const r = result.value.entry.result
    expect(r.netCoins).toBe(r.coinsAwarded - 50)
    expect(result.value.state.coins).toBe(250 + r.coinsAwarded)
  })

  it('levels up through race XP with the existing rules, and rolls the week over on day 7', () => {
    let state = withAthlete(newGame(), { xp: 95, fitness: 95 })
    for (let i = 0; i < 6; i++) state = execute(withSession(state, 'rest'), T0 + i * DAY).state
    const { state: ready, entry } = entered(state, 'RACE-001', 0)
    const result = race(ready, entry.id, T0 + 7 * DAY)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.entry.result.position).toBe(1)
    expect(result.value).toMatchObject({ levelBefore: 1, levelAfter: 2, attributePointsAwarded: 2, weekCompleted: true })
    expect(result.value.state.athlete.xp).toBe(95 + 30)
    expect(result.value.state.week).toMatchObject({ number: 2, currentDayIndex: 0 })
  })

  it('lets a finished race be entered again', () => {
    const { state, entry } = enteredOnSunday(newGame(), 'RACE-001', 0)
    const result = race(state, entry.id)
    if (!result.ok) throw new Error(result.error)
    expect(getPendingEntry(result.value.state, 'RACE-001')).toBeUndefined()
    const again = enterRace(result.value.state, 'RACE-001', 0, T0 + 1)
    if (!again.ok) throw new Error(again.error)
    expect(again.entry.id).toBe('entry-2')
  })
})

describe('race rewards', () => {
  it('maps positions to bands', () => {
    expect([1, 2, 3, 4, 10, 11, 50].map(getPrizeBand)).toEqual([0, 1, 2, 3, 3, 4, 4])
  })

  it.each<[string, number, number, number, number]>([
    // race, position, level at start, coins, XP
    ['RACE-001', 1, 1, 100, 30],
    ['RACE-001', 1, 2, 75, 22],
    ['RACE-001', 1, 3, 40, 12],
    ['RACE-001', 1, 4, 0, 0],
    ['RACE-001', 12, 1, 10, 3],
    ['RACE-004', 2, 12, 157, 31],
    ['RACE-004', 5, 11, 75, 15],
    ['RACE-007', 3, 21, 350, 50],
    ['RACE-010', 2, 5, 1050, 126],
    ['RACE-012', 40, 5, 150, 18],
  ])('%s, position %i, level %i: %i coins and %i XP (rounded down once)', (id, position, level, coins, xp) => {
    expect(getRaceRewards(getRace(id)!, position, level)).toMatchObject({ coinsAwarded: coins, xp })
  })

  it('uses the approved race Fatigue', () => {
    expect(RACES.map((r) => getRaceFatigue(r))).toEqual([10, 12, 14, 17, 20, 23, 27, 33, 40, 48, 61, 77])
  })
})

describe('full results', () => {
  it('lists all 50 runners in time order with the athlete at the stored position', () => {
    const entered = enterRace(newGame(), 'RACE-001', 0, T0)
    if (!entered.ok) throw new Error(entered.error)
    const result = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0)
    if (!result.ok) throw new Error(result.error)
    const stored = result.value.entry.result
    expect(stored.rivalTimesS).toEqual(rivalTimes(getRace('RACE-001')!))
    const rows = getStandings(getRace('RACE-001')!, stored)
    expect(rows).toHaveLength(50)
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(rows.every((r, i) => i === 0 || r.timeS >= rows[i - 1]!.timeS)).toBe(true)
    expect(rows[stored.position - 1]).toEqual({ position: stored.position, runner: 'you', timeS: stored.timeS })
    expect(rows.filter((r) => r.runner === 'you')).toHaveLength(1)
  })

  it('places the athlete before rivals with the same time, and rebuilds older results', () => {
    const race = getRace('RACE-001')!
    const rivals = rivalTimes(race)
    const tie = rivals[4]!
    const base = { position: 5, timeS: tie } as Parameters<typeof getStandings>[1]
    const rows = getStandings(race, base)
    expect(rows[4]).toEqual({ position: 5, runner: 'you', timeS: tie })
    expect(rows[5]).toEqual({ position: 6, runner: 5, timeS: tie })
  })
})

describe('reward tables (Game Design Bible §10.8–§10.9, D5) — every band and level difference', () => {
  // Expected values written out from the specification, not computed by the code under test.
  // Columns: level difference ≤0 (100 %), 1 (75 %), 2 (40 %), ≥3 (0 %).
  const COINS: Record<string, number[][]> = {
    'RACE-001': [[100, 75, 40, 0], [70, 52, 28, 0], [50, 37, 20, 0], [25, 18, 10, 0], [10, 7, 4, 0]],
    'RACE-004': [[300, 225, 120, 0], [210, 157, 84, 0], [150, 112, 60, 0], [75, 56, 30, 0], [30, 22, 12, 0]],
    'RACE-007': [[700, 525, 280, 0], [490, 367, 196, 0], [350, 262, 140, 0], [175, 131, 70, 0], [70, 52, 28, 0]],
    'RACE-010': [[1500, 1125, 600, 0], [1050, 787, 420, 0], [750, 562, 300, 0], [375, 281, 150, 0], [150, 112, 60, 0]],
  }
  const XP: Record<string, number[][]> = {
    'RACE-001': [[30, 22, 12, 0], [21, 15, 8, 0], [15, 11, 6, 0], [7, 5, 3, 0], [3, 2, 1, 0]],
    'RACE-004': [[60, 45, 24, 0], [42, 31, 16, 0], [30, 22, 12, 0], [15, 11, 6, 0], [6, 4, 2, 0]],
    'RACE-007': [[100, 75, 40, 0], [70, 52, 28, 0], [50, 37, 20, 0], [25, 18, 10, 0], [10, 7, 4, 0]],
    'RACE-010': [[180, 135, 72, 0], [126, 94, 50, 0], [90, 67, 36, 0], [45, 33, 18, 0], [18, 13, 7, 0]],
  }
  // One position per band, both ends of 4th–10th and the last place.
  const POSITIONS = [[1], [2], [3], [4, 10], [11, 50]]

  it.each(Object.keys(COINS))('%s: coins and XP for every band and level difference, rounded down', (id) => {
    const race = getRace(id)!
    for (let band = 0; band < 5; band++) {
      for (const position of POSITIONS[band]!) {
        for (let d = 0; d < 4; d++) {
          // Level difference d (and also -2 for "0 or below" in the first column).
          for (const difference of d === 0 ? [0, -2] : d === 3 ? [3, 5] : [d]) {
            const level = race.recommendedLevel + difference
            const rewards = getRaceRewards(race, position, level)
            expect([id, position, difference, rewards.coinsAwarded, rewards.xp]).toEqual([
              id,
              position,
              difference,
              COINS[id]![band]![d],
              XP[id]![band]![d],
            ])
            expect(rewards.grossPrize).toBe(COINS[id]![band]![0])
          }
        }
      }
    }
  })
})

describe('race day with equipment', () => {
  it('applies and stores the equipped items, and explains them', () => {
    const owned = { ...withAthlete(newGame(), { fitness: 60, fatigue: 20 }), coins: 500, ownedEquipment: ['starter-shoes', 'poles', 'hydration-backpack'], equipment: ['poles', 'hydration-backpack'] }
    const entered = enterRace(owned, 'RACE-001', 0, T0)
    if (!entered.ok) throw new Error(entered.error)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0)
    if (!raced.ok) throw new Error(raced.error)
    const result = raced.value.entry.result
    expect(result.equipment).toEqual(['poles', 'hydration-backpack'])
    const without = simulateRace(getRace('RACE-001')!, { attributes: owned.athlete.attributes, fitness: 60, fatigue: 20 }, result.dayForm)
    expect(result.timeS).toBeLessThan(without.timeS)
  })
})
