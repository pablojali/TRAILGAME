import { describe, expect, it } from 'vitest'
import { WEAR } from '../domain/equipment/wear'
import { getRace } from '../domain/races/races'
import { newGame } from '../test/gameFixtures'
import { majorPayload } from '../test/majorFixtures'
import { applyMajorReward, majorPrize } from './majorRewards'
import { automaticDecision, applyMajorDecisions, initialState, majorContext, majorField, majorStandings, runMajorSegment, type MajorRunner } from './majorRace'
import { dnfXp } from './races'

/**
 * Worn shoes in a Sunday Major (brief B-6b): the READY snapshot carries the gear's wear; each segment
 * is run with the effect it leaves, and a runner whose shoes break retires at that aid station.
 * Test table: starter shoes 150 km. RACE-007 has 4 segments.
 */
const race = getRace('RACE-007')!
const field = majorField(race)
const segmentKm = field.segments.map((s) => s.distanceM / 1000)
const athlete = newGame().athlete

function player(slot: number, used?: number): MajorRunner {
  return {
    slot,
    kind: 'PLAYER',
    level: 5,
    snapshot: {
      level: 5,
      attributes: { ...athlete.attributes },
      fitness: 50,
      fatigue: 20,
      equipment: ['starter-shoes'],
      nutrition: { gel: false, bar: false },
      ...(used === undefined ? {} : { wear: { speed: 1, used: { 'starter-shoes': used } } }),
    },
    plan: null,
  }
}

function race4(grid: MajorRunner[]) {
  const contexts = new Map(grid.map((r) => [r.slot, majorContext(race, field, 'event-1', r)]))
  let runners = grid.map((r) => ({ slot: r.slot, state: initialState(contexts.get(r.slot)!, r) }))
  const n = field.segments.length
  for (let k = 0; k < n; k++) {
    runners = runMajorSegment(contexts, runners)
    if (k < n - 1) {
      runners = applyMajorDecisions(
        contexts,
        runners.map(({ slot, state }) => ({ slot, state, decision: automaticDecision(grid.find((r) => r.slot === slot)!, state, k, n) })),
      )
    }
  }
  return runners
}

describe('Sunday Major with worn shoes', () => {
  // Slot 2's shoes run out during the second segment.
  const used = 1 - (segmentKm[0]! + segmentKm[1]! / 2) / 150
  const runners = race4([player(1), player(2, used), player(3, 0)])

  it('retires the runner at the aid station where the shoes broke, and runs nothing after', () => {
    const retired = runners.find((r) => r.slot === 2)!.state
    expect(retired.dnf).toMatchObject({ segment: 1, aidStation: 2 })
    expect(retired.progress.splits).toHaveLength(2)
    expect(runners.find((r) => r.slot === 1)!.state.dnf).toBeUndefined()
    expect(runners.find((r) => r.slot === 1)!.state.progress.splits).toHaveLength(4)
  })

  it('places the retired runner after everyone who finished', () => {
    const table = majorStandings(runners)
    expect(table.at(-1)).toMatchObject({ slot: 2, position: 3, dnf: true })
    expect(table.filter((row) => row.dnf)).toHaveLength(1)
  })

  it('runs the same race as before for a runner whose snapshot has no wear (wear off) or fresh shoes', () => {
    const without = race4([player(1)]).find((r) => r.slot === 1)!.state.progress
    const fresh = race4([player(1, 0)]).find((r) => r.slot === 1)!.state.progress
    expect(fresh.elapsedS).toBe(without.elapsedS)
  })

  it('gives a retired player no prize or ranking points, XP for the share run, and the wear of the km run', () => {
    const dnf = { segment: 2, km: 10, aidStation: 2 }
    const major = getRace('RACE-002')!
    const career = { ...newGame(), ownedEquipment: ['starter-shoes'], equipment: ['starter-shoes'] }
    const applied = applyMajorReward(career, majorPayload({ equipment: ['starter-shoes'], dnf, position: 50, fieldSize: 50 }), { ...WEAR, speed: 1 })!
    const { result } = applied.entry
    expect(result).toMatchObject({ coinsAwarded: 0, grossPrize: 0, dnf })
    expect(result).not.toHaveProperty('rankingPoints')
    expect(result.xpAwarded).toBe(dnfXp(majorPrize(major, 50).xp, 10, major.distanceKm))
    expect(applied.state.coins).toBe(career.coins)
    expect(applied.state.wear).toEqual({ 'starter-shoes': Number((10 / 150).toFixed(6)) })
  })
})
