import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ITEMS, getEquipmentItem, getRaceEffect, OWNED_FROM_START } from '../domain/equipment/items'
import { execute, newGame } from '../test/gameFixtures'
import { buyItem, isEquipped, setItemEquipped } from './equipment'

describe('equipment', () => {
  it('sells gels and cereal bars in packs of 3 for 10 coins, adding to the stock (owner decision)', () => {
    const start = { ...newGame(), coins: 25 }
    expect(start.consumables).toEqual({ gel: 0, bar: 0 })
    const gel = buyItem(start, 'energy-gel', 10)
    if (!gel.ok) throw new Error(gel.error)
    expect(gel.state).toEqual({ ...start, coins: 15, consumables: { gel: 3, bar: 0 } })
    // Bought again: another pack (never "already owned"), and never an owned or equipped item.
    const again = buyItem(gel.state, 'energy-gel', 10)
    if (!again.ok) throw new Error(again.error)
    expect(again.state).toMatchObject({ coins: 5, consumables: { gel: 6, bar: 0 }, ownedEquipment: ['starter-shoes'] })
    expect(buyItem(again.state, 'cereal-bar', 10)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(buyItem(start, 'cereal-bar', 0)).toEqual({ ok: false, error: 'price-changed' })
    const bar = buyItem(start, 'cereal-bar', 10)
    expect(bar.ok && bar.state.consumables).toEqual({ gel: 0, bar: 3 })
  })

  it('sells gels and cereal bars together in one pack: 3 of each (owner decision, 3 November 2026)', () => {
    const start = { ...newGame(), coins: 25 }
    const pack = buyItem(start, 'gels-and-bars', 10)
    if (!pack.ok) throw new Error(pack.error)
    expect(pack.state).toEqual({ ...start, coins: 15, consumables: { gel: 3, bar: 3 } })
    expect(setItemEquipped(pack.state, 'gels-and-bars', true)).toEqual({ ok: false, error: 'consumable' })
  })

  it('never equips gels or cereal bars: they are counted and taken to a race', () => {
    const state = { ...newGame(), consumables: { gel: 3, bar: 3 } }
    expect(setItemEquipped(state, 'energy-gel', true)).toEqual({ ok: false, error: 'consumable' })
    expect(setItemEquipped(state, 'cereal-bar', true)).toEqual({ ok: false, error: 'consumable' })
  })

  it('starts with the starter shoes owned but not equipped (owner decision)', () => {
    expect(EQUIPMENT_ITEMS.map((i) => [i.id, i.slot, i.level ?? null, i.price])).toEqual([
      ['starter-shoes', 'shoes', null, 0],
      ['trail-shoes-basic', 'shoes', 1, 35],
      ['trail-shoes', 'shoes', 2, 70],
      ['trail-shoes-light', 'shoes', 2, 70],
      ['poles', 'poles', 1, 25],
      ['poles-2', 'poles', 2, 50],
      ['hydration-backpack', 'pack', 1, 30],
      ['hydration-backpack-2', 'pack', 2, 90],
      // Gels and cereal bars (owner decision, 1 November 2026): packs of 3 for 10 coins, no level.
      ['energy-gel', 'gel', null, 10],
      ['cereal-bar', 'bar', null, 10],
      ['gels-and-bars', 'nutrition', null, 10],
    ])
    for (const id of ['energy-gel', 'cereal-bar', 'gels-and-bars']) {
      expect(getEquipmentItem(id)).toMatchObject({ packSize: 3 })
      // Their bonus belongs to the race engine (nutrition), not to the equipment effects.
      expect(getEquipmentItem(id)).not.toHaveProperty('raceEffect')
    }
    expect(getRaceEffect(['energy-gel', 'cereal-bar'])).toEqual(getRaceEffect([]))
    expect(OWNED_FROM_START).toEqual(['starter-shoes'])
    expect(newGame()).toMatchObject({ equipment: [], ownedEquipment: ['starter-shoes'] })
  })

  it('equips and takes off an item, once per slot, changing nothing else', () => {
    const state = newGame()
    const on = setItemEquipped(state, 'starter-shoes', true)
    if (!on.ok) throw new Error(on.error)
    expect(on.state.equipment).toEqual(['starter-shoes'])
    expect({ ...on.state, equipment: [] }).toEqual(state)
    expect(isEquipped(on.state, 'starter-shoes')).toBe(true)
    const twice = setItemEquipped(on.state, 'starter-shoes', true)
    expect(twice.ok && twice.state.equipment).toEqual(['starter-shoes'])
    const off = setItemEquipped(on.state, 'starter-shoes', false)
    expect(off.ok && off.state.equipment).toEqual([])
  })

  it('rejects unknown items', () => {
    expect(setItemEquipped(newGame(), 'jetpack', true)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('has no effect on training', () => {
    const on = setItemEquipped(newGame(), 'starter-shoes', true)
    if (!on.ok) throw new Error(on.error)
    const withShoes = execute(on.state)
    const without = execute(newGame())
    expect({ ...withShoes.state, equipment: [] }).toEqual(without.state)
    expect(withShoes.outcome).toEqual(without.outcome)
  })
})

describe('shop', () => {
  it('buys an item once, charging its price, without equipping it', () => {
    const state = { ...newGame(), coins: 60 }
    const bought = buyItem(state, 'poles-2', 50)
    if (!bought.ok) throw new Error(bought.error)
    expect(bought.state).toMatchObject({ coins: 10, ownedEquipment: ['starter-shoes', 'poles-2'], equipment: [] })
    expect(buyItem(bought.state, 'poles-2', 50)).toEqual({ ok: false, error: 'already-owned' })
  })

  it('refuses without enough coins, a changed price or an unknown item', () => {
    expect(buyItem(newGame(), 'trail-shoes', 70)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(buyItem({ ...newGame(), coins: 500 }, 'trail-shoes', 200)).toEqual({ ok: false, error: 'price-changed' })
    expect(buyItem(newGame(), 'jetpack', 0)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('equips only owned items, one per slot: better shoes replace the starter shoes', () => {
    expect(setItemEquipped(newGame(), 'trail-shoes', true)).toEqual({ ok: false, error: 'not-owned' })
    const rich = { ...newGame(), coins: 500 }
    let state = rich
    for (const [id, price] of [['trail-shoes', 70], ['poles', 25], ['poles-2', 50]] as const) {
      const r = buyItem(state, id, price)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    for (const id of ['starter-shoes', 'poles', 'trail-shoes', 'poles-2']) {
      const r = setItemEquipped(state, id, true)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    // Poles lvl 2 replaced poles lvl 1 in the same slot; lvl 1 stays owned.
    expect(state.equipment).toEqual(['trail-shoes', 'poles-2'])
    expect(state.ownedEquipment).toContain('poles')
  })
})
