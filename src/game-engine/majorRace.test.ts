import { describe, expect, it } from 'vitest'
import { getRace } from '../domain/races/races'
import { newGame } from '../test/gameFixtures'
import {
  applyMajorDecisions,
  automaticDecision,
  checkpointShares,
  liveStandings,
  initialState,
  majorContext,
  majorField,
  majorStandings,
  runMajorSegment,
  type MajorRunner,
  type MajorRunnerState,
} from './majorRace'
import { makeStop, runSegment } from './raceEngine'

const race = getRace('RACE-007')! // 4 segments
const field = majorField(race)
const athlete = newGame().athlete
const player: MajorRunner = {
  slot: 1,
  kind: 'PLAYER',
  level: 5,
  snapshot: { level: 5, attributes: { ...athlete.attributes }, fitness: 50, fatigue: 20, equipment: [], nutrition: { gel: true, bar: false } },
  plan: {
    style: null,
    gel: true,
    bar: false,
    segments: [
      { intensity: 'hard', stop: 'quick' },
      { intensity: 'easy', stop: 'slow' },
      { intensity: 'target', stop: 'normal' },
      { intensity: 'hard', stop: null },
    ],
  },
}
const grid: MajorRunner[] = [player, ...Array.from({ length: 49 }, (_, i): MajorRunner => ({ slot: i + 2, kind: 'NPC', level: 1 + (i % 8), snapshot: null, plan: null }))]

function runRace(decide: (runner: MajorRunner, state: MajorRunnerState, segment: number) => ReturnType<typeof automaticDecision>) {
  const contexts = new Map(grid.map((r) => [r.slot, majorContext(race, field, 'event-1', r)]))
  let runners = grid.map((r) => ({ slot: r.slot, state: initialState(contexts.get(r.slot)!, r) }))
  const n = field.segments.length
  for (let k = 0; k < n; k++) {
    runners = runMajorSegment(contexts, runners)
    if (k < n - 1) {
      runners = applyMajorDecisions(
        contexts,
        runners.map(({ slot, state }) => ({ slot, state, decision: decide(grid.find((r) => r.slot === slot)!, state, k) })),
      )
    }
  }
  return { runners, contexts }
}

describe('Sunday Major race engine (phase 3)', () => {
  it('runs the solo engine for every runner: a player following their plan gets exactly the solo result', () => {
    const { runners, contexts } = runRace((runner, state, k) => automaticDecision(runner, state, k, field.segments.length))
    const ctx = contexts.get(1)!
    let solo = { elapsedS: 0, fatigue: 20, splits: [] as ReturnType<typeof runSegment>['splits'] }
    player.plan!.segments.forEach((s) => {
      solo = runSegment(ctx, solo, s.intensity)
      if (s.stop) solo = makeStop(ctx, solo, s.stop)
    })
    const mine = runners.find((r) => r.slot === 1)!.state.progress
    expect(mine.elapsedS).toBeCloseTo(solo.elapsedS, 9)
    expect(mine.fatigue).toBeCloseTo(solo.fatigue, 9)
    expect(mine.splits.map((s) => [s.intensity, s.stop ?? null])).toEqual(solo.splits.map((s) => [s.intensity, s.stop ?? null]))
  })

  it('ranks the 50 runners among themselves after every segment, the same every time', () => {
    const a = runRace((runner, state, k) => automaticDecision(runner, state, k, field.segments.length))
    const b = runRace((runner, state, k) => automaticDecision(runner, state, k, field.segments.length))
    expect(a.runners).toEqual(b.runners)
    for (let k = 0; k < field.segments.length; k++) {
      const positions = a.runners.map((r) => r.state.progress.splits[k]!.position).sort((x, y) => x - y)
      expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    }
    const table = majorStandings(a.runners)
    expect(table[0]!.gapS).toBe(0)
    expect(table.every((row, i) => i === 0 || row.timeS >= table[i - 1]!.timeS)).toBe(true)
    expect(table.find((row) => row.slot === 1)!.position).toBe(a.runners.find((r) => r.slot === 1)!.state.progress.splits.at(-1)!.position)
  })

  it('takes the plan when the runner does not decide, NPCs their Balanced plan with Normal stops', () => {
    const contexts = new Map(grid.map((r) => [r.slot, majorContext(race, field, 'event-1', r)]))
    const start = initialState(contexts.get(1)!, player)
    expect(start.next).toBe('hard')
    expect(automaticDecision(player, start, 1, 4)).toEqual({ stop: 'slow', intensity: 'target' })
    const npc = grid[1]!
    const npcStart = initialState(contexts.get(npc.slot)!, npc)
    expect(npcStart.npcPlan!.intensities).toHaveLength(4)
    expect(automaticDecision(npc, npcStart, 0, 4)).toEqual({ stop: 'normal', intensity: npcStart.npcPlan!.intensities[1] })
  })

  it('lets a decision change the race: a slow stop takes longer than the plan’s quick one', () => {
    const planned = runRace((runner, state, k) => automaticDecision(runner, state, k, field.segments.length))
    const slower = runRace((runner, state, k) => (runner.slot === 1 && k === 0 ? { stop: 'slow', intensity: 'easy' } : automaticDecision(runner, state, k, field.segments.length)))
    const a = planned.runners.find((r) => r.slot === 1)!.state.progress.splits[0]!
    const b = slower.runners.find((r) => r.slot === 1)!.state.progress.splits[0]!
    expect(b.stopS!).toBeGreaterThan(a.stopS!)
  })
})

describe('Major live tracking (checkpoints)', () => {
  const flat = [{ block: { lengthM: 4000, gainM: 0 } }]
  const climbThenFlat = [{ block: { lengthM: 2000, gainM: 200 } }, { block: { lengthM: 2000, gainM: 0 } }]

  it('puts the checkpoints at equal distances, with the time following the climbs', () => {
    const even = checkpointShares(flat, 4)
    expect(even.map((c) => c.distanceShare)).toEqual([0.25, 0.5, 0.75, 1])
    expect(even.map((c) => c.timeShare)).toEqual([0.25, 0.5, 0.75, 1])
    // 2 km climbing 200 m weigh 4 effort-km, the flat 2 km weigh 2: half the distance is 2/3 of the time.
    const climb = checkpointShares(climbThenFlat, 2)
    expect(climb[0]!.timeShare).toBeCloseTo(2 / 3)
    expect(climb[1]!.timeShare).toBe(1)
    expect(checkpointShares(getRaceSegmentsOf(0), 8)).toHaveLength(8)
  })

  it('reveals overtakes checkpoint by checkpoint and ends in the official order', () => {
    const shares = checkpointShares(flat, 8)
    // Ana leaves the aid station 60 s after Bo but runs the segment 200 s faster.
    const runners = [
      { slot: 1, departS: 1060, arriveS: 1860 },
      { slot: 2, departS: 1000, arriveS: 2000 },
    ]
    expect(liveStandings(runners, shares, 0).map((r) => r.slot)).toEqual([2, 1])
    expect(liveStandings(runners, shares, 1).map((r) => r.slot)).toEqual([2, 1])
    const end = liveStandings(runners, shares, 8)
    expect(end.map((r) => [r.slot, r.position, r.distanceShare])).toEqual([[1, 1, 1], [2, 2, 1]])
    expect(end[0]).toMatchObject({ checkpoint: 8, passedAtS: 1860 })
    // Somewhere on the way Ana passes Bo.
    const order = Array.from({ length: 9 }, (_, step) => liveStandings(runners, shares, step)[0]!.slot)
    expect(order[0]).toBe(2)
    expect(order[8]).toBe(1)
  })
})

function getRaceSegmentsOf(index: number) {
  return field.segments[index]!.pieces
}
