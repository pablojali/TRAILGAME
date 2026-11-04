import { describe, expect, it } from 'vitest'
import type { Attributes } from '../domain/athlete/athlete'
import { getRace, RACES } from '../domain/races/races'
import { RACE_STRATEGY, racePaces, type Intensity } from '../domain/races/strategyConfig'
import { parseGameState } from '../repositories/gameRepository'
import { newGame, onSunday, T0, withAthlete, withEntry } from '../test/gameFixtures'
import type { GameState } from './gameState'
import {
  getRaceField,
  getRaceSegments,
  getRivalStop,
  getSegmentCount,
  makeStop,
  runPlan,
  runSegment,
  snapshotRunner,
  typicalRunner,
  type StepContext,
} from './raceEngine'
import { getRaceFatigue, getRaceReport, raceCurrentDay, startRace, stepRace } from './races'
import { courseEffortKm, generateCourse, raceSeconds } from './raceSimulation'
import { executeCurrentDay } from './training'

const all = (value: number): Attributes => ({
  speed: value,
  endurance: value,
  climbing: value,
  technical: value,
  recovery: value,
  consistency: value,
})

function context(raceId: string, overrides: Partial<StepContext> = {}, recovery = 20): StepContext {
  const race = getRace(raceId)!
  return {
    race,
    field: getRaceField(race),
    runner: snapshotRunner({ ...all(20), recovery }, 50, 20, []),
    dayForm: 0,
    nutrition: { gel: false, bar: false },
    ...overrides,
  }
}

const SUNDAY = { week: 1, dayIndex: 6 }

/** A career on race Sunday with a pending entry for `raceId` and some gels and bars. */
function raceSunday(raceId = 'RACE-007', base: GameState = newGame()): { state: GameState; entryId: string } {
  const entered = withEntry({ ...base, consumables: { gel: 2, bar: 1 } }, raceId)
  return { state: onSunday(entered.state), entryId: entered.entry.id }
}

describe('segments (approved: clamp(round(km / 6), 2, 8), cut at equal distances)', () => {
  it('gives every race its number of segments (aid stations = segments − 1)', () => {
    expect(RACES.map(getSegmentCount)).toEqual([2, 2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 8])
  })

  it('adds up to the race exactly: distance, gain, loss and effort, with no empty segment', () => {
    for (const race of RACES) {
      const segments = getRaceSegments(race)
      const course = generateCourse(race)
      expect(segments.reduce((s, x) => s + x.distanceM, 0)).toBe(Math.round(race.distanceKm * 1000))
      expect(segments.reduce((s, x) => s + x.gainM, 0)).toBeCloseTo(race.elevationGainM, 6)
      expect(segments.reduce((s, x) => s + x.lossM, 0)).toBeCloseTo(race.elevationGainM, 6)
      expect(segments.reduce((s, x) => s + x.effortKm, 0)).toBeCloseTo(courseEffortKm(course), 6)
      for (const segment of segments) {
        expect(segment.distanceM).toBeGreaterThan(0)
        expect(segment.terrain.runnable + segment.terrain.climb + segment.terrain.descent).toBeCloseTo(1, 9)
        expect(segment.technicality).toBe(segment.terrain.descent > 0 ? race.technicality : 0)
      }
      // Equal distances (within a metre).
      const lengths = segments.map((s) => s.distanceM)
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1)
    }
  })
})

describe('calibration: Target pace with Normal stops is the race before strategies', () => {
  it('takes the same running time (in race time: × the course factor), plus the stops', () => {
    for (const race of RACES) {
      for (const recovery of [12, 20, 40]) {
        const ctx = context(race.id, {}, recovery)
        const plan = runPlan(ctx, 'target', 'normal')
        const stops = (ctx.field.segments.length - 1) * ctx.field.stopS.normal
        expect(plan.elapsedS - stops).toBeCloseTo(raceSeconds(generateCourse(race), ctx.runner) * ctx.field.timeScale, 6)
      }
    }
  })

  it('adds the same Fatigue as before for Recovery 20; a higher Recovery adds less', () => {
    for (const race of RACES) {
      const plan = runPlan(context(race.id), 'target', 'normal')
      expect(plan.fatigue - 20).toBeCloseTo(getRaceFatigue(race), 6)
      expect(runPlan(context(race.id, {}, 30), 'target', 'normal').fatigue).toBeLessThan(plan.fatigue)
      expect(runPlan(context(race.id, {}, 14), 'target', 'normal').fatigue).toBeGreaterThan(plan.fatigue)
    }
  })
})

describe('intensity', () => {
  it('is more tiring from Recovery to Hard; on a short race Hard all the way does not pay, a Hard finish does', () => {
    const ctx = context('RACE-001')
    const runs = (['recovery', 'easy', 'target', 'hard'] as Intensity[]).map((i) => runPlan(ctx, i, 'normal'))
    const fatigue = runs.map((r) => r.fatigue)
    expect([...fatigue].sort((a, b) => a - b)).toEqual(fatigue)
    // Recovery, Easy and Target: faster each step.
    expect(runs[0]!.elapsedS).toBeGreaterThan(runs[1]!.elapsedS)
    expect(runs[1]!.elapsedS).toBeGreaterThan(runs[2]!.elapsedS)
    // Owner decision (2 November 2026): in-race fatigue weighs more in short races.
    const target = runs[2]!.elapsedS
    expect(Math.abs(runs[3]!.elapsedS - target) / target).toBeLessThan(0.02)
    expect(runPlan(ctx, ['target', 'hard'], 'normal').elapsedS).toBeLessThan(Math.min(target, runs[3]!.elapsedS))
  })

  it('does not make Hard always best: on the longest races going out hard costs time', () => {
    const ctx = context('RACE-012')
    const target = runPlan(ctx, 'target', 'normal').elapsedS
    expect(runPlan(ctx, 'hard', 'normal').elapsedS).toBeGreaterThan(target)
    // Holding back pays there: Easy all the way beats Target.
    expect(runPlan(ctx, 'easy', 'normal').elapsedS).toBeLessThan(target)
  })

  it('makes later segments slower after pushing early (the in-race fatigue counts)', () => {
    const ctx = context('RACE-009')
    const start = { elapsedS: 0, fatigue: 20, splits: [] }
    const calm = makeStop(ctx, runSegment(ctx, start, 'target'), 'normal')
    const pushed = makeStop(ctx, runSegment(ctx, start, 'hard'), 'normal')
    expect(pushed.fatigue).toBeGreaterThan(calm.fatigue)
    const second = (p: typeof calm) => runSegment(ctx, p, 'target').elapsedS - p.elapsedS
    expect(second(pushed)).toBeGreaterThan(second(calm))
  })
})

describe('aid stations', () => {
  it('recover more with a longer stop, never below the Fatigue before the race, at most 60% of the gain', () => {
    const ctx = context('RACE-009')
    const arrived = runSegment(ctx, { elapsedS: 0, fatigue: 20, splits: [] }, 'hard')
    const gained = arrived.fatigue - 20
    const after = (['quick', 'normal', 'slow'] as const).map((stop) => makeStop(ctx, arrived, stop))
    // Stops scale with the race (35 km +2200 m: 25 s, 1:45 min, 4:25 min).
    expect(after.map((p) => p.elapsedS - arrived.elapsedS)).toEqual([25, 105, 265])
    expect(after.map((p) => arrived.fatigue - p.fatigue)).toEqual([0.1 * gained, 0.25 * gained, 0.45 * gained].map((x) => expect.closeTo(x, 9)))
    // A high Recovery recovers more, but never more than 60% of what the race added.
    const strong = context('RACE-009', {}, 200)
    const strongArrived = runSegment(strong, { elapsedS: 0, fatigue: 20, splits: [] }, 'hard')
    const slow = makeStop(strong, strongArrived, 'slow')
    expect(strongArrived.fatigue - slow.fatigue).toBeCloseTo(0.6 * (strongArrived.fatigue - 20), 9)
    expect(slow.fatigue).toBeGreaterThan(20)
    expect(after[2]!.splits.at(-1)).toMatchObject({ stop: 'slow', stopS: 265 })
  })
})

describe('nutrition (one gel and one bar at most, for the whole race)', () => {
  it('the gel saves 1.5% of the time, the cereal bar 1.5% of the fatigue gained', () => {
    const plain = runPlan(context('RACE-001'), 'target', 'normal')
    const gel = runPlan(context('RACE-001', { nutrition: { gel: true, bar: false } }), 'target', 'normal')
    const bar = runPlan(context('RACE-001', { nutrition: { gel: false, bar: true } }), 'target', 'normal')
    // Forest First Steps: one Normal stop of 20 s.
    expect(plain.elapsedS - 20 - (gel.elapsedS - 20)).toBeCloseTo((plain.elapsedS - 20) * 0.015, 6)
    expect(gel.fatigue).toBe(plain.fatigue)
    expect(bar.fatigue - 20).toBeCloseTo((plain.fatigue - 20) * 0.985, 9)
  })
})

describe('field (owner decisions, 2 and 4 November 2026)', () => {
  const finishOf = (raceId: string, levels: number) => {
    const race = getRace(raceId)!
    // The typical runner with the best gear of the level, a gel and a bar (owner decision, 4 November 2026).
    const typical = typicalRunner(Math.max(1, race.recommendedLevel + levels))
    const ctx = context(raceId, {
      runner: snapshotRunner(typical.attributes, typical.fitness, typical.fatigue, typical.equipment),
      nutrition: RACE_STRATEGY.typicalNutrition,
    })
    return runPlan(ctx, 'target', 'normal').splits.at(-1)!.position
  }

  it('has 30 runners: 2 levels above the race finishes near 2nd, its level 15th, 2 levels below near 22nd', () => {
    for (const race of RACES) {
      expect(getRaceField(race).rivalFinishS).toHaveLength(29)
      expect(finishOf(race.id, 0)).toBe(15)
      if (race.recommendedLevel < 30) {
        expect([finishOf(race.id, 2), finishOf(race.id, -2)]).toEqual([2, 22])
      } else {
        // Past the Fitness cap the typical runner's Fitness stops growing, so 2 levels count for less; the
        // minimum gap still keeps them apart (ahead of and behind the race's level).
        expect(finishOf(race.id, 2), race.id).toBeLessThan(15)
        expect(finishOf(race.id, -2), race.id).toBeGreaterThanOrEqual(17)
      }
    }
  })

  it('runs at the owner paces: winner and last by effort-km', () => {
    expect(racePaces(6.2)).toEqual({ winner: 3.2, last: 7 })
    expect(racePaces(65)).toEqual({ winner: 4, last: 8 })
    expect(racePaces(118)).toEqual({ winner: 4.5, last: 9 })
    expect(racePaces(165)).toEqual({ winner: 5, last: 10 })
    expect(racePaces(91.5)).toEqual({ winner: 4.25, last: 8.5 })
    for (const race of RACES) {
      const field = getRaceField(race)
      const effort = courseEffortKm(generateCourse(race))
      const paces = racePaces(effort)
      expect(field.rivalBaseS[0]! / 60 / effort).toBeCloseTo(paces.winner, 2)
      expect(field.rivalBaseS.at(-1)! / 60 / effort).toBeCloseTo(paces.last, 2)
      // Finishing order: always slower down the field.
      field.rivalFinishS.forEach((t, i) => i === 0 || expect(t).toBeGreaterThan(field.rivalFinishS[i - 1]!))
    }
    // Forest First Steps: won in about 20 minutes, last in about 43 (plus the stop).
    const forest = getRaceField(getRace('RACE-001')!)
    expect(Math.round(forest.rivalBaseS[0]! / 60)).toBe(20)
    expect(Math.round(forest.rivalBaseS.at(-1)! / 60)).toBe(43)
  })
})

describe('rivals', () => {
  it('stop by rank: front third Quick, middle Normal, back third Slow', () => {
    expect(Array.from({ length: 29 }, (_, i) => getRivalStop(i, 29))).toEqual([
      ...Array<string>(10).fill('quick'),
      ...Array<string>(10).fill('normal'),
      ...Array<string>(9).fill('slow'),
    ])
  })

  it('reach every aid station in order, keeping the finishing order', () => {
    const field = getRaceField(getRace('RACE-012')!)
    expect(field.rivalArrivalsS).toHaveLength(7)
    field.rivalArrivalsS.forEach((arrivals, k) => {
      arrivals.forEach((t, i) => {
        expect(t).toBeGreaterThan(k === 0 ? 0 : field.rivalArrivalsS[k - 1]![i]!)
        expect(t).toBeLessThan(field.rivalFinishS[i]!)
      })
    })
    expect([...field.rivalFinishS].sort((a, b) => a - b)).toEqual(field.rivalFinishS)
  })
})

describe('race in progress', () => {
  it('starts on race Sunday, takes the gel and bar from the stock and runs the first segment', () => {
    const { state, entryId } = raceSunday()
    const started = startRace(state, SUNDAY, entryId, { intensity: 'hard', gel: true, bar: true }, T0)
    if (!started.ok) throw new Error(started.error)
    expect(started.state.consumables).toEqual({ gel: 1, bar: 0 })
    expect(started.state.activeRace).toMatchObject({ entryId, raceId: 'RACE-007', nutrition: { gel: true, bar: true } })
    expect(started.state.activeRace!.splits).toEqual([expect.objectContaining({ intensity: 'hard' })])
    // Nothing else changes until the finish: no XP, coins, Fatigue or day.
    expect({ ...started.state, activeRace: null, consumables: state.consumables }).toEqual(state)
    // The career with its race in progress saves and loads as it is.
    expect(parseGameState(JSON.parse(JSON.stringify(started.state)), T0)).toEqual(started.state)
  })

  it('refuses a second start, missing nutrition, an unknown intensity and training meanwhile', () => {
    const { state, entryId } = raceSunday()
    const noStock = { ...state, consumables: { gel: 0, bar: 0 } }
    expect(startRace(noStock, SUNDAY, entryId, { intensity: 'target', gel: true, bar: false }, T0)).toEqual({ ok: false, error: 'no-gel' })
    expect(startRace(noStock, SUNDAY, entryId, { intensity: 'target', gel: false, bar: true }, T0)).toEqual({ ok: false, error: 'no-bar' })
    expect(startRace(state, SUNDAY, entryId, { intensity: 'sprint' as Intensity, gel: false, bar: false }, T0)).toEqual({ ok: false, error: 'unknown-intensity' })
    const started = startRace(state, SUNDAY, entryId, { intensity: 'target', gel: false, bar: false }, T0)
    if (!started.ok) throw new Error(started.error)
    expect(startRace(started.state, SUNDAY, entryId, { intensity: 'target', gel: false, bar: false }, T0)).toEqual({ ok: false, error: 'race-in-progress' })
    expect(executeCurrentDay(started.state, SUNDAY, T0)).toEqual({ ok: false, error: 'race-day' })
  })

  it('steps one aid station at a time, refusing stale steps, and finishes once with the splits', () => {
    const { state, entryId } = raceSunday('RACE-007') // 4 segments
    const started = startRace(state, SUNDAY, entryId, { intensity: 'easy', gel: true, bar: false }, T0)
    if (!started.ok) throw new Error(started.error)
    let current = started.state
    expect(stepRace(current, { segment: 2, stop: 'normal', intensity: 'target' }, T0)).toEqual({ ok: false, error: 'wrong-segment' })
    expect(stepRace(current, { segment: 1, stop: 'nap' as never, intensity: 'target' }, T0)).toEqual({ ok: false, error: 'unknown-stop' })
    const plan = [
      { stop: 'quick', intensity: 'target' },
      { stop: 'slow', intensity: 'hard' },
    ] as const
    for (const [i, step] of plan.entries()) {
      const next = stepRace(current, { segment: i + 1, ...step }, T0)
      if (!next.ok || next.value.finished) throw new Error('expected another aid station')
      current = next.value.state
      expect(getRaceReport(current)).toMatchObject({ segmentsDone: i + 2, segmentCount: 4 })
    }
    const last = stepRace(current, { segment: 3, stop: 'normal', intensity: 'hard' }, T0 + 1000)
    if (!last.ok || !last.value.finished) throw new Error('expected the finish')
    const { state: after, entry } = last.value.value
    expect(after.activeRace).toBeNull()
    expect(after.week).toMatchObject({ number: 2, currentDayIndex: 0 })
    expect(entry.result.splits!.map((s) => [s.intensity, s.stop ?? null])).toEqual([
      ['easy', 'quick'],
      ['target', 'slow'],
      ['hard', 'normal'],
      ['hard', null],
    ])
    expect(entry.result.nutrition).toEqual({ gel: true, bar: false })
    expect(entry.result.timeS).toBe(entry.result.splits!.at(-1)!.arrivalS)
    // Segment and stop times add up to the race time.
    expect(entry.result.splits!.reduce((sum, s) => sum + s.segmentS + (s.stopS ?? 0), 0)).toBe(entry.result.timeS)
    expect(entry.result.gapS).toBe(entry.result.timeS - entry.result.referenceTimeS)
    // A repeated last step finds no race in progress.
    expect(stepRace(after, { segment: 3, stop: 'normal', intensity: 'hard' }, T0)).toEqual({ ok: false, error: 'no-race-in-progress' })
    expect(parseGameState(JSON.parse(JSON.stringify(after)), T0)).toEqual(after)
  })

  it('reports position, gaps, energy and the next segment at an aid station', () => {
    const { state, entryId } = raceSunday('RACE-009')
    const started = startRace(state, SUNDAY, entryId, { intensity: 'target', gel: false, bar: false }, T0)
    if (!started.ok) throw new Error(started.error)
    const report = getRaceReport(started.state)!
    const field = getRaceField(getRace('RACE-009')!)
    expect(report.next).toEqual(field.segments[1])
    expect(report.energy).toBeCloseTo(100 - report.fatigue, 9)
    const arrivals = field.rivalArrivalsS[0]!
    expect(report.position).toBe(1 + arrivals.filter((t) => t < report.elapsedS).length)
    if (report.gapAheadS !== null) expect(report.gapAheadS).toBeGreaterThan(0)
    if (report.gapBehindS !== null) expect(report.gapBehindS).toBeGreaterThanOrEqual(0)
    expect(getRaceReport(state)).toBeNull()
  })

  it('applies the injury rule from the in-race fatigue at the finish', () => {
    const { state, entryId } = raceSunday('RACE-001', withAthlete(newGame(), { fatigue: 80, fitness: 60 }))
    const hard = startRace(state, SUNDAY, entryId, { intensity: 'hard', gel: false, bar: false }, T0)
    if (!hard.ok) throw new Error(hard.error)
    const finished = stepRace(hard.state, { segment: 1, stop: 'quick', intensity: 'hard' }, T0)
    if (!finished.ok || !finished.value.finished) throw new Error('expected the finish')
    expect(finished.value.value.entry.result).toMatchObject({ injured: true, fitnessChange: -15 })
    // The default plan stays under the threshold from the same start.
    const calm = raceCurrentDay(state, SUNDAY, entryId, T0)
    expect(calm.ok && calm.value.entry.result.injured).toBe(false)
  })

  it('is deterministic: the same decisions give the same result', () => {
    const { state, entryId } = raceSunday('RACE-005')
    const run = () => raceCurrentDay(state, SUNDAY, entryId, T0)
    expect(run()).toEqual(run())
  })
})

describe('saved race in progress', () => {
  it('rejects a race in progress that does not match the career', () => {
    const { state, entryId } = raceSunday()
    const started = startRace(state, SUNDAY, entryId, { intensity: 'target', gel: false, bar: false }, T0)
    if (!started.ok) throw new Error(started.error)
    const active = started.state.activeRace!
    const variants = [
      { ...active, entryId: 'entry-9' },
      { ...active, raceId: 'RACE-001' },
      { ...active, splits: [] },
      { ...active, splits: Array.from({ length: 4 }, () => active.splits[0]) }, // as many as segments
      { ...active, nutrition: { gel: 'yes', bar: false } },
      { ...active, elapsedS: 0 },
    ]
    for (const activeRace of variants) {
      expect(parseGameState(JSON.parse(JSON.stringify({ ...started.state, activeRace })), T0)).toBeNull()
    }
    // Only on race Sunday.
    expect(parseGameState(JSON.parse(JSON.stringify({ ...started.state, week: { ...started.state.week, currentDayIndex: 5 } })), T0)).toBeNull()
  })
})
