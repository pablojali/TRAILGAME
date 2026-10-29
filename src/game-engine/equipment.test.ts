import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ITEMS, OWNED_FROM_START } from '../domain/equipment/items'
import { execute, newGame } from '../test/gameFixtures'
import { isEquipped, setItemEquipped } from './equipment'

describe('equipment', () => {
  it('starts with the starter shoes owned but not equipped (owner decision)', () => {
    expect(EQUIPMENT_ITEMS.map((i) => i.id)).toEqual(['starter-shoes'])
    expect(OWNED_FROM_START).toEqual(['starter-shoes'])
    expect(newGame().equipment).toEqual([])
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
