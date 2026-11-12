import { describe, expect, it } from 'vitest'
import { getRace } from '../domain/races/races'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import type { GameState } from '../game-engine/gameState'
import type { MajorRunnerState } from '../game-engine/majorRace'
import { majorEntryId, majorPrize, type MajorRewardPayload } from '../game-engine/majorRewards'
import { newGame } from '../test/gameFixtures'
import { handleCareerOp, type CareerOpsDeps, type CareerOpsStore, type CareerRecord } from './careerOps'
import { advanceMajorRaces, type GridRow, type RaceStore, type StoredDecision } from './majorOrchestrator'

/**
 * Sunday Major, phase 6: the pilot, staged end to end with the real orchestrator and career-ops
 * over in-memory stores that keep the database's rules (compare-and-swap steps, decisions only in
 * their window, results and rewards once). Three test players and 47 NPCs on RACE-007:
 *
 * - Ana decides at every aid station;
 * - Bo loses the connection after the start and never comes back (his plan decides);
 * - Cy decides once, too late (refused), then once in time;
 * - the scheduler stops for 20 minutes during an aid station, and comes back;
 * - the function dies in the middle of a step (twice), and calls overlap;
 * - at the finish each player's result reaches their career once, even when asked again.
 */
const START = Date.UTC(2026, 10, 15, 18)
const RUN_S = 150
const WINDOW_S = 90
const RACE = 'RACE-007'
const EVENT = 'e-pilot'
const PLAYERS = ['ana', 'bo', 'cy'] as const
type Player = (typeof PLAYERS)[number]

function pilotStore() {
  const athlete = newGame().athlete
  const rows: GridRow[] = [
    ...PLAYERS.map(
      (user, i): GridRow => ({
        id: `p-${user}`,
        categoryId: 'c1',
        slot: i + 1,
        kind: 'PLAYER',
        level: 3,
        state: null,
        snapshot: { level: 3, attributes: { ...athlete.attributes }, fitness: 50, fatigue: 15 + i * 5, equipment: [], nutrition: { gel: i === 0, bar: false } },
        plan: null,
      }),
    ),
    ...Array.from({ length: 47 }, (_, i): GridRow => ({ id: `n${i}`, categoryId: 'c1', slot: i + 4, kind: 'NPC', level: 1 + (i % 8), snapshot: null, plan: null, state: null })),
  ]
  let event: 'LOCKED' | 'RUNNING' | 'FINISHED' = 'LOCKED'
  let cat = { phase: 'WAITING' as 'WAITING' | 'RUNNING' | 'PA' | 'FINISHED', segment: 0, segments: 0, endsAt: 0, version: 0 }
  const decisions = new Map<string, StoredDecision & { segment: number }>()
  const results = new Map<string, { position: number; timeS: number }>()
  const rewards = new Map<string, { id: string; user: Player; payload: MajorRewardPayload; claimed: boolean }>()
  /** Steps that die before committing (the function restarts): nothing they computed is kept. */
  let crashes = 0
  const store: RaceStore = {
    startableEvents: async (now) => (event === 'LOCKED' && now >= START ? [{ id: EVENT, raceId: RACE }] : []),
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
        ? [{ id: 'c1', eventId: EVENT, eventName: 'Pilot Major', raceId: RACE, phase: cat.phase, segment: cat.segment, segments: cat.segments, phaseEndsAt: cat.endsAt, version: cat.version, runningS: RUN_S, windowS: WINDOW_S }]
        : [],
    categoryGrid: async () => rows.map((r) => structuredClone(r)),
    decisions: async (_c, segment) => [...decisions.values()].filter((d) => d.segment === segment),
    commitStep: async (step) => {
      if (crashes > 0) {
        crashes--
        throw new Error('function restarted')
      }
      if (step.version !== cat.version) return false
      if (cat.phase === 'PA' && [...decisions.values()].filter((d) => d.segment === cat.segment && d.source === 'PLAYER').length !== step.playerDecisionsSeen) return false
      for (const s of step.states) rows.find((r) => r.id === s.id)!.state = s.state
      for (const d of step.decisions) if (!decisions.has(`${d.participantId}:${d.segment}`)) decisions.set(`${d.participantId}:${d.segment}`, { ...d, source: 'AUTO' })
      if (step.phase === 'FINISHED') {
        for (const r of step.results ?? []) if (!results.has(r.participantId)) results.set(r.participantId, r)
        for (const w of step.rewards ?? []) {
          const row = rows.find((r) => r.id === w.participantId)!
          if (row.kind !== 'PLAYER' || rewards.has(w.participantId)) continue
          rewards.set(w.participantId, { id: `reward-${w.participantId}`, user: w.participantId.slice(2) as Player, payload: w.payload, claimed: false })
        }
        event = 'FINISHED'
      }
      cat = { ...cat, phase: step.phase, segment: step.segment, endsAt: step.endsAt ?? 0, version: cat.version + 1 }
      return true
    },
  }
  /** major_decide: the runner's own decision, only while their window is open (the database's clock). */
  const decide = (user: Player, segment: number, stop: AidStop, intensity: Intensity, now: number): boolean => {
    if (cat.phase !== 'PA' || cat.segment !== segment || now >= cat.endsAt) return false
    decisions.set(`p-${user}:${segment}`, { participantId: `p-${user}`, segment, stop, intensity, source: 'PLAYER' })
    return true
  }
  return {
    store,
    rows,
    decide,
    results,
    rewards,
    crashNext: (n: number) => {
      crashes = n
    },
    state: () => ({ event, ...cat }),
    decisionsOf: (user: Player) => [...decisions.values()].filter((d) => d.participantId === `p-${user}`).sort((a, b) => a.segment - b.segment),
  }
}

/** career-ops over in-memory careers, with the Major rewards of the pilot store. */
function careerStore(pilot: ReturnType<typeof pilotStore>) {
  const careers = new Map<string, CareerRecord>()
  const store: CareerOpsStore = {
    load: async (user) => structuredClone(careers.get(user) ?? null),
    operation: async () => null,
    commit: async ({ userId, baseVersion, state }) => {
      const current = careers.get(userId)
      if ((current?.version ?? null) !== baseVersion) return { status: 'conflict', version: current?.version ?? null, response: null }
      const version = (current?.version ?? 0) + 1
      careers.set(userId, { version, schemaVersion: 2, state: JSON.parse(JSON.stringify(state)) })
      return { status: 'saved', version, response: {} }
    },
    majorRewards: async (user) => [...pilot.rewards.values()].filter((r) => r.user === user && !r.claimed).map((r) => ({ id: r.id, payload: r.payload })),
    markMajorRewards: async (ids) => {
      for (const r of pilot.rewards.values()) if (ids.includes(r.id)) r.claimed = true
    },
  }
  for (const user of PLAYERS) careers.set(user, { version: 1, schemaVersion: 2, state: JSON.parse(JSON.stringify(newGame())) })
  const deps: CareerOpsDeps = { store, authenticate: async (token) => token, now: () => START + 7_200_000 }
  return { careers, deps, career: (user: Player) => careers.get(user)!.state as GameState }
}

const opId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const stateOf = (pilot: ReturnType<typeof pilotStore>, user: Player) => pilot.rows.find((r) => r.id === `p-${user}`)!.state as MajorRunnerState
/** The end of aid station k's window (0-based), on the official schedule. */
const windowEnd = (k: number) => START + ((k + 1) * RUN_S + (k + 1) * WINDOW_S) * 1000
const windowOpen = (k: number) => windowEnd(k) - WINDOW_S * 1000

describe('Sunday Major pilot (phase 6)', () => {
  it('runs a staged Major through disconnections, a stopped scheduler and restarts, and pays each player once', async () => {
    const pilot = pilotStore()
    // The scheduler ticks every 10 s; between ticks, players act.
    const tick = (now: number) => advanceMajorRaces(pilot.store, now)

    await tick(START - 10_000)
    expect(pilot.state().event).toBe('LOCKED')
    await tick(START)
    expect(pilot.state()).toMatchObject({ event: 'RUNNING', phase: 'RUNNING', segment: 0 })
    const segments = pilot.state().segments
    expect(segments).toBeGreaterThanOrEqual(3)

    // Aid station 1: Ana decides; Bo is gone; Cy waits.
    await tick(windowOpen(0))
    expect(pilot.state()).toMatchObject({ phase: 'PA', segment: 0 })
    expect(pilot.decide('ana', 0, 'quick', 'hard', windowOpen(0) + 5_000)).toBe(true)
    // The function dies twice while closing the window: the step is simply taken again later.
    pilot.crashNext(2)
    await expect(tick(windowEnd(0))).rejects.toThrow('function restarted')
    await expect(tick(windowEnd(0) + 10_000)).rejects.toThrow('function restarted')
    expect(pilot.state()).toMatchObject({ phase: 'PA', segment: 0 })
    // Cy decides too late: refused, the window has closed by the clock even if no step ran yet.
    expect(pilot.decide('cy', 0, 'slow', 'easy', windowEnd(0) + 15_000)).toBe(false)
    await tick(windowEnd(0) + 20_000)
    expect(pilot.state()).toMatchObject({ phase: 'RUNNING', segment: 1 })
    expect(stateOf(pilot, 'ana').progress.splits[0]!.stop).toBe('quick')
    expect(stateOf(pilot, 'ana').next).toBe('hard')

    // Aid station 2: Cy decides in time; then the scheduler stops for 20 minutes during the window.
    await tick(windowOpen(1))
    expect(pilot.decide('cy', 1, 'slow', 'easy', windowOpen(1) + 30_000)).toBe(true)
    expect(pilot.decide('ana', 1, 'normal', 'target', windowOpen(1) + 40_000)).toBe(true)
    const resume = windowOpen(1) + 20 * 60_000
    // Overlapping calls when it comes back (the scheduler and two players at once).
    await Promise.all([tick(resume), tick(resume), tick(resume)])

    // Twenty minutes is longer than the rest of the race: it caught up to the finish, once.
    expect(pilot.state()).toMatchObject({ event: 'FINISHED', phase: 'FINISHED', segment: segments - 1 })
    for (const user of PLAYERS) expect(stateOf(pilot, user).progress.splits).toHaveLength(segments)
    // Every aid station was decided for everyone: by the player or by their plan.
    expect(pilot.decisionsOf('ana').map((d) => d.source)).toEqual(['PLAYER', 'PLAYER', ...Array(segments - 3).fill('AUTO')])
    expect(pilot.decisionsOf('bo').every((d) => d.source === 'AUTO')).toBe(true)
    expect(pilot.decisionsOf('bo')).toHaveLength(segments - 1)
    expect(pilot.decisionsOf('cy').map((d) => d.source).slice(0, 2)).toEqual(['AUTO', 'PLAYER'])
    expect(stateOf(pilot, 'cy').progress.splits[1]!.stop).toBe('slow')

    // Results: the 50, each place once; rewards for the 3 players only.
    expect([...pilot.results.values()].map((r) => r.position).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect([...pilot.rewards.values()].map((r) => r.user).sort()).toEqual(['ana', 'bo', 'cy'])
    // The official finish time, whatever the delay.
    for (const r of pilot.rewards.values()) expect(r.payload.finishedAt).toBe(START + (segments * RUN_S + (segments - 1) * WINDOW_S) * 1000)

    // Nothing more to do, however often it is called.
    expect(await tick(resume + 3_600_000)).toEqual({ started: 0, steps: 0 })

    // Into the careers: Ana claims at the finish (twice, two devices); Bo saves days later; Cy trains.
    const careers = careerStore(pilot)
    const claim = (user: Player, n: number) =>
      handleCareerOp(user, { action: 'claim', operationId: opId(n), baseVersion: careers.careers.get(user)!.version, snapshot: careers.career(user) }, careers.deps)
    await Promise.all([claim('ana', 1), claim('ana', 2)])
    await handleCareerOp('bo', { action: 'save', baseVersion: 1, snapshot: careers.career('bo') }, careers.deps)
    const cy = careers.career('cy')
    await handleCareerOp(
      'cy',
      { action: 'train', operationId: opId(3), baseVersion: 1, snapshot: cy, ref: { week: cy.week.number, dayIndex: cy.week.currentDayIndex }, session: 'rest' },
      careers.deps,
    )
    await claim('ana', 4)

    const race = getRace(RACE)!
    for (const user of PLAYERS) {
      const career = careers.career(user)
      const entries = career.raceEntries.filter((e) => e.id === majorEntryId(EVENT))
      expect(entries).toHaveLength(1)
      const result = entries[0]!.status === 'finished' ? entries[0]!.result : null
      const reward = [...pilot.rewards.values()].find((r) => r.user === user)!
      expect(reward.claimed).toBe(true)
      expect(result).toMatchObject({ position: reward.payload.position, rankingPoints: majorPrize(race, reward.payload.position).rankingPoints })
      expect(career.coins).toBe(newGame().coins + majorPrize(race, reward.payload.position).coins)
    }
    // Ana's gel left her stock (never below zero).
    expect(careers.career('ana').consumables.gel).toBe(0)
  })
})
