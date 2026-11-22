/**
 * Season simulation for equipment wear (brief B-6a; replaces task B-1). Runs the real engine with the
 * real tables (src/data), one game day per real day (so real-time Fitness decay applies), for a
 * sensible player, and reports Fitness, injuries, coins and the wear of the shoes at a few wear
 * speeds. Analysis only: nothing here changes a value of the game.
 *
 * Run: npx vite-node scripts/wear-simulation.ts [weeks]
 *
 * The real equipment table has no life_km yet (the owner supplies them). The shoe lives used here are
 * assumptions for the calibration, written in the report (SHOE_LIFE below).
 */
import { ATTRIBUTE_IDS } from '../src/domain/athlete/athlete'
import { getLevel } from '../src/domain/athlete/levels'
import { getEquipmentItem, EQUIPMENT_ITEMS } from '../src/domain/equipment/items'
import { durabilityPct, WEAR, type WearConfig } from '../src/domain/equipment/wear'
import { canEnterAtLevel, getRewardMultiplier } from '../src/domain/races/access'
import { NPC_RACES } from '../src/domain/races/races'
import type { SessionType } from '../src/domain/training/sessions'
import { allocateAttributePoint, getUnspentAttributePoints } from '../src/game-engine/attributes'
import { buyItem, setItemEquipped } from '../src/game-engine/equipment'
import { applyFitnessDecay } from '../src/game-engine/fitnessDecay'
import { createInitialGameState, type GameState } from '../src/game-engine/gameState'
import { enterRace, raceCurrentDay } from '../src/game-engine/races'
import { getScheduledEntry, isRaceDayToday } from '../src/game-engine/raceSchedule'
import { executeCurrentDay, planSession } from '../src/game-engine/training'
import { equippedShoes, usedOf } from '../src/game-engine/wear'

const DAY = 24 * 3_600_000
const T0 = Date.UTC(2026, 0, 5, 8)

/** Assumed shoe lives in km for the calibration (the owner sets the real ones in equipment.csv). */
export const SHOE_LIFE: Record<string, number> = {
  'starter-shoes': 150,
  'trail-shoes-basic': 200,
  'trail-shoes': 250,
  'trail-shoes-light': 200,
  'trail-shoes-3': 300,
}

/** Upgrades bought in this order when affordable (each equipped at once): shoes, then pack, then poles. */
const UPGRADES = ['trail-shoes-basic', 'hydration-backpack', 'poles', 'trail-shoes', 'hydration-backpack-2', 'poles-2', 'trail-shoes-light', 'hydration-backpack-3', 'trail-shoes-3']

/** Below this durability a sensible player replaces the shoes (owner band "slight penalty" starts at 39 %). */
const REPLACE_AT_PCT = 20

export interface Options {
  weeks: number
  wear: WearConfig
  /** Race every week (true) or every second week. */
  weekly: boolean
}

export interface WeekRow {
  week: number
  level: number
  xp: number
  fitness: number
  fatigue: number
  coins: number
  earned: number
  shoes: string
  durability: number | null
  race: string
}

export interface SimResult {
  rows: WeekRow[]
  injuries: number
  shoeInjuries: number
  coinsEarned: number
  coinsOnReplacements: number
  coinsOnUpgrades: number
  replacements: { week: number; item: string; price: number }[]
  trainingKm: number
  raceKm: number
  /** Weeks with no pair above 9 % and too few coins for the cheapest pair: the soft-lock the emergency pair covers. */
  softLockWeeks: number[]
  blockedRaces: number
}

function setLives(): void {
  for (const item of EQUIPMENT_ITEMS) {
    if (SHOE_LIFE[item.id] !== undefined) (item as { lifeKm?: number }).lifeKm = SHOE_LIFE[item.id]
  }
}

/** Lowest race with full rewards the runner can enter (the same rule as docs/SEASON_SIMULATION_16W.md). */
function pickRace(state: GameState) {
  const level = getLevel(state.athlete.xp)
  const open = NPC_RACES.filter((race) => canEnterAtLevel(race, level) && getRewardMultiplier(race, level).coins >= 1)
  return open.sort((a, b) => a.recommendedLevel - b.recommendedLevel)[0] ?? NPC_RACES.filter((r) => canEnterAtLevel(r, level)).at(-1)
}

function spendPoints(state: GameState): GameState {
  let s = state
  let turn = s.athlete.spentAttributePoints
  while (getUnspentAttributePoints(s.athlete) > 0) {
    const done = allocateAttributePoint(s, ATTRIBUTE_IDS[turn % ATTRIBUTE_IDS.length]!, s.athlete.spentAttributePoints)
    if (!done.ok) break
    s = done.state
    turn++
  }
  return s
}

function buyAndWear(state: GameState, id: string, wear: WearConfig): GameState | null {
  const item = getEquipmentItem(id)!
  if (item.price === null || item.price > state.coins) return null
  const bought = buyItem(state, id, item.price, wear)
  if (!bought.ok) return null
  const worn = setItemEquipped(bought.state, id, true)
  return worn.ok ? worn.state : bought.state
}

/** The sensible player's session for today (docs/SEASON_SIMULATION_16W.md). */
function sensibleSession(state: GameState, raceTomorrow: boolean): SessionType {
  const planned = state.week.days[state.week.currentDayIndex]!.session
  const fatigue = state.athlete.fatigue
  if (raceTomorrow || fatigue >= 60) return 'rest'
  if (fatigue >= 35 && (planned === 'intervals' || planned === 'hills' || planned === 'long-run')) {
    return state.week.currentDayIndex % 2 === 0 ? 'strength' : 'trail-technique'
  }
  return planned
}

export function simulate(options: Options): SimResult {
  setLives()
  const { wear } = options
  let state = createInitialGameState('all-rounder', T0, { name: 'Sim', sex: 'female' })
  state = { ...state, equipment: ['starter-shoes'] }
  let now = T0
  const result: SimResult = {
    rows: [],
    injuries: 0,
    shoeInjuries: 0,
    coinsEarned: 0,
    coinsOnReplacements: 0,
    coinsOnUpgrades: 0,
    replacements: [],
    trainingKm: 0,
    raceKm: 0,
    softLockWeeks: [],
    blockedRaces: 0,
  }
  let weekEarned = 0
  let weekRace = '—'
  let upgrade = 0
  const cheapestShoes = Math.min(...EQUIPMENT_ITEMS.filter((i) => i.slot === 'shoes' && i.price).map((i) => i.price!))

  while (state.week.number <= options.weeks) {
    state = applyFitnessDecay(state, now).state
    const dayIndex = state.week.currentDayIndex
    // Any day: a sensible player replaces shoes below REPLACE_AT_PCT before they run out.
    {
      const shoes = equippedShoes(state)
      const shoesPct = shoes ? durabilityPct(usedOf(state, shoes)) : 0
      if (wear.speed > 0 && shoes && shoesPct < REPLACE_AT_PCT) {
        // Replace: the same pair again if affordable, else the free starter shoes again (price 0).
        const pair = (getEquipmentItem(shoes)!.price ?? 0) <= state.coins ? shoes : 'starter-shoes'
        const price = getEquipmentItem(pair)!.price ?? 0
        // A pair owned that has not worn yet is just put on.
        const fresh = pair !== shoes && usedOf(state, pair) === 0 && state.ownedEquipment.includes(pair)
        const equipped = fresh ? setItemEquipped(state, pair, true) : null
        if (equipped?.ok) state = equipped.state
        const replaced = fresh ? null : buyAndWear(state, pair, wear)
        if (replaced) {
          state = replaced
          result.coinsOnReplacements += price
          result.replacements.push({ week: state.week.number, item: pair, price })
        }
      }
    }
    // Monday: shop, enter the week's race.
    if (dayIndex === 0) {
      state = spendPoints(state)
      const next = UPGRADES[upgrade]
      if (next) {
        const bought = buyAndWear(state, next, wear)
        if (bought) {
          result.coinsOnUpgrades += getEquipmentItem(next)!.price ?? 0
          state = bought
          upgrade++
        }
      }
      const pairOk = state.ownedEquipment.some((id) => getEquipmentItem(id)?.slot === 'shoes' && durabilityPct(usedOf(state, id)) > 9)
      if (wear.speed > 0 && !pairOk && state.coins < cheapestShoes) result.softLockWeeks.push(state.week.number)
      const raceWeek = options.weekly || state.week.number % 2 === 0
      const race = raceWeek && state.athlete.fatigue <= 70 ? pickRace(state) : undefined
      if (race && !getScheduledEntry(state)) {
        const entered = enterRace(state, race.id, now, wear)
        if (entered.ok) state = entered.state
        else result.blockedRaces++
      }
    }

    const ref = { week: state.week.number, dayIndex }
    if (isRaceDayToday(state)) {
      const entry = getScheduledEntry(state)!
      const raced = raceCurrentDay(state, ref, entry.id, now, wear)
      if (!raced.ok) throw new Error(`${raced.error} speed ${wear.speed} week ${ref.week} coins ${state.coins} eq ${state.equipment} wear ${JSON.stringify(state.wear)} owned ${state.ownedEquipment}`)
      const { result: r } = raced.value.entry
      const race = NPC_RACES.find((x) => x.id === entry.raceId)!
      result.raceKm += race.distanceKm
      result.coinsEarned += r.coinsAwarded
      weekEarned += r.coinsAwarded
      if (r.injured) result.injuries++
      weekRace = `${race.name} (${race.distanceKm} km): #${r.position}, +${r.coinsAwarded} coins`
      state = raced.value.state
    } else {
      const raceTomorrow = dayIndex === 5 && getScheduledEntry(state) !== undefined
      const session = state.forcedRestDays > 0 ? 'rest' : sensibleSession(state, raceTomorrow)
      if (session !== state.week.days[dayIndex]!.session) {
        const planned = planSession(state, ref, session)
        if (planned.ok) state = planned.value
      }
      const coinsBefore = state.coins
      const done = executeCurrentDay(state, ref, now, wear)
      if (!done.ok) throw new Error(`${done.error} week ${ref.week} day ${ref.dayIndex}`)
      result.trainingKm += wear.sessionKm[done.value.executed.session]
      if (done.value.injured) {
        result.injuries++
        if (done.value.outcome.injuryCause === 'worn-shoes') result.shoeInjuries++
      }
      state = done.value.state
      // Achievement coins.
      result.coinsEarned += Math.max(0, state.coins - coinsBefore)
      weekEarned += Math.max(0, state.coins - coinsBefore)
    }
    if (state.week.currentDayIndex === 0) {
      const shoes = equippedShoes(state)
      result.rows.push({
        week: state.week.number - 1,
        level: getLevel(state.athlete.xp),
        xp: state.athlete.xp,
        fitness: Math.round(state.athlete.fitness * 10) / 10,
        fatigue: Math.round(state.athlete.fatigue * 10) / 10,
        coins: state.coins,
        earned: weekEarned,
        shoes: shoes ?? 'none',
        durability: shoes && wear.speed > 0 ? durabilityPct(usedOf(state, shoes)) : null,
        race: weekRace,
      })
      weekEarned = 0
      weekRace = '—'
    }
    now += DAY
  }
  // Income: every coin received (prizes, level and achievement rewards) = spent + kept − the start.
  result.coinsEarned = state.coins - 25 + result.coinsOnReplacements + result.coinsOnUpgrades
  return result
}

// A summary per wear speed, as JSON.
{
  const weeks = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 16)
  const out: Record<string, unknown> = {}
  for (const weekly of [false, true]) {
    for (const speed of [0, 0.5, 0.75, 1, 1.5]) {
      const r = simulate({ weeks, weekly, wear: { ...WEAR, speed } })
      out[`${weekly ? 'weekly' : 'biweekly'}@${speed}`] = {
        ...r,
        rows: speed === 0 || speed === 1 ? r.rows : undefined,
      }
    }
  }
  console.log(JSON.stringify(out, null, 1))
}
