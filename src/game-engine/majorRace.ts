import type { Attributes } from '../domain/athlete/athlete'
import { defaultPlan, type MajorPlan, type MajorRunnerSnapshot } from '../domain/major/major'
import type { Race } from '../domain/races/races'
import { RACE_STRATEGY, type AidStop, type Intensity } from '../domain/races/strategyConfig'
import { getRaceField, makeStop, runSegment, typicalRunner, type RaceField, type RaceProgress, type StepContext } from './raceEngine'
import { planRest } from './racePlan'
import { getDayForm } from './raceSimulation'

/**
 * The Sunday Major race (owner specification §6, phase 3): the same engine as solo races
 * (`runSegment`, `makeStop`), run segment by segment for every runner of a category at once. Only
 * the positions differ: they are the runners' own order (everyone on the same course and clock),
 * not the solo races' precomputed rival times. Deterministic: the same grid, plans and decisions
 * give the same race.
 */
export interface MajorRunner {
  slot: number
  kind: 'PLAYER' | 'NPC'
  level: number
  /** Players: the READY snapshot. NPCs: none (the typical runner of their level). */
  snapshot: MajorRunnerSnapshot | null
  /** Players: their plan (null: Target pace and Normal stops). NPCs: ignored. */
  plan: MajorPlan | null
}

/** One runner's race so far, stored as the participant's state. */
export interface MajorRunnerState {
  progress: RaceProgress
  /** The intensity of the segment about to be run. */
  next: Intensity
  /** NPCs: their planned intensities and stops (worked out at the start). */
  npcPlan?: { intensities: Intensity[] }
  /**
   * Live tracking (owner request, 14 November 2026): the segment is run as soon as it starts, and
   * this keeps where the runner was when it started (race time and in-race fatigue) so the segment
   * stays hidden until its running phase ends.
   */
  segmentStart?: { elapsedS: number; fatigue: number }
}

export interface MajorDecision {
  stop: AidStop
  intensity: Intensity
}

/** The course's base field: segments, time scale, stops and weights (its rivals are not used). */
export function majorField(race: Race): RaceField {
  return getRaceField(race)
}

/** The engine's context for one runner of a Major. */
export function majorContext(race: Race, field: RaceField, eventId: string, runner: MajorRunner): StepContext {
  if (runner.kind === 'PLAYER' && runner.snapshot) {
    const s = runner.snapshot
    return {
      race,
      field,
      runner: { attributes: s.attributes as Attributes, fitness: s.fitness, fatigue: s.fatigue, equipment: [...s.equipment] },
      dayForm: getDayForm(race.id, `${eventId}:${runner.slot}`, 0, s.attributes.consistency ?? 20),
      nutrition: { ...s.nutrition },
    }
  }
  const typical = typicalRunner(runner.level, race.category)
  return {
    race,
    field,
    runner: typical,
    dayForm: getDayForm(race.id, `${eventId}:${runner.slot}`, 0, typical.attributes.consistency),
    nutrition: { ...RACE_STRATEGY.typicalNutrition },
  }
}

/** Before the start: everyone at 0, the first segment's intensity from the plan (NPCs: Balanced). */
export function initialState(ctx: StepContext, runner: MajorRunner): MajorRunnerState {
  const progress: RaceProgress = { elapsedS: 0, fatigue: ctx.runner.fatigue, splits: [] }
  const segments = ctx.field.segments.length
  if (runner.kind === 'NPC') {
    const intensities = planRest(ctx, progress, 'balanced')
    return { progress, next: intensities[0] ?? 'target', npcPlan: { intensities } }
  }
  const plan = runner.plan ?? defaultPlan(segments)
  return { progress, next: plan.segments[0]?.intensity ?? 'target' }
}

/** Positions by arrival time (whole seconds, as shown), ties by grid slot. */
export function rankByArrival(states: readonly { slot: number; state: MajorRunnerState }[]): Map<number, number> {
  const order = [...states].sort(
    (a, b) => Math.round(a.state.progress.elapsedS) - Math.round(b.state.progress.elapsedS) || a.slot - b.slot,
  )
  return new Map(order.map((entry, i) => [entry.slot, i + 1]))
}

/**
 * Runs the next segment for every runner at their chosen intensity, then sets each split's
 * position among the runners.
 */
export function runMajorSegment(
  contexts: ReadonlyMap<number, StepContext>,
  runners: readonly { slot: number; state: MajorRunnerState }[],
): { slot: number; state: MajorRunnerState }[] {
  const ran = runners.map(({ slot, state }) => ({
    slot,
    state: {
      ...state,
      segmentStart: { elapsedS: state.progress.elapsedS, fatigue: state.progress.fatigue },
      progress: runSegment(contexts.get(slot)!, state.progress, state.next),
    },
  }))
  const positions = rankByArrival(ran)
  return ran.map(({ slot, state }) => {
    const splits = state.progress.splits.slice()
    const last = splits[splits.length - 1]!
    splits[splits.length - 1] = { ...last, position: positions.get(slot)! }
    return { slot, state: { ...state, progress: { ...state.progress, splits } } }
  })
}

/**
 * The decision at the aid station after segment `segment` (0-based) when the runner sent none:
 * their plan's stop and next intensity (owner specification §5.2); NPCs follow their own plan
 * with Normal stops.
 */
export function automaticDecision(runner: MajorRunner, state: MajorRunnerState, segment: number, segments: number): MajorDecision {
  if (runner.kind === 'NPC') return { stop: 'normal', intensity: state.npcPlan?.intensities[segment + 1] ?? 'target' }
  const plan = runner.plan ?? defaultPlan(segments)
  return { stop: plan.segments[segment]?.stop ?? 'normal', intensity: plan.segments[segment + 1]?.intensity ?? 'target' }
}

/** Applies each runner's stop and sets the next segment's intensity. */
export function applyMajorDecisions(
  contexts: ReadonlyMap<number, StepContext>,
  runners: readonly { slot: number; state: MajorRunnerState; decision: MajorDecision }[],
): { slot: number; state: MajorRunnerState }[] {
  return runners.map(({ slot, state, decision }) => ({
    slot,
    state: { ...state, progress: makeStop(contexts.get(slot)!, state.progress, decision.stop), next: decision.intensity },
  }))
}

export interface MajorStandingRow {
  slot: number
  position: number
  /** Race time on arrival at the last aid station (or the finish), whole seconds. */
  timeS: number
  /** Seconds behind the leader. */
  gapS: number
}

/** The provisional (or final) standings after the segments run so far. */
export function majorStandings(runners: readonly { slot: number; state: MajorRunnerState }[]): MajorStandingRow[] {
  const arrivals = runners.map(({ slot, state }) => {
    const last = state.progress.splits[state.progress.splits.length - 1]
    return { slot, timeS: last ? last.arrivalS : 0 }
  })
  arrivals.sort((a, b) => a.timeS - b.timeS || a.slot - b.slot)
  const leader = arrivals[0]?.timeS ?? 0
  return arrivals.map((row, i) => ({ ...row, position: i + 1, gapS: row.timeS - leader }))
}

/** Checkpoints along each Major segment for the live tracking (owner request, 14 November 2026). */
export const LIVE_CHECKPOINTS = 8

/**
 * Where the checkpoints of a segment are and what share of a runner's segment time it takes to
 * reach each: `count` points at equal distances, the last at the aid station (or the finish). The
 * time follows the effort of the profile (a metre of climb costs as much as ten flat), so runners
 * slow down on the climbs. The same for everyone: who passes first is who left earlier or runs
 * faster, and at the last checkpoint the order is the official one.
 */
export function checkpointShares(pieces: readonly { block: { lengthM: number; gainM: number } }[], count = LIVE_CHECKPOINTS): { distanceShare: number; timeShare: number }[] {
  const lengths = pieces.map((p) => Math.max(0, p.block.lengthM))
  const total = lengths.reduce((a, b) => a + b, 0)
  const efforts = pieces.map((p, i) => lengths[i]! + 10 * Math.max(0, p.block.gainM))
  const effortTotal = efforts.reduce((a, b) => a + b, 0)
  if (total <= 0 || effortTotal <= 0) return Array.from({ length: count }, (_, i) => ({ distanceShare: (i + 1) / count, timeShare: (i + 1) / count }))
  return Array.from({ length: count }, (_, i) => {
    const target = ((i + 1) / count) * total
    let covered = 0
    let effort = 0
    for (let k = 0; k < pieces.length; k++) {
      const length = lengths[k]!
      if (covered + length >= target || k === pieces.length - 1) {
        const part = length > 0 ? Math.min(1, (target - covered) / length) : 1
        effort += efforts[k]! * part
        break
      }
      covered += length
      effort += efforts[k]!
    }
    return { distanceShare: (i + 1) / count, timeShare: i === count - 1 ? 1 : Math.min(1, effort / effortTotal) }
  })
}

/** A runner in the live tracking of a running segment: when they left and when they arrive. */
export interface LiveRunner {
  slot: number
  departS: number
  arriveS: number
}

/**
 * The live standings at checkpoint step `step` (0 = the start of the segment, `shares.length` =
 * its end): the race clock goes from the first departure to the last arrival in equal steps, and
 * each runner is where their own pace puts them then. Ranked by distance covered, then by who got
 * there first (and at the end, by arrival: the official order).
 */
export interface LiveStandingRow {
  slot: number
  position: number
  /** The furthest checkpoint passed (0: still before the first). */
  checkpoint: number
  distanceShare: number
  /** Race time when that checkpoint was passed (null before the first). */
  passedAtS: number | null
}

export function liveStandings(
  runners: readonly LiveRunner[],
  shares: readonly { distanceShare: number; timeShare: number }[],
  step: number,
): LiveStandingRow[] {
  if (runners.length === 0) return []
  const first = Math.min(...runners.map((r) => r.departS))
  const last = Math.max(...runners.map((r) => r.arriveS))
  const clock = first + ((last - first) * Math.max(0, Math.min(step, shares.length))) / shares.length
  const points = [{ distanceShare: 0, timeShare: 0 }, ...shares]
  const placed = runners.map((r) => {
    const span = Math.max(1, r.arriveS - r.departS)
    // The furthest checkpoint passed by the clock, and when it was passed.
    let checkpoint = 0
    for (let i = 1; i < points.length; i++) if (r.departS + points[i]!.timeShare * span <= clock + 1e-9) checkpoint = i
    const passedAtS = checkpoint === 0 ? null : Math.round(r.departS + points[checkpoint]!.timeShare * span)
    return { slot: r.slot, checkpoint, distanceShare: points[checkpoint]!.distanceShare, passedAtS, departS: r.departS }
  })
  placed.sort((a, b) => b.checkpoint - a.checkpoint || (a.passedAtS ?? a.departS) - (b.passedAtS ?? b.departS) || a.slot - b.slot)
  return placed.map((p, i) => ({ slot: p.slot, position: i + 1, checkpoint: p.checkpoint, distanceShare: p.distanceShare, passedAtS: p.passedAtS }))
}
