import { describe, expect, it } from 'vitest'
import { getRace } from '../domain/races/races'
import { newGame } from '../test/gameFixtures'
import {
  applyMajorDecisions,
  automaticDecision,
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
