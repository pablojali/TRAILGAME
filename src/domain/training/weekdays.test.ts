import { describe, expect, it } from 'vitest'
import { weekdayLong, weekdayShort } from './weekdays'

describe('weekday labels', () => {
  it('maps days 1–7 to Monday–Sunday', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(weekdayShort)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(weekdayLong(1)).toBe('Monday')
    expect(weekdayLong(7)).toBe('Sunday')
  })

  it('falls back to a day number outside 1–7', () => {
    expect(weekdayShort(8)).toBe('Day 8')
  })
})
