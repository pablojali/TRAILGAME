import { describe, expect, it } from 'vitest'
import { applyFitnessDecay, DECAY_PERIOD_MS } from './fitnessDecay'
import { execute, newGame, T0, withAthlete, withSession } from '../test/gameFixtures'

const DAY = DECAY_PERIOD_MS
const HOUR = DAY / 24

describe('applyFitnessDecay', () => {
  // The first full day without playing is free (owner decision, 30 October 2026).
  it('does nothing before two full 24-hour periods', () => {
    const state = newGame()
    expect(applyFitnessDecay(state, T0 + DAY)).toEqual({ state, periods: 0, fitnessLost: 0 })
    expect(applyFitnessDecay(state, T0 + 2 * DAY - 1)).toEqual({ state, periods: 0, fitnessLost: 0 })
  })

  it('never decays when the player plays once a day at the same time', () => {
    let state = newGame()
    for (let day = 1; day <= 14; day++) {
      state = applyFitnessDecay(state, T0 + day * DAY).state
      state = execute(withSession(state, 'strength'), T0 + day * DAY).state
    }
    expect(state.athlete.fitness).toBe(20 + 14 * 2)
  })

  it('removes 1 Fitness at exactly 48 hours, keeping the free day ahead of the reference', () => {
    const result = applyFitnessDecay(newGame(), T0 + 2 * DAY)
    expect(result.state.athlete.fitness).toBe(19)
    expect(result.periods).toBe(1)
    expect(result.state.fitnessDecayReference).toBe(T0 + DAY)
  })

  it('applies several elapsed periods at once (72 h: 20 → 18)', () => {
    const result = applyFitnessDecay(newGame(), T0 + 3 * DAY)
    expect(result.state.athlete.fitness).toBe(18)
    expect(result.fitnessLost).toBe(2)
  })

  it('keeps partial time for the next application', () => {
    const first = applyFitnessDecay(newGame(), T0 + 60 * HOUR)
    expect(first.state.athlete.fitness).toBe(19)
    expect(first.state.fitnessDecayReference).toBe(T0 + DAY)
    // 12 more hours complete the third period.
    const second = applyFitnessDecay(first.state, T0 + 72 * HOUR)
    expect(second.state.athlete.fitness).toBe(18)
  })

  it('never applies the same period twice', () => {
    const once = applyFitnessDecay(newGame(), T0 + 3 * DAY + 5 * HOUR).state
    const again = applyFitnessDecay(once, T0 + 3 * DAY + 5 * HOUR)
    expect(again.periods).toBe(0)
    expect(again.state).toBe(once)
    expect(once.athlete.fitness).toBe(18)
    // Checking every hour gives the same total as one late check.
    let hourly = newGame()
    for (let h = 1; h <= 10 * 24; h++) hourly = applyFitnessDecay(hourly, T0 + h * HOUR).state
    expect(hourly.athlete.fitness).toBe(applyFitnessDecay(newGame(), T0 + 10 * DAY).state.athlete.fitness)
    expect(hourly.athlete.fitness).toBe(11)
  })

  it('stops at 0 and still advances the reference', () => {
    const state = withAthlete(newGame(), { fitness: 2 })
    const result = applyFitnessDecay(state, T0 + 10 * DAY)
    expect(result.state.athlete.fitness).toBe(0)
    expect(result.fitnessLost).toBe(2)
    expect(result.state.fitnessDecayReference).toBe(T0 + 9 * DAY)
    expect(applyFitnessDecay(result.state, T0 + 10 * DAY + 1).state.athlete.fitness).toBe(0)
  })

  it('does not reapply old periods after Fitness reached 0 and training resumed', () => {
    const atZero = applyFitnessDecay(withAthlete(newGame(), { fitness: 1 }), T0 + 5 * DAY).state
    const trained = execute(atZero, T0 + 5 * DAY + HOUR).state
    expect(trained.athlete.fitness).toBe(2)
    expect(applyFitnessDecay(trained, T0 + 7 * DAY).state.athlete.fitness).toBe(2)
  })

  it('counts from the last played day', () => {
    const trained = execute(newGame(), T0 + 30 * HOUR).state // fitness 22
    expect(applyFitnessDecay(trained, T0 + 77 * HOUR).state.athlete.fitness).toBe(22)
    expect(applyFitnessDecay(trained, T0 + 78 * HOUR).state.athlete.fitness).toBe(21)
  })

  it('is reset by a played Rest day too: decay only counts days not played (owner decision, 30 October 2026)', () => {
    const rested = execute(withSession(newGame(), 'rest'), T0 + 30 * HOUR).state
    expect(rested.athlete.fitness).toBe(18) // Rest with no active day before it: −2
    expect(applyFitnessDecay(rested, T0 + 3 * DAY).state.athlete.fitness).toBe(18)
    expect(applyFitnessDecay(rested, T0 + 30 * HOUR + 2 * DAY).state.athlete.fitness).toBe(17)
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
