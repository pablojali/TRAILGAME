import { describe, expect, it } from 'vitest'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import type { MajorRunnerState } from '../game-engine/majorRace'
import { getRace } from '../domain/races/races'
import { rankingPoints } from '../domain/ranking/ranking'
import { applyMajorReward, majorPrize } from '../game-engine/majorRewards'
import { parseGameState } from '../repositories/gameRepository'
import { newGame } from '../test/gameFixtures'
import { advanceMajorRaces, type DueCategory, type GridRow, type RaceStore, type StoredDecision } from './majorOrchestrator'

const START = Date.UTC(2026, 10, 15, 18)
const RUN_S = 150
const WINDOW_S = 90
const athlete = newGame().athlete

/** An in-memory store with the database's rules: compare-and-swap steps, decisions only in the window. */
function memoryStore(raceId = 'RACE-007') {
  const rows: GridRow[] = [
    {
      id: 'p1', categoryId: 'c1', slot: 1, kind: 'PLAYER', level: 5, state: null,
      snapshot: { level: 5, attributes: { ...athlete.attributes }, fitness: 50, fatigue: 20, equipment: [], nutrition: { gel: false, bar: false } },
      plan: null,
    },
    ...Array.from({ length: 49 }, (_, i): GridRow => ({ id: `n${i}`, categoryId: 'c1', slot: i + 2, kind: 'NPC', level: 1 + (i % 8), snapshot: null, plan: null, state: null })),
  ]
  let event: 'LOCKED' | 'RUNNING' | 'FINISHED' = 'LOCKED'
  let cat = { phase: 'WAITING' as DueCategory['phase'] | 'WAITING' | 'FINISHED', segment: 0, segments: 0, endsAt: 0, version: 0 }
  const decisions = new Map<string, StoredDecision & { segment: number }>()
  const commits: string[] = []
  const finish: { results: NonNullable<Parameters<RaceStore['commitStep']>[0]['results']>; rewards: NonNullable<Parameters<RaceStore['commitStep']>[0]['rewards']> } = { results: [], rewards: [] }
  const store: RaceStore = {
    startableEvents: async (now) => (event === 'LOCKED' && now >= START ? [{ id: 'e1', raceId }] : []),
    grid: async () => rows,
    start: async (_e, segments, states) => {
      if (event !== 'LOCKED') return false
      event = 'RUNNING'
      for (const s of states) rows.find((r) => r.id === s.id)!.state = s.state
      cat = { phase: 'RUNNING', segment: 0, segments, endsAt: START + RUN_S * 1000, version: 1 }
      return true
    },
    dueCategories: async (now) =>
      (cat.phase === 'RUNNING' || cat.phase === 'PA') && cat.endsAt <= now
        ? [{ id: 'c1', eventId: 'e1', eventName: 'Major', raceId, phase: cat.phase, segment: cat.segment, segments: cat.segments, phaseEndsAt: cat.endsAt, version: cat.version, runningS: RUN_S, windowS: WINDOW_S }]
        : [],
    categoryGrid: async () => rows.map((r) => ({ ...r })),
    decisions: async (_c, segment) => [...decisions.values()].filter((d) => d.segment === segment),
    commitStep: async (step) => {
      if (step.version !== cat.version) return false
      if (cat.phase === 'PA' && [...decisions.values()].filter((d) => d.segment === cat.segment && d.source === 'PLAYER').length !== step.playerDecisionsSeen) return false
      for (const s of step.states) rows.find((r) => r.id === s.id)!.state = s.state
      for (const d of step.decisions) decisions.set(`${d.participantId}:${d.segment}`, { ...d, source: 'AUTO' })
      cat = { ...cat, phase: step.phase, segment: step.segment, endsAt: step.endsAt ?? 0, version: cat.version + 1 }
      commits.push(`${step.phase}${step.segment}`)
      if (step.phase === 'FINISHED') {
        event = 'FINISHED'
        finish.results = step.results ?? []
        finish.rewards = step.rewards ?? []
      }
      return true
    },
  }
  const decide = (segment: number, stop: AidStop, intensity: Intensity, now: number) => {
    if (cat.phase !== 'PA' || cat.segment !== segment || now >= cat.endsAt) throw new Error('window closed')
    decisions.set(`p1:${segment}`, { participantId: 'p1', segment, stop, intensity, source: 'PLAYER' })
  }
  return { store, rows, decide, commits, finish, state: () => ({ event, ...cat }) }
}

const player = (rows: GridRow[]) => rows.find((r) => r.id === 'p1')!.state as MajorRunnerState

describe('Major race orchestrator (phase 3)', () => {
  it('starts on time, runs each segment when its phase ends, opens and closes the aid stations, and finishes', async () => {
    const m = memoryStore()
    expect(await advanceMajorRaces(m.store, START - 1000)).toEqual({ started: 0, steps: 0 })
    expect(await advanceMajorRaces(m.store, START)).toEqual({ started: 1, steps: 0 })
    expect(player(m.rows).progress.splits).toHaveLength(0)
    // Segment 1 runs for the 150 s running phase; then aid station 1 is open for 90 s.
    await advanceMajorRaces(m.store, START + 149_000)
    expect(m.state().phase).toBe('RUNNING')
    await advanceMajorRaces(m.store, START + 150_000)
    expect(m.state()).toMatchObject({ phase: 'PA', segment: 0, endsAt: START + 240_000 })
    expect(player(m.rows).progress.splits).toHaveLength(1)

    // The player decides in the window; the NPCs get their automatic decision when it closes.
    m.decide(0, 'slow', 'recovery', START + 200_000)
    await advanceMajorRaces(m.store, START + 240_000)
    expect(m.state()).toMatchObject({ phase: 'RUNNING', segment: 1 })
    expect(player(m.rows).progress.splits[0]!.stop).toBe('slow')
    expect(player(m.rows).next).toBe('recovery')
    expect(() => m.decide(0, 'quick', 'hard', START + 241_000)).toThrow('window closed')

    // Far later: the call catches up through every phase (no decision: the plan), once each.
    await advanceMajorRaces(m.store, START + 3_600_000)
    expect(m.state()).toMatchObject({ event: 'FINISHED', phase: 'FINISHED', segment: 3 })
    expect(m.commits).toEqual(['PA0', 'RUNNING1', 'PA1', 'RUNNING2', 'PA2', 'RUNNING3', 'FINISHED3'])
    const positions = m.rows.map((r) => (r.state as MajorRunnerState).progress.splits.at(-1)!.position).sort((a, b) => a - b)
    expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    // The finish (phase 5): everyone's place and time, a reward for the player only.
    expect(m.finish.results.map((r) => r.position).sort((a, b) => a - b)).toEqual(positions)
    expect(m.finish.rewards).toHaveLength(1)
    const reward = m.finish.rewards[0]!
    const mine = player(m.rows)
    expect(reward.participantId).toBe('p1')
    expect(reward.payload).toMatchObject({
      eventId: 'e1',
      raceId: 'RACE-007',
      position: mine.progress.splits.at(-1)!.position,
      timeS: mine.progress.splits.at(-1)!.arrivalS,
      fieldSize: 50,
      startedAt: START,
      finishedAt: START + (4 * RUN_S + 3 * WINDOW_S) * 1000,
      fatigue: 20,
      levelAtStart: 5,
    })
    expect(reward.payload.rivalTimesS).toHaveLength(49)
    expect(reward.payload.splits).toHaveLength(4)
    // Nothing left to do.
    expect(await advanceMajorRaces(m.store, START + 7_200_000)).toEqual({ started: 0, steps: 0 })
  })

  it('never applies a step twice when calls overlap, and gives the same race as one call', async () => {
    const a = memoryStore()
    const b = memoryStore()
    await advanceMajorRaces(a.store, START)
    await advanceMajorRaces(b.store, START)
    // Overlapping calls on store a; one call on store b.
    await Promise.all([advanceMajorRaces(a.store, START + 3_600_000), advanceMajorRaces(a.store, START + 3_600_000), advanceMajorRaces(a.store, START + 3_600_000)])
    await advanceMajorRaces(b.store, START + 3_600_000)
    expect(a.commits).toEqual(b.commits)
    expect(a.rows.map((r) => r.state)).toEqual(b.rows.map((r) => r.state))
  })

  it('a decision arriving while a step is computed makes that step retry with it', async () => {
    const m = memoryStore()
    await advanceMajorRaces(m.store, START)
    await advanceMajorRaces(m.store, START + 150_000)
    const original = m.store.decisions
    let injected = false
    m.store.decisions = async (c, s) => {
      const read = await original(c, s)
      if (!injected) {
        injected = true
        m.decide(0, 'quick', 'hard', START + 239_000)
      }
      return read
    }
    await advanceMajorRaces(m.store, START + 240_000)
    expect(player(m.rows).progress.splits[0]!.stop).toBe('quick')
    expect(player(m.rows).next).toBe('hard')
  })
})

describe('Major results in the career (phase 5)', () => {
  async function finishedRace() {
    const m = memoryStore()
    await advanceMajorRaces(m.store, START)
    await advanceMajorRaces(m.store, START + 3_600_000)
    return m.finish.rewards[0]!.payload
  }

  it('adds the result as a finished race outside the calendar: course prize with no multiplier, ranking ×1.5, Fatigue, nutrition', async () => {
    const payload = { ...(await finishedRace()), nutrition: { gel: true, bar: false } }
    const career = { ...newGame(), coins: 10, consumables: { gel: 2, bar: 1 } }
    const applied = applyMajorReward(career, payload)!
    const race = getRace('RACE-007')!
    const prize = majorPrize(race, payload.position)
    const entry = applied.entry
    expect(entry).toMatchObject({ id: 'major-e1', raceId: 'RACE-007', status: 'finished', feePaid: 0, major: { eventId: 'e1', name: 'Major' } })
    expect(entry.result).toMatchObject({
      position: payload.position,
      fieldSize: 50,
      timeS: payload.timeS,
      multiplierPct: 100,
      coinsAwarded: prize.coins,
      rankingPoints: rankingPoints('RACE-007', payload.position, 'major'),
      rankingAt: payload.finishedAt,
    })
    expect(prize.rankingPoints).toBe(Math.round(rankingPoints('RACE-007', payload.position) * 1.5))
    expect(applied.state.coins).toBe(10 + prize.coins)
    expect(applied.state.consumables).toEqual({ gel: 1, bar: 1 })
    expect(applied.state.athlete.fatigue).toBeCloseTo(career.athlete.fatigue + (payload.finishFatigue - payload.fatigue), 2)
    // Outside the calendar: the same day, the same week.
    expect(applied.state.week).toEqual(career.week)
    // A valid career that survives a save.
    expect(parseGameState(JSON.parse(JSON.stringify(applied.state)), START)).not.toBeNull()
    // Never applied twice.
    expect(applyMajorReward(applied.state, payload)).toBeNull()
  })

  it('injures a runner whose Fatigue goes past the threshold, as a solo race does', async () => {
    const payload = await finishedRace()
    const career = newGame()
    const tired = { ...career, athlete: { ...career.athlete, fatigue: 99 } }
    const applied = applyMajorReward(tired, { ...payload, finishFatigue: payload.fatigue + 10 })!
    expect(applied.entry.result.injured).toBe(true)
    expect(applied.state.forcedRestDays).toBeGreaterThan(0)
    expect(applied.state.athlete.fitness).toBeLessThan(tired.athlete.fitness)
  })
})
