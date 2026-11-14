import type { MajorPlan, MajorRunnerSnapshot } from '../domain/major/major'
import { getRace } from '../domain/races/races'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import {
  applyMajorDecisions,
  automaticDecision,
  initialState,
  majorContext,
  majorField,
  runMajorSegment,
  type MajorDecision,
  type MajorRunner,
  type MajorRunnerState,
} from '../game-engine/majorRace'
import type { StepContext } from '../game-engine/raceEngine'
import type { MajorRewardPayload } from '../game-engine/majorRewards'
import { majorStandings } from '../game-engine/majorRace'

/**
 * The race orchestrator (Sunday Major, phase 3; owner specification §6–7). Stateless: every call
 * looks at what is due in the database and moves it on, so it runs from the scheduler (a tick every
 * few seconds) and from players' requests alike, and recovers from any interruption by itself.
 * Each step is computed from the stored state and committed atomically from the version it read
 * (`major_commit_step`): concurrent calls never apply a step twice, and a call that dies changes
 * nothing. Timing follows the official schedule (each phase starts when the last one ended), so a
 * late tick catches up: windows already past get their automatic decisions.
 */
export interface GridRow {
  id: string
  categoryId: string
  slot: number
  kind: 'PLAYER' | 'NPC'
  level: number
  snapshot: MajorRunnerSnapshot | null
  plan: MajorPlan | null
  state: MajorRunnerState | null
}

export interface DueCategory {
  id: string
  eventId: string
  eventName: string
  raceId: string
  phase: 'RUNNING' | 'PA'
  segment: number
  segments: number
  phaseEndsAt: number
  version: number
  runningS: number
  windowS: number
}

export interface StoredDecision {
  participantId: string
  stop: AidStop
  intensity: Intensity
  source: 'PLAYER' | 'AUTO'
}

export interface RaceStore {
  /** LOCKED events whose start time has come. */
  startableEvents(now: number): Promise<{ id: string; raceId: string }[]>
  grid(eventId: string): Promise<GridRow[]>
  start(eventId: string, segments: number, states: { id: string; state: MajorRunnerState }[], now: number): Promise<boolean>
  /** Categories whose running phase or aid-station window has ended. */
  dueCategories(now: number): Promise<DueCategory[]>
  categoryGrid(categoryId: string): Promise<GridRow[]>
  decisions(categoryId: string, segment: number): Promise<StoredDecision[]>
  commitStep(step: {
    categoryId: string
    version: number
    phase: 'RUNNING' | 'PA' | 'FINISHED'
    segment: number
    startedAt: number
    endsAt: number | null
    states: { id: string; state: MajorRunnerState }[]
    decisions: { participantId: string; segment: number; stop: AidStop; intensity: Intensity }[]
    playerDecisionsSeen: number
    /** At the finish (phase 5): every runner's place and time, and each player's reward. */
    results?: { participantId: string; position: number; timeS: number }[]
    rewards?: { participantId: string; payload: MajorRewardPayload }[]
  }): Promise<boolean>
}

function runnerOf(row: GridRow): MajorRunner {
  return { slot: row.slot, kind: row.kind, level: row.level, snapshot: row.snapshot, plan: row.plan }
}

function contextsOf(raceId: string, eventId: string, rows: readonly GridRow[]): Map<number, StepContext> {
  const race = getRace(raceId)
  if (!race) throw new Error(`Major course ${raceId} is not in the catalog`)
  const field = majorField(race)
  return new Map(rows.map((row) => [row.slot, majorContext(race, field, eventId, runnerOf(row))]))
}

/** Starts the events whose time has come: every runner's initial state, first segment running. */
async function startEvents(store: RaceStore, now: number): Promise<number> {
  let started = 0
  for (const event of await store.startableEvents(now)) {
    const rows = await store.grid(event.id)
    const race = getRace(event.raceId)
    if (!race) continue
    const contexts = contextsOf(event.raceId, event.id, rows)
    // The first segment is run at once (live tracking): it stays hidden until its phase ends.
    const ran = runMajorSegment(
      contexts,
      rows.map((row) => ({ slot: row.slot, state: initialState(contexts.get(row.slot)!, runnerOf(row)) })),
    )
    const bySlot = new Map(rows.map((row) => [row.slot, row.id]))
    const states = ran.map(({ slot, state }) => ({ id: bySlot.get(slot)!, state }))
    if (await store.start(event.id, majorField(race).segments.length, states, now)) started++
  }
  return started
}

/** One step of one category, computed and committed (false: another call committed first). */
export async function stepCategory(store: RaceStore, category: DueCategory): Promise<boolean> {
  const rows = await store.categoryGrid(category.id)
  const contexts = contextsOf(category.raceId, category.eventId, rows)
  const bySlot = new Map(rows.map((row) => [row.slot, row]))
  const runners = rows.map((row) => {
    if (!row.state) throw new Error(`Major runner ${row.id} has no state`)
    return { slot: row.slot, state: row.state }
  })
  const startedAt = category.phaseEndsAt

  if (category.phase === 'RUNNING') {
    // The segment was run when it started (live tracking); a category started before that change
    // runs it now.
    const alreadyRun = runners.every(({ state }) => state.progress.splits.length > category.segment)
    const ran = alreadyRun ? runners : runMajorSegment(contexts, runners)
    const last = category.segment >= category.segments - 1
    const finish = last ? finalResults(category, rows, contexts, ran) : {}
    return store.commitStep({
      ...finish,
      categoryId: category.id,
      version: category.version,
      phase: last ? 'FINISHED' : 'PA',
      segment: category.segment,
      startedAt,
      endsAt: last ? null : startedAt + category.windowS * 1000,
      states: ran.map(({ slot, state }) => ({ id: bySlot.get(slot)!.id, state })),
      decisions: [],
      playerDecisionsSeen: 0,
    })
  }

  // The aid-station window has closed: the players' decisions, the plan for everyone else.
  const stored = new Map((await store.decisions(category.id, category.segment)).map((d) => [d.participantId, d]))
  const automatic: { participantId: string; segment: number; stop: AidStop; intensity: Intensity }[] = []
  const decided = runners.map(({ slot, state }) => {
    const row = bySlot.get(slot)!
    const mine = stored.get(row.id)
    let decision: MajorDecision
    if (mine) decision = { stop: mine.stop, intensity: mine.intensity }
    else {
      decision = automaticDecision(runnerOf(row), state, category.segment, category.segments)
      automatic.push({ participantId: row.id, segment: category.segment, ...decision })
    }
    return { slot, state, decision }
  })
  // The next segment is run at once (live tracking): hidden until its running phase ends.
  const after = runMajorSegment(contexts, applyMajorDecisions(contexts, decided))
  return store.commitStep({
    categoryId: category.id,
    version: category.version,
    phase: 'RUNNING',
    segment: category.segment + 1,
    startedAt,
    endsAt: startedAt + category.runningS * 1000,
    states: after.map(({ slot, state }) => ({ id: bySlot.get(slot)!.id, state })),
    decisions: automatic,
    playerDecisionsSeen: [...stored.values()].filter((d) => d.source === 'PLAYER').length,
  })
}

/** The final standings and each player's reward payload (career-ops applies it later). */
function finalResults(
  category: DueCategory,
  rows: readonly GridRow[],
  contexts: ReadonlyMap<number, StepContext>,
  ran: readonly { slot: number; state: MajorRunnerState }[],
): { results: { participantId: string; position: number; timeS: number }[]; rewards: { participantId: string; payload: MajorRewardPayload }[] } {
  const bySlot = new Map(rows.map((row) => [row.slot, row]))
  const stateOf = new Map(ran.map((r) => [r.slot, r.state]))
  const table = majorStandings(ran)
  const finishedAt = category.phaseEndsAt
  // Every run took (segments × running phase) plus (segments − 1) windows, from the official start.
  const startedAt = finishedAt - category.segments * category.runningS * 1000 - (category.segments - 1) * category.windowS * 1000
  const results = table.map((row) => ({ participantId: bySlot.get(row.slot)!.id, position: row.position, timeS: row.timeS }))
  const rewards = table.flatMap((row) => {
    const runner = bySlot.get(row.slot)!
    const snapshot = runner.snapshot
    if (runner.kind !== 'PLAYER' || !snapshot) return []
    const state = stateOf.get(row.slot)!
    const ctx = contexts.get(row.slot)!
    const payload: MajorRewardPayload = {
      eventId: category.eventId,
      eventName: category.eventName,
      raceId: category.raceId,
      position: row.position,
      fieldSize: table.length,
      timeS: row.timeS,
      startedAt,
      finishedAt,
      levelAtStart: snapshot.level,
      attributes: { ...snapshot.attributes },
      fitness: snapshot.fitness,
      fatigue: snapshot.fatigue,
      equipment: [...snapshot.equipment],
      dayForm: ctx.dayForm,
      finishFatigue: Math.round(state.progress.fatigue * 100) / 100,
      splits: state.progress.splits,
      nutrition: { ...ctx.nutrition },
      rivalTimesS: table.filter((other) => other.slot !== row.slot).map((other) => other.timeS),
    }
    return [{ participantId: runner.id, payload }]
  })
  return { results, rewards }
}

/**
 * Moves every Major on as far as `now` allows: starts the events due, then runs the due steps
 * (several rounds, so a late call catches up), at most `maxRounds` rounds per call.
 */
export async function advanceMajorRaces(store: RaceStore, now: number, maxRounds = 20): Promise<{ started: number; steps: number }> {
  const started = await startEvents(store, now)
  let steps = 0
  let refused = 0
  for (let round = 0; round < maxRounds; round++) {
    const due = await store.dueCategories(now)
    if (due.length === 0) break
    for (const category of due) {
      if (await stepCategory(store, category)) steps++
      else refused++
    }
    // A refused step (another call took it, or a decision arrived meanwhile) is read again; a few
    // times at most, so a call never spins.
    if (refused > 3) break
  }
  return { started, steps }
}
