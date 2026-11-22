import { describe, expect, it } from 'vitest'
import { WEAR, type WearConfig } from '../domain/equipment/wear'
import { parseSave, SCHEMA_VERSION } from '../repositories/gameRepository'
import { currentRef, newGame, onSunday, T0, withEntry, withSession } from '../test/gameFixtures'
import { buyItem } from './equipment'
import type { GameState } from './gameState'
import { raceCurrentDay } from './races'
import { executeCurrentDay } from './training'
import { cheapestShoesPrice, EMERGENCY_PAIR_COOLDOWN_WEEKS, withEmergencyPair } from './wear'

/**
 * Starter shoes at 20 coins and the free emergency pair (brief B-6c, owner decision D8 of
 * 22 November 2026). Test table: starter shoes 150 km and 20 coins, trail shoes 300 km and 35 coins.
 */
const ON: WearConfig = { ...WEAR, speed: 1 }
const serializeSave = (state: GameState) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, state })

/** A runner whose only pair is the starter shoes, with `used` of their life gone and `coins`. */
function runner(used: number, coins: number, extra: Partial<GameState> = {}): GameState {
  return { ...newGame(), ownedEquipment: ['starter-shoes'], equipment: ['starter-shoes'], wear: { 'starter-shoes': used }, coins, ...extra }
}

/** A long run (18 km): 12 % of the starter shoes' life. */
function longRun(state: GameState, wear: WearConfig = ON) {
  const planned = withSession(state, 'long-run')
  const done = executeCurrentDay(planned, currentRef(planned), T0, wear)
  if (!done.ok) throw new Error(done.error)
  return done.value
}

describe('starter shoes at 20 coins', () => {
  it('cost 20 to replace when worn, and are still "already owned" when not', () => {
    expect(cheapestShoesPrice()).toBe(20)
    const replaced = buyItem(runner(0.5, 30), 'starter-shoes', 20, ON)
    expect(replaced.ok && replaced.state.coins).toBe(10)
    expect(buyItem(runner(0, 30), 'starter-shoes', 20, ON)).toEqual({ ok: false, error: 'already-owned' })
    expect(buyItem(runner(0.5, 30), 'starter-shoes', 20)).toEqual({ ok: false, error: 'already-owned' })
  })
})

describe('the free emergency pair', () => {
  it('is given when the day\'s wear takes the last usable pair to 9 % or less and the coins are below the cheapest pair', () => {
    // 12 % left, an 18 km long run: 0 % left, 10 coins.
    const day = longRun(runner(0.88, 10))
    expect(day.emergencyPair).toBe(true)
    expect(day.state.equipment).toContain('starter-shoes')
    expect(day.state.wear?.['starter-shoes']).toBeUndefined()
    expect(day.state.emergencyPairWeek).toBe(1)
    expect(day.state.coins).toBe(10)
  })

  it('is not given with the coins for the cheapest pair, or with another usable pair owned', () => {
    expect(longRun(runner(0.88, 20)).emergencyPair).toBeUndefined()
    const spare = runner(0.88, 0, { ownedEquipment: ['starter-shoes', 'trail-shoes-basic'] })
    expect(longRun(spare).emergencyPair).toBeUndefined()
  })

  it('is checked only when the wear crosses into the band: shoes already there earlier get nothing', () => {
    // Already at 5 % before the day: the moment passed (with the coins the runner had then).
    expect(longRun(runner(0.95, 0)).emergencyPair).toBeUndefined()
    // Still above 9 % after the day: nothing yet.
    expect(longRun(runner(0.5, 0)).emergencyPair).toBeUndefined()
  })

  it('is given at most once every 8 game weeks', () => {
    const week = newGame().week.number
    expect(longRun(runner(0.88, 0, { emergencyPairWeek: week - (EMERGENCY_PAIR_COOLDOWN_WEEKS - 1) })).emergencyPair).toBeUndefined()
    const later = runner(0.88, 0, { week: { ...newGame().week, number: week + EMERGENCY_PAIR_COOLDOWN_WEEKS }, emergencyPairWeek: week })
    expect(longRun(later).emergencyPair).toBe(true)
  })

  it('is checked after a race finish too, with the coins after the prize', () => {
    const { state, entry } = withEntry(onSunday(runner(0.88, 0)), 'RACE-002')
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0, ON)
    if (!raced.ok) throw new Error(raced.error)
    const coinsAfter = state.coins + raced.value.entry.result.coinsAwarded
    expect(raced.value.emergencyPair === true).toBe(coinsAfter < 20)
  })

  it('never happens with wear off', () => {
    expect(longRun(runner(0.88, 0), WEAR).emergencyPair).toBeUndefined()
    expect(withEmergencyPair(runner(0.5, 0), runner(1, 0), 1, WEAR).granted).toBe(false)
  })

  it('keeps the week of the last pair in the save; older saves load without it', () => {
    const given = longRun(runner(0.88, 0)).state
    const loaded = parseSave(serializeSave(given), T0)
    expect(loaded.status === 'loaded' && loaded.state.emergencyPairWeek).toBe(1)
    const old = parseSave(serializeSave(newGame()), T0)
    expect(old.status === 'loaded' && 'emergencyPairWeek' in old.state).toBe(false)
    expect(parseSave(serializeSave({ ...newGame(), emergencyPairWeek: 0 }), T0).status).toBe('incompatible')
  })
})
