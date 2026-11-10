import { describe, expect, it } from 'vitest'
import { RACES } from '../domain/races/races'
import { getRaceField, typicalRunner, type StepContext } from './raceEngine'
import { planRest, RACE_STYLES, runRest, STYLE_INTENSITIES } from './racePlan'

const contextFor = (raceId: string): StepContext => {
  const race = RACES.find((r) => r.id === raceId)!
  return {
    race,
    field: getRaceField(race),
    runner: typicalRunner(race.recommendedLevel, race.category),
    dayForm: 0,
    nutrition: { gel: false, bar: false },
  }
}
const startOf = (ctx: StepContext) => ({ elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] })

describe('automatic race strategy (owner request, 10 November 2026)', () => {
  it('plans every segment within each style’s intensities, fastest when aggressive and freshest when conservative', () => {
    for (const race of RACES) {
      const ctx = contextFor(race.id)
      const start = startOf(ctx)
      const n = ctx.field.segments.length
      const results = Object.fromEntries(
        RACE_STYLES.map((style) => {
          const plan = planRest(ctx, start, style)
          expect(plan).toHaveLength(n)
          expect(plan.every((i) => STYLE_INTENSITIES[style].includes(i))).toBe(true)
          return [style, runRest(ctx, start, plan)]
        }),
      )
      const target = runRest(ctx, start, Array(n).fill('target'))
      expect(results.aggressive!.elapsedS).toBeLessThanOrEqual(target.elapsedS)
      expect(results.aggressive!.elapsedS).toBeLessThanOrEqual(results.balanced!.elapsedS)
      expect(results.balanced!.elapsedS).toBeLessThanOrEqual(results.conservative!.elapsedS)
      expect(results.conservative!.fatigue).toBeLessThanOrEqual(results.balanced!.fatigue)
      expect(results.balanced!.fatigue).toBeLessThanOrEqual(results.aggressive!.fatigue)
    }
  })

  it('keeps the segments the player set and plans only what is left', () => {
    const ctx = contextFor('RACE-009')
    const start = startOf(ctx)
    const plan = planRest(ctx, start, 'conservative', [null, 'hard', null, null, null, 'hard'])
    expect(plan[1]).toBe('hard')
    expect(plan[5]).toBe('hard')
    const afterTwo = runRest(ctx, start, plan.slice(0, 2))
    expect(planRest(ctx, afterTwo, 'balanced')).toHaveLength(ctx.field.segments.length - 2)
    expect(planRest(ctx, runRest(ctx, start, plan), 'balanced')).toEqual([])
  })
})
