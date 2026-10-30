import { describe, expect, it } from 'vitest'
import { getEarnedAttributePoints } from '../domain/athlete/levels'
import { getRaceEffect } from '../domain/equipment/items'
import { getRace } from '../domain/races/races'
import { SESSION_TYPES } from '../domain/training/sessions'
import { execute, newGame, onSunday, T0, withAthlete, withSession } from '../test/gameFixtures'
import { buyItem, setItemEquipped } from './equipment'
import type { GameState } from './gameState'
import { enterRace, raceCurrentDay } from './races'
import { simulateRace } from './raceSimulation'

/** A career that owns every item, with the given items equipped. */
function geared(equipped: string[]): GameState {
  let state: GameState = { ...withAthlete(newGame(), { fitness: 60, fatigue: 20 }), coins: 1000 }
  for (const [id, price] of [['trail-shoes', 70], ['hydration-backpack', 30], ['poles', 25]] as const) {
    const r = buyItem(state, id, price)
    if (!r.ok) throw new Error(r.error)
    state = r.state
  }
  for (const id of equipped) {
    const r = setItemEquipped(state, id, true)
    if (!r.ok) throw new Error(r.error)
    state = r.state
  }
  return state
}

function raceTime(state: GameState, raceId: string): number {
  return simulateRace(getRace(raceId)!, { ...state.athlete, equipment: state.equipment }).timeS
}

describe('equipment rules (owner, 29 October 2026)', () => {
  it('gives independent race bonuses: no attribute points and no change to base attributes or progression', () => {
    const state = geared(['trail-shoes', 'hydration-backpack', 'poles'])
    const plain = withAthlete(newGame(), { fitness: 60, fatigue: 20 })
    expect(state.athlete).toEqual(plain.athlete)
    expect(getEarnedAttributePoints(state.athlete.xp)).toBe(getEarnedAttributePoints(plain.athlete.xp))

    // The attribute bonuses apply in the race only: base attributes are unchanged after it.
    const entered = enterRace(state, 'RACE-008', 300, T0)
    if (!entered.ok) throw new Error(entered.error)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0)
    if (!raced.ok) throw new Error(raced.error)
    expect(raced.value.state.athlete.attributes).toEqual(state.athlete.attributes)
    expect(raced.value.state.athlete.spentAttributePoints).toBe(state.athlete.spentAttributePoints)
  })

  it('applies the backpack and poles only while they are equipped', () => {
    const none = raceTime(geared([]), 'RACE-012')
    expect(raceTime(geared(['hydration-backpack']), 'RACE-012')).toBeLessThan(none)
    expect(raceTime(geared(['poles']), 'RACE-012')).toBeLessThan(none)
    const off = setItemEquipped(geared(['hydration-backpack', 'poles']), 'poles', false)
    if (!off.ok) throw new Error(off.error)
    expect(raceTime(off.state, 'RACE-012')).toBe(raceTime(geared(['hydration-backpack']), 'RACE-012'))
  })

  it('switching items stops the old bonus and starts the new one', () => {
    const trail = geared(['trail-shoes'])
    const swapped = setItemEquipped(trail, 'starter-shoes', true)
    if (!swapped.ok) throw new Error(swapped.error)
    expect(swapped.state.equipment).toEqual(['starter-shoes'])
    const neutral = getRaceEffect([])
    expect(getRaceEffect(swapped.state.equipment)).toEqual(neutral)
    expect(Object.values(neutral.attributes).every((v) => v === 0)).toBe(true)
    expect(raceTime(swapped.state, 'RACE-008')).toBe(raceTime(geared([]), 'RACE-008'))
  })

  it('keeps bought items in the inventory when they are not equipped', () => {
    const state = geared(['poles'])
    const off = setItemEquipped(state, 'poles', false)
    if (!off.ok) throw new Error(off.error)
    expect(off.state.equipment).toEqual([])
    expect(off.state.ownedEquipment).toEqual(['starter-shoes', 'trail-shoes', 'hydration-backpack', 'poles'])
  })

  it('never changes training: every session gives the same outcome with any equipment', () => {
    for (const session of SESSION_TYPES) {
      const without = execute(withSession(geared([]), session))
      const withAll = execute(withSession(geared(['trail-shoes', 'hydration-backpack', 'poles']), session))
      expect(withAll.outcome).toEqual(without.outcome)
      expect(withAll.state.athlete).toEqual(without.state.athlete)
    }
  })
})
