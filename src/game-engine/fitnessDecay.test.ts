import { describe, expect, it } from 'vitest'
import { applyFitnessDecay, DECAY_PERIOD_MS } from './fitnessDecay'
import { execute, newGame, T0, withAthlete, withSession } from '../test/gameFixtures'

const DAY = DECAY_PERIOD_MS
const HOUR = DAY / 24

describe('applyFitnessDecay', () => {
  it('does nothing before a full 24-hour period', () => {
    const state = newGame()
    const result = applyFitnessDecay(state, T0 + DAY - 1)
    expect(result).toEqual({ state, periods: 0, fitnessLost: 0 })
  })

  it('removes 1 Fitness at exactly 24 hours', () => {
    const result = applyFitnessDecay(newGame(), T0 + DAY)
    expect(result.state.athlete.fitness).toBe(19)
    expect(result.periods).toBe(1)
    expect(result.state.fitnessDecayReference).toBe(T0 + DAY)
  })

  it('applies several elapsed periods at once (72 h: 20 → 17)', () => {
    const result = applyFitnessDecay(newGame(), T0 + 3 * DAY)
    expect(result.state.athlete.fitness).toBe(17)
    expect(result.fitnessLost).toBe(3)
  })

  it('keeps partial time for the next application', () => {
    const first = applyFitnessDecay(newGame(), T0 + 36 * HOUR)
    expect(first.state.athlete.fitness).toBe(19)
    expect(first.state.fitnessDecayReference).toBe(T0 + DAY)
    // 12 more hours complete the second period.
    const second = applyFitnessDecay(first.state, T0 + 48 * HOUR)
    expect(second.state.athlete.fitness).toBe(18)
  })

  it('never applies the same period twice', () => {
    const once = applyFitnessDecay(newGame(), T0 + 2 * DAY + 5 * HOUR).state
    const again = applyFitnessDecay(once, T0 + 2 * DAY + 5 * HOUR)
    expect(again.periods).toBe(0)
    expect(again.state).toBe(once)
    expect(once.athlete.fitness).toBe(18)
  })

  it('stops at 0 and still advances the reference', () => {
    const state = withAthlete(newGame(), { fitness: 2 })
    const result = applyFitnessDecay(state, T0 + 10 * DAY)
    expect(result.state.athlete.fitness).toBe(0)
    expect(result.fitnessLost).toBe(2)
    expect(result.state.fitnessDecayReference).toBe(T0 + 10 * DAY)
    expect(applyFitnessDecay(result.state, T0 + 10 * DAY + 1).state.athlete.fitness).toBe(0)
  })

  it('does not reapply old periods after Fitness reached 0 and training resumed', () => {
    const atZero = applyFitnessDecay(withAthlete(newGame(), { fitness: 1 }), T0 + 5 * DAY).state
    const trained = execute(atZero, T0 + 5 * DAY + HOUR).state
    expect(trained.athlete.fitness).toBe(2)
    expect(applyFitnessDecay(trained, T0 + 6 * DAY).state.athlete.fitness).toBe(2)
  })

  it('counts from the last non-rest session', () => {
    const trained = execute(newGame(), T0 + 30 * HOUR).state // fitness 22
    expect(applyFitnessDecay(trained, T0 + 53 * HOUR).state.athlete.fitness).toBe(22)
    expect(applyFitnessDecay(trained, T0 + 54 * HOUR).state.athlete.fitness).toBe(21)
  })

  it('is reset by a played Rest day too: decay only counts days not played (owner decision, 30 October 2026)', () => {
    const rested = execute(withSession(newGame(), 'rest'), T0 + 30 * HOUR).state
    expect(rested.athlete.fitness).toBe(18) // Rest with no active day before it: −2
    expect(applyFitnessDecay(rested, T0 + 2 * DAY).state.athlete.fitness).toBe(18)
    expect(applyFitnessDecay(rested, T0 + 30 * HOUR + 2 * DAY).state.athlete.fitness).toBe(16)
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a future time', T0 + 5 * DAY],
  ])('resets %s references to now without decay', (_, reference) => {
    const state = { ...newGame(), fitnessDecayReference: reference }
    const result = applyFitnessDecay(state, T0)
    expect(result.state.athlete.fitness).toBe(20)
    expect(result.state.fitnessDecayReference).toBe(T0)
    expect(result.periods).toBe(0)
  })

  it('ignores a non-finite clock', () => {
    const state = newGame()
    expect(applyFitnessDecay(state, Number.NaN).state).toBe(state)
  })
})
