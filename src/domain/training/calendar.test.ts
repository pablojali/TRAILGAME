import { describe, expect, it } from 'vitest'
import { getCareerProgress } from './calendar'

describe('getCareerProgress', () => {
  it.each([
    [1, 1, 1, 2],
    [24, 1, 24, 46],
    [52, 1, 52, 100],
    [53, 2, 1, 2],
    [104, 2, 52, 100],
    [105, 3, 1, 2],
  ])('week %i: year %i, week %i of 52, %i%%', (week, year, weekOfYear, percent) => {
    expect(getCareerProgress(week)).toEqual({ year, weekOfYear, percent })
  })
})
