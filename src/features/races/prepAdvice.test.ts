import { describe, expect, it } from 'vitest'
import { prepAdvice } from './prepAdvice'

describe('coach before the start (owner request, 10 November 2026)', () => {
  it('warns of an injury first, then of Hard in a long race started tired, then says Hard costs less when fresh', () => {
    const base = { distanceKm: 42, fatigue: 40, plan: ['target', 'hard'] as const, fatigueAtFinish: 80 }
    expect(prepAdvice({ ...base, fatigueAtFinish: 96 })).toBe('injuryRisk')
    expect(prepAdvice({ ...base, distanceKm: 8, fatigueAtFinish: 96 })).toBe('injuryRisk')
    expect(prepAdvice(base)).toBe('tiredLong')
    expect(prepAdvice({ ...base, plan: ['target', 'target'] })).toBeNull()
    expect(prepAdvice({ ...base, fatigue: 24, plan: ['target', 'easy'] })).toBe('freshLong')
    expect(prepAdvice({ ...base, fatigue: 24 })).toBeNull()
    // Under 30 km Hard is always faster: no advice unless the plan injures.
    expect(prepAdvice({ ...base, distanceKm: 22 })).toBeNull()
  })
})
