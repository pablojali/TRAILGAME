import { describe, expect, it } from 'vitest'
import { getRace } from '../domain/races/races'
import {
  bandOf,
  durabilityPct,
  parseWearBands,
  parseWearKm,
  WEAR,
  wearStatus,
  type WearConfig,
} from '../domain/equipment/wear'
import { parseEquipment } from '../domain/equipment/items'
import { parseSave, SCHEMA_VERSION } from '../repositories/gameRepository'
import { currentRef, newGame, onSunday, T0, withEntry, withSession } from '../test/gameFixtures'
import { buyItem } from './equipment'
import type { GameState } from './gameState'
import { enterRace, raceCurrentDay, startRace } from './races'
import { executeCurrentDay } from './training'
import { applyMajorReward } from './majorRewards'
import { majorPayload } from '../test/majorFixtures'
import { applyWear, gearStatus, raceGearError, shoeInjuryDraw, shoesStatus } from './wear'

/**
 * Equipment wear (brief B-6a, owner decisions D6 and D7, 22 November 2026). The test equipment table
 * gives the starter shoes 150 km, the trail shoes 300 km and the first backpack 400 km; poles never
 * wear. The real tables ship with wear_speed 0 (off), so these tests turn it on with their own config.
 */
const ON: WearConfig = { ...WEAR, speed: 1 }

const serializeSave = (state: GameState) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, state })

/** A career wearing the starter shoes and the first backpack, with poles and trail shoes owned too. */
function kitted(wear?: Record<string, number>): GameState {
  const state = newGame()
  return {
    ...state,
    ownedEquipment: ['starter-shoes', 'trail-shoes-basic', 'hydration-backpack', 'poles'],
    equipment: ['starter-shoes', 'hydration-backpack', 'poles'],
    ...(wear ? { wear } : {}),
  }
}

/** The first server time, from `T0`, whose worn-shoe draw on this day is below / at least `risk`. */
function timeWithDraw(state: GameState, below: boolean, risk = 10): number {
  for (let now = T0; ; now += 1000) {
    const draw = shoeInjuryDraw(now, state.week.number, state.week.currentDayIndex)
    if (below ? draw < risk : draw >= risk) return now
  }
}

describe('equipment wear: the owner tables', () => {
  it('reads the bands, which must cover 0 to 100 once', () => {
    const bands = WEAR.bands
    expect(bands.map((b) => [b.fromPct, b.toPct, b.raceStart])).toEqual([
      [40, 100, 'ok'],
      [20, 39, 'ok'],
      [10, 19, 'ok'],
      [1, 9, 'dnf'],
      [0, 0, 'blocked'],
    ])
    const header = 'from_pct,to_pct,label,effect_factor,injury_risk_pct,race_start\n'
    expect(() => parseWearBands(`${header}50,100,A,1,0,ok\n0,40,B,0,0,blocked\n`)).toThrow(/cover 0 to 100/)
    expect(() => parseWearBands(`${header}0,100,A,2,0,ok\n`)).toThrow(/effect_factor/)
    expect(() => parseWearBands(`${header}0,100,A,1,0,maybe\n`)).toThrow(/race_start/)
  })

  it('reads the km of every session type', () => {
    expect(WEAR.sessionKm).toMatchObject({ 'easy-run': 8, 'long-run': 18, rest: 0 })
    expect(() => parseWearKm('session,km\neasy-run,8\n')).toThrow(/no row for/)
    expect(() => parseWearKm('session,km\nswimming,8\n')).toThrow(/unknown session/)
  })

  it('reads life_km per item: empty never wears, gels and bars cannot have one', () => {
    const header = 'id,name,type,price,pack,life_km\n'
    expect(parseEquipment(`${header}a,A,shoes,10,,150\n`)[0]!.lifeKm).toBe(150)
    expect(parseEquipment(`${header}a,A,poles,10,,\n`)[0]!.lifeKm).toBeUndefined()
    expect(() => parseEquipment(`${header}a,A,shoes,10,,0\n`)).toThrow(/life_km must be above 0/)
    expect(() => parseEquipment(`${header}a,A,gel,10,3,50\n`)).toThrow(/no life_km/)
  })

  it('puts durability in bands, rounding up so only no life left at all is 0 %', () => {
    expect(durabilityPct(0)).toBe(100)
    expect(durabilityPct(0.6)).toBe(40)
    expect(durabilityPct(0.61)).toBe(39)
    expect(durabilityPct(0.995)).toBe(1)
    expect(durabilityPct(1)).toBe(0)
    expect([100, 40, 39, 20, 19, 10, 9, 1, 0].map((pct) => bandOf(pct).label)).toEqual([
      'Normal', 'Normal', 'Slight penalty', 'Slight penalty', 'Heavy penalty', 'Heavy penalty', 'High risk', 'High risk', 'Worn out',
    ])
  })

  it('shows the life as life_km ÷ wear_speed, with the km left', () => {
    expect(wearStatus('starter-shoes', 0.28, ON)).toMatchObject({ lifeKm: 150, remainingKm: 108, durabilityPct: 72, band: { label: 'Normal' }, wornOut: false })
    expect(wearStatus('starter-shoes', 0.28, { ...ON, speed: 2 })).toMatchObject({ lifeKm: 75, remainingKm: 54 })
    // Not shoes: no band. No life, or wear off: no status.
    expect(wearStatus('hydration-backpack', 0, ON)).not.toHaveProperty('band')
    expect(wearStatus('poles', 0, ON)).toBeNull()
    expect(wearStatus('starter-shoes', 0, WEAR)).toBeNull()
  })
})

describe('equipment wear: with wear_speed 0 nothing changes', () => {
  it('training, races and entries leave no wear, and racing needs no shoes', () => {
    const trained = executeCurrentDay(kitted(), currentRef(kitted()), T0)
    expect(trained.ok && 'wear' in trained.value.state).toBe(false)
    const bare = newGame()
    expect(enterRace(bare, 'RACE-001', T0)).toMatchObject({ ok: true, shoes: null })
    const { state, entry } = withEntry(onSunday(kitted()), 'RACE-001')
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0)
    expect(raced.ok && 'wear' in raced.value.state).toBe(false)
    expect(raceGearError(bare)).toBeNull()
    expect(gearStatus(kitted())).toEqual([])
  })
})

describe('equipment wear: accrual', () => {
  it('wears every equipped item with a life by the session km, and nothing else', () => {
    const state = withSession(kitted(), 'long-run')
    const done = executeCurrentDay(state, currentRef(state), T0, ON)
    if (!done.ok) throw new Error(done.error)
    // 18 km: 18/150 of the shoes, 18/400 of the backpack; poles have no life, trail shoes are not worn.
    expect(done.value.state.wear).toEqual({ 'starter-shoes': 0.12, 'hydration-backpack': 0.045 })
  })

  it('multiplies wear by wear_speed, and Rest wears nothing', () => {
    const state = withSession(kitted(), 'easy-run')
    const done = executeCurrentDay(state, currentRef(state), T0, { ...ON, speed: 1.5 })
    if (!done.ok) throw new Error(done.error)
    expect(done.value.state.wear!['starter-shoes']).toBeCloseTo((8 * 1.5) / 150, 6)
    const rest = withSession(kitted(), 'rest')
    const rested = executeCurrentDay(rest, currentRef(rest), T0, ON)
    expect(rested.ok && rested.value.state.wear).toBeUndefined()
  })

  it('wears the gear worn in a race by the race distance', () => {
    const { state, entry } = withEntry(onSunday(kitted()), 'RACE-001')
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0, ON)
    if (!raced.ok) throw new Error(raced.error)
    const km = getRace('RACE-001')!.distanceKm
    expect(raced.value.state.wear!['starter-shoes']).toBeCloseTo(km / 150, 6)
    expect(raced.value.state.wear!['hydration-backpack']).toBeCloseTo(km / 400, 6)
  })

  it('wears the gear of a Sunday Major\'s snapshot by the race distance when its result is added', () => {
    const applied = applyMajorReward(kitted(), majorPayload({ equipment: ['starter-shoes', 'poles'] }), ON)
    expect(applied!.state.wear).toEqual({ 'starter-shoes': Number((getRace('RACE-002')!.distanceKm / 150).toFixed(6)) })
  })

  it('never goes below 0 % and never blocks training', () => {
    const state = withSession(kitted({ 'starter-shoes': 0.99 }), 'long-run')
    const done = executeCurrentDay(state, currentRef(state), timeWithDraw(state, false), ON)
    if (!done.ok) throw new Error(done.error)
    expect(done.value.state.wear!['starter-shoes']).toBe(1)
    expect(shoesStatus(done.value.state, ON)).toMatchObject({ durabilityPct: 0, remainingKm: 0, wornOut: true })
    const again = withSession(done.value.state, 'easy-run')
    expect(executeCurrentDay(again, currentRef(again), T0, ON).ok).toBe(true)
  })

  it('reports the wear of every owned item that wears', () => {
    expect(gearStatus(kitted({ 'starter-shoes': 0.5 }), ON).map((g) => [g.itemId, g.durabilityPct])).toEqual([
      ['starter-shoes', 50],
      ['trail-shoes-basic', 100],
      ['hydration-backpack', 100],
    ])
  })
})

describe('equipment wear: injury risk from worn shoes', () => {
  it('injures in the high-risk band when the draw falls under the risk, with the existing consequences', () => {
    const state = withSession(kitted({ 'starter-shoes': 0.95 }), 'easy-run')
    const done = executeCurrentDay(state, currentRef(state), timeWithDraw(state, true), ON)
    if (!done.ok) throw new Error(done.error)
    expect(done.value.injured).toBe(true)
    expect(done.value.outcome).toMatchObject({ xpGained: 0, fitnessChange: -15, injured: true, injuryCause: 'worn-shoes' })
    expect(done.value.state.forcedRestDays).toBe(5)
    // The session still happened: the shoes wore.
    expect(done.value.state.wear!['starter-shoes']).toBeGreaterThan(0.95)
  })

  it('does not injure when the draw is above the risk, nor in the bands without risk, nor on Rest', () => {
    const risky = withSession(kitted({ 'starter-shoes': 0.95 }), 'easy-run')
    const lucky = executeCurrentDay(risky, currentRef(risky), timeWithDraw(risky, false), ON)
    expect(lucky.ok && lucky.value.injured).toBe(false)
    const fine = withSession(kitted({ 'starter-shoes': 0.85 }), 'easy-run')
    expect(executeCurrentDay(fine, currentRef(fine), timeWithDraw(fine, true), ON)).toMatchObject({ ok: true, value: { injured: false } })
    const rest = withSession(kitted({ 'starter-shoes': 1 }), 'rest')
    expect(executeCurrentDay(rest, currentRef(rest), timeWithDraw(rest, true), ON)).toMatchObject({ ok: true, value: { injured: false } })
  })

  it('draws the same for the same server time and day', () => {
    expect(shoeInjuryDraw(T0, 3, 2)).toBe(shoeInjuryDraw(T0, 3, 2))
    expect(shoeInjuryDraw(T0, 3, 2)).not.toBe(shoeInjuryDraw(T0 + 1, 3, 2))
  })
})

describe('equipment wear: racing needs shoes with life left', () => {
  it('refuses the entry with no shoes or worn-out shoes, and gives the shoes\' wear on entry', () => {
    const bare = { ...kitted(), equipment: ['hydration-backpack'] }
    expect(enterRace(bare, 'RACE-001', T0, ON)).toEqual({ ok: false, error: 'no-shoes-equipped' })
    expect(enterRace(kitted({ 'starter-shoes': 1 }), 'RACE-001', T0, ON)).toEqual({ ok: false, error: 'shoes-worn-out' })
    const entered = enterRace(kitted({ 'starter-shoes': 0.95 }), 'RACE-001', T0, ON)
    expect(entered).toMatchObject({ ok: true, shoes: { itemId: 'starter-shoes', durabilityPct: 5, remainingKm: 7.5, band: { raceStart: 'dnf' } } })
  })

  it('checks again at the start, because training may have worn the shoes since the entry', () => {
    const { state, entry } = withEntry(onSunday(kitted({ 'starter-shoes': 1 })), 'RACE-001')
    expect(startRace(state, currentRef(state), entry.id, { intensity: 'target', gel: false, bar: false }, T0, ON)).toEqual({ ok: false, error: 'shoes-worn-out' })
  })
})

describe('equipment wear: replacing worn gear', () => {
  it('buys a worn item again at its price, as new', () => {
    const state = { ...kitted({ 'trail-shoes-basic': 0.5, 'starter-shoes': 0.3 }), coins: 100 }
    const bought = buyItem(state, 'trail-shoes-basic', 35, ON)
    if (!bought.ok) throw new Error(bought.error)
    expect(bought.state.coins).toBe(65)
    expect(bought.state.wear).toEqual({ 'starter-shoes': 0.3 })
    expect(bought.state.ownedEquipment.filter((id) => id === 'trail-shoes-basic')).toHaveLength(1)
  })

  it('keeps "already owned" for gear that has not worn, never wears, or while wear is off', () => {
    const state = { ...kitted({ 'trail-shoes-basic': 0.5 }), coins: 100 }
    expect(buyItem(state, 'hydration-backpack', 30, ON)).toEqual({ ok: false, error: 'already-owned' })
    expect(buyItem(state, 'poles', 25, ON)).toEqual({ ok: false, error: 'already-owned' })
    expect(buyItem(state, 'trail-shoes-basic', 35)).toEqual({ ok: false, error: 'already-owned' })
  })
})

describe('equipment wear: saves', () => {
  it('keeps the wear in the save', () => {
    const state = kitted({ 'starter-shoes': 0.25 })
    const loaded = parseSave(serializeSave(state), T0)
    expect(loaded.status === 'loaded' && loaded.state.wear).toEqual({ 'starter-shoes': 0.25 })
  })

  it('loads a career from before wear with no wear, and does not add the field', () => {
    const loaded = parseSave(serializeSave(kitted()), T0)
    expect(loaded.status === 'loaded' && 'wear' in loaded.state).toBe(false)
  })

  it('rejects wear outside 0–1, and drops wear on items not owned or that never wear', () => {
    for (const wear of [{ 'starter-shoes': 1.5 }, { 'starter-shoes': -0.1 }] as Record<string, number>[]) {
      expect(parseSave(serializeSave(kitted(wear)), T0).status).toBe('incompatible')
    }
    // Not owned, or no life in km (the owner may delete an item or its life_km in Trail Studio): dropped.
    const loaded = parseSave(serializeSave(kitted({ 'trail-shoes-light': 0.1, poles: 0.1, 'starter-shoes': 0.2 })), T0)
    expect(loaded.status === 'loaded' && loaded.state.wear).toEqual({ 'starter-shoes': 0.2 })
  })

  it('applies wear to equipped gear only, with the given item list for a race', () => {
    const worn = applyWear(kitted(), 30, ON, ['trail-shoes-basic'])
    expect(worn.wear).toEqual({ 'trail-shoes-basic': 0.1 })
  })
})
