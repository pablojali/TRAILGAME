import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ITEMS, OWNED_FROM_START } from '../domain/equipment/items'
import { execute, newGame } from '../test/gameFixtures'
import { buyItem, isEquipped, setItemEquipped } from './equipment'

describe('equipment', () => {
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
    ])
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
