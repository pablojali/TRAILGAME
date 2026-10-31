import { describe, expect, it } from 'vitest'
import type { Appearance } from '../domain/athlete/appearance'
import { newGame, withAthlete } from '../test/gameFixtures'
import { setAppearance } from './appearance'

const look = (outfit: Appearance['outfit'], skin: Appearance['skin'] = 'tone-1'): Appearance => ({
  hair: 'natural',
  skin,
  outfit,
})

describe('setAppearance', () => {
  it('changes only the appearance', () => {
    const state = newGame()
    const result = setAppearance(state, look('shirt-l1-01', 'tone-3'))
    if (!result.ok) throw new Error(result.error)
    expect(result.state.athlete.appearance).toEqual(look('shirt-l1-01', 'tone-3'))
    expect({ ...result.state, athlete: { ...result.state.athlete, appearance: state.athlete.appearance } }).toEqual(
      state,
    )
  })

  it('refuses options above the runner level', () => {
    expect(setAppearance(newGame(), look('shirt-l2-01'))).toEqual({ ok: false, error: 'locked' })
    // Level 2 starts at 100 XP.
    const level2 = withAthlete(newGame(), { xp: 100 })
    expect(setAppearance(level2, look('shirt-l2-01')).ok).toBe(true)
    expect(setAppearance(level2, look('shirt-l3-01'))).toEqual({ ok: false, error: 'locked' })
  })

  it('accepts a women\'s head for women and refuses it for men (no art for their sex)', () => {
    // Level locks and tones without art: src/domain/athlete/appearance.heads.test.ts.
    expect(setAppearance(newGame(), { hair: 'head-l1-02', skin: 'tone-1', outfit: 'none' }).ok).toBe(true)
    const male = newGame('all-rounder', undefined, { name: 'Leo', sex: 'male' })
    expect(setAppearance(male, { hair: 'head-l1-02', skin: 'tone-1', outfit: 'none' })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('refuses values that do not exist for the runner', () => {
    // The test runner is female: women have skin tones 1–3.
    expect(setAppearance(newGame(), look('none', 'tone-4'))).toEqual({ ok: false, error: 'invalid' })
    expect(setAppearance(newGame(), { ...look('none'), outfit: 'cape' })).toEqual({ ok: false, error: 'invalid' })
    // Retired T-shirts cannot be chosen any more; a men's-only shirt cannot be worn by a woman.
    expect(setAppearance(newGame(), look('white-tshirt'))).toEqual({ ok: false, error: 'invalid' })
    expect(setAppearance(withAthlete(newGame(), { xp: 1000 }), look('shirt-l3-02'))).toEqual({ ok: false, error: 'invalid' })
  })
})
