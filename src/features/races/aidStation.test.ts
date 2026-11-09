import { describe, expect, it } from 'vitest'
import type { RaceSegment } from '../../game-engine/raceEngine'
import { aidAdvice, roughDelta, segmentDemand, segmentKind, type AdviceInput } from './aidStation'

const segment = (terrain: RaceSegment['terrain'], technicality = 0, km = 6, gain = 200): RaceSegment =>
  ({ index: 1, startM: 0, distanceM: km * 1000, gainM: gain, lossM: 0, effortKm: km + gain / 100, terrain, technicality, pieces: [] }) as RaceSegment

describe('aid station: the next segment', () => {
  it('names the kind of segment from its terrain', () => {
    expect(segmentKind(segment({ climb: 0.6, descent: 0.1, runnable: 0.3 }))).toBe('climb')
    expect(segmentKind(segment({ climb: 0.1, descent: 0.5, runnable: 0.4 }, 4))).toBe('technical-descent')
    expect(segmentKind(segment({ climb: 0.1, descent: 0.5, runnable: 0.4 }, 1))).toBe('descent')
    expect(segmentKind(segment({ climb: 0.1, descent: 0.2, runnable: 0.7 }))).toBe('runnable')
    expect(segmentKind(segment({ climb: 0.35, descent: 0.35, runnable: 0.3 }))).toBe('mixed')
  })

  it('rates its demand by effort per km', () => {
    expect(segmentDemand(segment({ climb: 0, descent: 0, runnable: 1 }, 0, 6, 50))).toBe('low')
    expect(segmentDemand(segment({ climb: 0.5, descent: 0.2, runnable: 0.3 }, 0, 6, 180))).toBe('medium')
    expect(segmentDemand(segment({ climb: 0.7, descent: 0, runnable: 0.3 }, 0, 8, 620))).toBe('high')
  })
})

describe('aid station: the coach speaks only when it matters', () => {
  const calm: AdviceInput = { energy: 70, kind: 'mixed', intensity: 'target', stop: 'normal', lastSegment: false, gapAheadS: 90, gapBehindS: 90, technical: 30 }
  it('says nothing in a calm moment', () => {
    expect(aidAdvice(calm)).toBeNull()
  })
  it('warns about low energy, a hard climb, a hard technical descent and a slow stop with a rival close behind', () => {
    expect(aidAdvice({ ...calm, energy: 20 })).toBe('lowEnergy')
    expect(aidAdvice({ ...calm, energy: 20, intensity: 'easy' })).toBeNull()
    expect(aidAdvice({ ...calm, kind: 'climb', intensity: 'hard' })).toBe('climbHard')
    expect(aidAdvice({ ...calm, kind: 'technical-descent', intensity: 'hard' })).toBe('technicalDescent')
    expect(aidAdvice({ ...calm, kind: 'technical-descent', intensity: 'hard', technical: 60 })).toBeNull()
    expect(aidAdvice({ ...calm, gapBehindS: 15, stop: 'slow' })).toBe('closeBehind')
  })
  it('encourages a push at the end or towards a rival close ahead', () => {
    expect(aidAdvice({ ...calm, lastSegment: true })).toBe('finalPush')
    expect(aidAdvice({ ...calm, lastSegment: true, intensity: 'hard' })).toBeNull()
    expect(aidAdvice({ ...calm, gapAheadS: 25 })).toBe('closeAhead')
  })
})

describe('rough time differences', () => {
  it('rounds to 10 seconds, minutes as m:ss', () => {
    expect(roughDelta(4)).toEqual({ sign: '', text: '' })
    expect(roughDelta(-37)).toEqual({ sign: '−', text: '40 s' })
    expect(roughDelta(83)).toEqual({ sign: '+', text: '1:20' })
  })
})
