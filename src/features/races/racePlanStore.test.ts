import { describe, expect, it } from 'vitest'
import { loadRacePlan, saveRacePlan } from './racePlanStore'

describe('race plan on this device', () => {
  it('keeps the style and the hand-set segments per entry, and ignores anything else', () => {
    saveRacePlan('entry-9', { style: 'aggressive', fixed: [null, 'easy'] })
    expect(loadRacePlan('entry-9')).toEqual({ style: 'aggressive', fixed: [null, 'easy'] })
    expect(loadRacePlan('entry-10')).toBeNull()
    localStorage.setItem('trail-manager.race-plan.entry-11', JSON.stringify({ style: 'reckless', fixed: [] }))
    expect(loadRacePlan('entry-11')).toBeNull()
    localStorage.setItem('trail-manager.race-plan.entry-12', JSON.stringify({ style: 'balanced', fixed: ['sprint', 'hard'] }))
    expect(loadRacePlan('entry-12')).toEqual({ style: 'balanced', fixed: [null, 'hard'] })
    localStorage.setItem('trail-manager.race-plan.entry-13', '{not json')
    expect(loadRacePlan('entry-13')).toBeNull()
  })
})
