import { describe, expect, it } from 'vitest'
import { getRaceEffect } from '../domain/equipment/items'
import { WEAR, type WearConfig } from '../domain/equipment/wear'
import { getRace } from '../domain/races/races'
import { RACE_STRATEGY } from '../domain/races/strategyConfig'
import { parseSave, SCHEMA_VERSION } from '../repositories/gameRepository'
import { currentRef, newGame, onSunday, T0, withEntry } from '../test/gameFixtures'
import { buyItem, setItemEquipped } from './equipment'
import type { GameState } from './gameState'
import { getRaceSegments } from './raceEngine'
import { effectFactorsAt, raceWearAtStart, shoeBreak } from './raceWear'
import { dnfXp, enterRace, getRaceRewards, getStandings, predictShoes, raceCurrentDay, startRace, stepRace } from './races'

/**
 * Worn shoes in races (brief B-6b, owner decisions of 22 November 2026). Test equipment table:
 * starter shoes 150 km (no race bonus), trail shoes 300 km (Speed +1, Technique +1), first backpack
 * 400 km. RACE-002 is about 8 km in two segments with one aid station.
 */
const ON: WearConfig = { ...WEAR, speed: 1 }
const serializeSave = (state: GameState) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, state })

function kitted(shoes: string, wear?: Record<string, number>): GameState {
  return {
    ...newGame(),
    ownedEquipment: ['starter-shoes', 'trail-shoes-basic', 'hydration-backpack'],
    equipment: [shoes, 'hydration-backpack'],
    ...(wear ? { wear } : {}),
  }
}

const race = getRace('RACE-002')!
const segmentsM = getRaceSegments(race).map((s) => s.distanceM)
const firstKm = segmentsM[0]! / 1000

/** A career on race Sunday with RACE-002 entered. */
function raceDay(state: GameState) {
  const { state: s, entry } = withEntry(onSunday(state), 'RACE-002')
  return { state: s, entry }
}

describe('wear along the course', () => {
  it('keeps only part of an item\'s bonus: attributes and multipliers scaled by the factor', () => {
    const full = getRaceEffect(['trail-shoes-basic', 'hydration-backpack'])
    const worn = getRaceEffect(['trail-shoes-basic', 'hydration-backpack'], { 'trail-shoes-basic': 0.5, 'hydration-backpack': 0 })
    expect(full.attributes.speed).toBe(1)
    expect(worn.attributes.speed).toBe(0.5)
    expect(full.slowdown).toBeCloseTo(0.9)
    expect(worn.slowdown).toBe(1)
  })

  it('sets each segment\'s factor from the band when it starts; other gear keeps all until 0 %', () => {
    const wear = raceWearAtStart(kitted('trail-shoes-basic', { 'trail-shoes-basic': 0.55, 'hydration-backpack': 0.99 }), undefined, ON)!
    // Start: 45 % → Normal (1). After 30 km: 35 % → Slight penalty (0.75).
    expect(effectFactorsAt(wear, 0, ON)).toEqual({ 'trail-shoes-basic': 1, 'hydration-backpack': 1 })
    expect(effectFactorsAt(wear, 30, ON)).toEqual({ 'trail-shoes-basic': 0.75, 'hydration-backpack': 0 })
  })

  it('finds where the shoes break: the aid station after the segment where they run out, or the finish', () => {
    const atFirst = raceWearAtStart(kitted('starter-shoes', { 'starter-shoes': 1 - 2 / 150 }), undefined, ON)
    expect(shoeBreak(atFirst, segmentsM)).toMatchObject({ segment: 0, aidStation: 1, km: Math.round(firstKm * 10) / 10 })
    const atLast = raceWearAtStart(kitted('starter-shoes', { 'starter-shoes': 1 - (firstKm + 1) / 150 }), undefined, ON)
    expect(shoeBreak(atLast, segmentsM)).toMatchObject({ segment: 1, aidStation: null })
    expect(shoeBreak(raceWearAtStart(kitted('starter-shoes'), undefined, ON), segmentsM)).toBeNull()
    expect(raceWearAtStart(kitted('starter-shoes'), undefined, WEAR)).toBeUndefined()
  })
})

describe('the entry predicts exactly what the race will do', () => {
  it('says the shoes last, or where they break, and the race does just that', () => {
    expect(predictShoes(kitted('starter-shoes'), race, ON)).toEqual({ lasts: true })
    const worn = kitted('starter-shoes', { 'starter-shoes': 1 - 2 / 150 })
    const predicted = predictShoes(worn, race, ON)
    expect(predicted).toMatchObject({ lasts: false, segment: 0, aidStation: 1 })
    expect(enterRace(worn, 'RACE-002', T0, ON)).toMatchObject({ ok: true, prediction: predicted })
    const { state, entry } = raceDay(worn)
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0, ON)
    if (!raced.ok) throw new Error(raced.error)
    expect(raced.value.entry.result.dnf).toEqual({ segment: 1, km: (predicted as { km: number }).km, aidStation: 1 })
    expect(predictShoes(kitted('starter-shoes'), race, WEAR)).toBeNull()
  })
})

describe('a DNF', () => {
  it('retires at the aid station: no prize, no ranking points, XP for the share run, last in the standings', () => {
    const { state, entry } = raceDay(kitted('starter-shoes', { 'starter-shoes': 1 - 2 / 150 }))
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0, ON)
    if (!raced.ok) throw new Error(raced.error)
    const { result } = raced.value.entry
    expect(result.splits).toHaveLength(1)
    expect(result).toMatchObject({ coinsAwarded: 0, grossPrize: 0, netCoins: 0, position: RACE_STRATEGY.fieldSize })
    expect(result).not.toHaveProperty('rankingPoints')
    const lastXp = getRaceRewards(race, RACE_STRATEGY.fieldSize, result.levelAtStart).xp
    expect(result.xpAwarded).toBe(dnfXp(lastXp, result.dnf!.km, race.distanceKm))
    expect(result.xpAwarded).toBeLessThan(lastXp)
    // Fatigue for the distance run, and the wear of the km run: the shoes are worn out.
    expect(result.fatigueChange).toBeGreaterThan(0)
    expect(raced.value.state.wear!['starter-shoes']).toBe(1)
    const standings = getStandings(race, result)
    expect(standings.at(-1)).toMatchObject({ runner: 'you', dnf: true, position: RACE_STRATEGY.fieldSize })
    // The day is done, as for a finished race.
    expect(raced.value.state.week.currentDayIndex).not.toBe(state.week.currentDayIndex)
  })

  it('retires at the end of the last segment when the shoes run out there', () => {
    const { state, entry } = raceDay(kitted('starter-shoes', { 'starter-shoes': 1 - (firstKm + 1) / 150 }))
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0, ON)
    if (!raced.ok) throw new Error(raced.error)
    expect(raced.value.entry.result.dnf).toMatchObject({ segment: 2, aidStation: null })
    expect(raced.value.entry.result.splits).toHaveLength(2)
  })

  it('records the DNF whatever is decided at that aid station', () => {
    const { state, entry } = raceDay(kitted('starter-shoes', { 'starter-shoes': 1 - 2 / 150 }))
    const started = startRace(state, currentRef(state), entry.id, { intensity: 'hard', gel: false, bar: false }, T0, ON)
    if (!started.ok) throw new Error(started.error)
    const step = stepRace(started.state, { segment: 1, stop: 'slow', intensity: 'easy' }, T0, ON)
    expect(step.ok && step.value.finished && step.value.value.entry.result.dnf).toMatchObject({ aidStation: 1 })
  })
})

describe('the shoes\' band changes the race', () => {
  it('costs time with worn shoes and says how much; fresh shoes or wear off cost none', () => {
    const run = (state: GameState, config: WearConfig) => {
      const { state: s, entry } = raceDay(state)
      const raced = raceCurrentDay(s, currentRef(s), entry.id, T0, config)
      if (!raced.ok) throw new Error(raced.error)
      return raced.value.entry.result
    }
    const fresh = run(kitted('trail-shoes-basic'), ON)
    const heavy = run(kitted('trail-shoes-basic', { 'trail-shoes-basic': 0.85 }), ON)
    const off = run(kitted('trail-shoes-basic', { 'trail-shoes-basic': 0.85 }), WEAR)
    expect(fresh.shoeWear).toMatchObject({ itemId: 'trail-shoes-basic', durabilityAtStart: 100, timeLostS: 0 })
    expect(heavy.shoeWear).toMatchObject({ durabilityAtStart: 15 })
    expect(heavy.shoeWear!.timeLostS).toBeGreaterThan(0)
    expect(heavy.timeS).toBe(fresh.timeS + heavy.shoeWear!.timeLostS)
    expect(off).not.toHaveProperty('shoeWear')
    expect(off.timeS).toBe(fresh.timeS)
  })
})

describe('no fixing it mid-race', () => {
  it('refuses buying and equipping while a race is in progress, only with wear on', () => {
    const { state, entry } = raceDay({ ...kitted('starter-shoes'), coins: 100 })
    const started = startRace(state, currentRef(state), entry.id, { intensity: 'target', gel: false, bar: false }, T0, ON)
    if (!started.ok) throw new Error(started.error)
    expect(setItemEquipped(started.state, 'trail-shoes-basic', true, ON)).toEqual({ ok: false, error: 'race-in-progress' })
    expect(buyItem(started.state, 'poles', 25, ON)).toEqual({ ok: false, error: 'race-in-progress' })
    expect(setItemEquipped(started.state, 'trail-shoes-basic', true, WEAR).ok).toBe(true)
  })
})

describe('saves with race wear', () => {
  it('keep a race in progress with its wear, and a DNF result', () => {
    const { state, entry } = raceDay(kitted('starter-shoes', { 'starter-shoes': 1 - 2 / 150 }))
    const started = startRace(state, currentRef(state), entry.id, { intensity: 'target', gel: false, bar: false }, T0, ON)
    if (!started.ok) throw new Error(started.error)
    const inProgress = parseSave(serializeSave(started.state), T0)
    expect(inProgress.status === 'loaded' && inProgress.state.activeRace?.wear).toEqual(started.state.activeRace!.wear)
    const step = stepRace(started.state, { segment: 1, stop: 'normal', intensity: 'target' }, T0, ON)
    if (!step.ok || !step.value.finished) throw new Error('not finished')
    const done = parseSave(serializeSave(step.value.value.state), T0)
    expect(done.status === 'loaded' && done.state.raceEntries.at(-1)).toMatchObject({ result: { dnf: { aidStation: 1 } } })
  })
})
