import { describe, expect, it } from 'vitest'
import { HEAD_FILES, HEADS } from '../../domain/athlete/heads'
import { SHIRT_FILES } from '../../domain/athlete/shirts'
import { EQUIPMENT_ITEMS } from '../../domain/equipment/items'
import { art, headArt } from './avatarArt'

/** The prepared head files on disk. */
const HEAD_ASSETS = Object.keys(import.meta.glob('/assets/runner/avatar/heads/*.webp'))
const SHIRT_ASSETS = Object.keys(import.meta.glob('/assets/runner/avatar/clothing/*.webp'))

const names = (paths: string[]) => paths.map((path) => path.slice(path.lastIndexOf('/') + 1, -'.webp'.length)).sort()

describe('avatar art', () => {
  it('the domain head catalog lists exactly the prepared head files', () => {
    const files = HEAD_ASSETS.map((path) => path.slice(path.lastIndexOf('/') + 1, -'.webp'.length)).sort()
    expect(files.length).toBeGreaterThan(0)
    expect([...HEAD_FILES].sort()).toEqual(files)
  })

  it('bundles the art of every head in every tone of the catalog', () => {
    for (const head of HEADS) {
      for (const tone of Object.keys(head.files).map(Number)) {
        expect(headArt(head.sex, head.id, tone), `${head.id} tone ${tone}`).toMatch(/\.webp$/)
      }
    }
  })

  it('the shirt catalog lists exactly the prepared shirt files', () => {
    expect(SHIRT_FILES.map((shirt) => shirt.file).sort()).toEqual(names(SHIRT_ASSETS))
  })

  it('has art for every shoe item', () => {
    for (const item of EQUIPMENT_ITEMS.filter((i) => i.slot === 'shoes')) {
      expect(art(`footwear/${item.id}`), item.id).toMatch(/\.webp$/)
    }
  })

  it('has no art for the basic head or a missing tone', () => {
    expect(headArt('female', 'natural', 2)).toBeUndefined()
    expect(headArt('female', 'head-l2-03', 2)).toBeUndefined()
  })
})
