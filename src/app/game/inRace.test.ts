import { describe, expect, it } from 'vitest'
import { inRace } from './inRace'

describe('celebrations wait for the race to end', () => {
  it('holds them on the race screen (segments and clips) and shows them on the result', () => {
    expect(inRace('/races/run/entry-1')).toBe(true)
    expect(inRace('/races/results/entry-1')).toBe(false)
    expect(inRace('/')).toBe(false)
  })
})
