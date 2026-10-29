import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ITEMS, OWNED_FROM_START } from '../domain/equipment/items'
import { execute, newGame } from '../test/gameFixtures'
import { buyItem, isEquipped, setItemEquipped } from './equipment'

describe('equipment', () => {
  it('starts with the starter shoes owned but not equipped (owner decision)', () => {
    expect(EQUIPMENT_ITEMS.map((i) => [i.id, i.slot, i.price])).toEqual([
      ['starter-shoes', 'shoes', 0],
      ['trail-shoes', 'shoes', 200],
      ['hydration-backpack', 'pack', 150],
      ['poles', 'poles', 100],
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
    const state = { ...newGame(), coins: 160 }
    const bought = buyItem(state, 'poles', 100)
    if (!bought.ok) throw new Error(bought.error)
    expect(bought.state).toMatchObject({ coins: 60, ownedEquipment: ['starter-shoes', 'poles'], equipment: [] })
    expect(buyItem(bought.state, 'poles', 100)).toEqual({ ok: false, error: 'already-owned' })
  })

  it('refuses without enough coins, a changed price or an unknown item', () => {
    expect(buyItem(newGame(), 'trail-shoes', 200)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(buyItem({ ...newGame(), coins: 500 }, 'trail-shoes', 150)).toEqual({ ok: false, error: 'price-changed' })
    expect(buyItem(newGame(), 'jetpack', 0)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('equips only owned items, one per slot: better shoes replace the starter shoes', () => {
    expect(setItemEquipped(newGame(), 'trail-shoes', true)).toEqual({ ok: false, error: 'not-owned' })
    const rich = { ...newGame(), coins: 500 }
    let state = rich
    for (const [id, price] of [['trail-shoes', 200], ['poles', 100]] as const) {
      const r = buyItem(state, id, price)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    for (const id of ['starter-shoes', 'poles', 'trail-shoes']) {
      const r = setItemEquipped(state, id, true)
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    expect(state.equipment).toEqual(['poles', 'trail-shoes'])
  })
})
