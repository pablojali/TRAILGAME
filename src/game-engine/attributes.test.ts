import { describe, expect, it } from 'vitest'
import { PROFILES } from '../domain/athlete/profiles'
import { allocateAttributePoint, getUnspentAttributePoints } from './attributes'
import type { GameState } from './gameState'
import { newGame, withAthlete } from '../test/gameFixtures'

function allocate(state: GameState, attribute: Parameters<typeof allocateAttributePoint>[1]) {
  const result = allocateAttributePoint(state, attribute, state.athlete.spentAttributePoints)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('getUnspentAttributePoints', () => {
  it('is 0 for a new career', () => {
    expect(getUnspentAttributePoints(newGame().athlete)).toBe(0)
  })

  it('awards every level crossed by a single XP jump exactly once', () => {
    expect(getUnspentAttributePoints(withAthlete(newGame(), { xp: 460 }).athlete)).toBe(6)
    expect(getUnspentAttributePoints(withAthlete(newGame(), { xp: 700 }).athlete)).toBe(8)
  })

  it('subtracts points already spent', () => {
    expect(getUnspentAttributePoints(withAthlete(newGame(), { xp: 260, spentAttributePoints: 3 }).athlete)).toBe(1)
  })
})

describe('allocateAttributePoint', () => {
  it('raises exactly one attribute by 1 and spends one point', () => {
    const state = withAthlete(newGame('climber'), { xp: 100 })
    const next = allocate(state, 'speed')
    expect(next.athlete.attributes).toEqual({ ...PROFILES.climber.attributes, speed: 14 })
    expect(next.athlete.spentAttributePoints).toBe(1)
    expect(getUnspentAttributePoints(next.athlete)).toBe(1)
    expect(state.athlete.attributes.speed).toBe(13)
  })

  it('spends all available points and then refuses', () => {
    let state = withAthlete(newGame(), { xp: 100 })
    state = allocate(state, 'endurance')
    state = allocate(state, 'endurance')
    expect(state.athlete.attributes.endurance).toBe(18)
    expect(allocateAttributePoint(state, 'endurance', 2)).toEqual({ ok: false, error: 'no-points' })
  })

  it('refuses when no points were ever earned', () => {
    expect(allocateAttributePoint(newGame(), 'speed', 0)).toEqual({ ok: false, error: 'no-points' })
  })

  it('raises attributes past 100: there is no upper limit (owner decision, 30 October 2026)', () => {
    const base = newGame()
    const state = withAthlete(base, { xp: 100, attributes: { ...base.athlete.attributes, speed: 100 } })
    expect(allocate(state, 'speed').athlete.attributes.speed).toBe(101)
  })

  it('rejects a repeated request based on an older state', () => {
    const state = withAthlete(newGame(), { xp: 260 })
    const first = allocateAttributePoint(state, 'technical', 0)
    if (!first.ok) throw new Error(first.error)
    // Same request replayed against the updated state: nothing is spent twice.
    expect(allocateAttributePoint(first.state, 'technical', 0)).toEqual({ ok: false, error: 'stale-request' })
    expect(first.state.athlete.attributes.technical).toBe(17)
  })

  it('rejects unknown attributes', () => {
    const state = withAthlete(newGame(), { xp: 100 })
    expect(allocateAttributePoint(state, 'power' as never, 0)).toEqual({ ok: false, error: 'unknown-attribute' })
  })
})
