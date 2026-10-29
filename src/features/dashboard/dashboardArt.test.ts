import { describe, expect, it } from 'vitest'
import { resolveEquipmentLayers } from './dashboardArt'

const manifest = {
  '/assets/runner/dashboard/female/equipment/shoes.png': 'female-shoes.png',
  '/assets/runner/dashboard/female/equipment/vest.webp': 'female-vest.webp',
  '/assets/runner/dashboard/female/equipment/cap.svg': 'female-cap.svg',
}

describe('resolveEquipmentLayers', () => {
  it('has no layers when nothing is equipped', () => {
    expect(resolveEquipmentLayers('female', [], manifest)).toEqual([])
  })

  it('stacks equipment layers in the given order and skips items without artwork', () => {
    expect(resolveEquipmentLayers('female', ['shoes', 'poles', 'vest', 'cap'], manifest)).toEqual([
      { id: 'shoes', url: 'female-shoes.png' },
      { id: 'vest', url: 'female-vest.webp' },
      { id: 'cap', url: 'female-cap.svg' },
    ])
  })

  it('uses the set for the runner sex', () => {
    expect(resolveEquipmentLayers('male', ['shoes'], manifest)).toEqual([])
  })
})
