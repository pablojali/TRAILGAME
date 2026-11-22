import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import wearBandsCsv from '../../data/wear_bands.csv?raw'
import wearKmCsv from '../../data/wear_km.csv?raw'
import { WEAR_SPEED } from '../economy/premium'
import { TRAINING_SESSIONS, type SessionType } from '../training/sessions'
import { getEquipmentItem, type EquipmentItem } from './items'

/**
 * Equipment wear (owner decisions D6 and D7, 22 November 2026; brief B-6a). Every item with a life
 * in km (equipment.csv life_km) wears while it is equipped: by each training session's km
 * (wear_km.csv) and by each race's distance. economy.csv wear_speed multiplies all wear; 0 turns
 * wear off, and the game then behaves as before it existed.
 *
 * What is stored per item is the share of its life already used (0 to 1), after wear_speed. So a
 * later change to wear_speed or to an item's life_km changes how fast gear wears from then on, never
 * the wear it already has.
 */

/** What a band does to starting a race: run normally, break during it (B-6b) or not start. */
export type RaceStart = 'ok' | 'dnf' | 'blocked'

export interface WearBand {
  /** Durability left in whole percent, both ends included. */
  fromPct: number
  toPct: number
  label: string
  /** Share of the shoes' race bonus that is kept (0 to 1). Applied by B-6b. */
  effectFactor: number
  /** Chance, in percent, of an injury in each training session. */
  injuryRiskPct: number
  raceStart: RaceStart
}

export interface WearConfig {
  /** economy.csv wear_speed: 0 = wear off. */
  speed: number
  /** Km each training session wears the equipped gear by. */
  sessionKm: Record<SessionType, number>
  /** Shoe bands, from the most durability left to the least. */
  bands: WearBand[]
}

const RACE_STARTS: readonly RaceStart[] = ['ok', 'dnf', 'blocked']

/** Reads wear_bands.csv: whole percents, the bands cover 0 to 100 exactly once. */
export function parseWearBands(text: string): WearBand[] {
  const bands = parseCsv(text).map((row, i): WearBand => {
    const where = `wear_bands.csv row ${i + 1}`
    const band: WearBand = {
      fromPct: csvInt(row.from_pct, where),
      toPct: csvInt(row.to_pct, where),
      label: row.label ?? '',
      effectFactor: csvNumber(row.effect_factor, where),
      injuryRiskPct: csvNumber(row.injury_risk_pct, where),
      raceStart: row.race_start as RaceStart,
    }
    if (!(band.fromPct >= 0 && band.fromPct <= band.toPct && band.toPct <= 100)) throw new Error(`${where}: from_pct and to_pct must go from 0 to 100, from_pct first`)
    if (!(band.effectFactor >= 0 && band.effectFactor <= 1)) throw new Error(`${where}: effect_factor must be 0 to 1`)
    if (!(band.injuryRiskPct >= 0 && band.injuryRiskPct <= 100)) throw new Error(`${where}: injury_risk_pct must be 0 to 100`)
    if (!RACE_STARTS.includes(band.raceStart)) throw new Error(`${where}: race_start must be ok, dnf or blocked`)
    return band
  })
  bands.sort((a, b) => b.toPct - a.toPct)
  let next = 100
  for (const band of bands) {
    if (band.toPct !== next) throw new Error(`wear_bands.csv: the bands must cover 0 to 100 once (nothing or twice at ${next}%)`)
    next = band.fromPct - 1
  }
  if (next !== -1) throw new Error('wear_bands.csv: the bands must reach 0%')
  return bands
}

/** Reads wear_km.csv: one row per session type, km 0 or more. */
export function parseWearKm(text: string): Record<SessionType, number> {
  const km = {} as Record<SessionType, number>
  for (const [i, row] of parseCsv(text).entries()) {
    const where = `wear_km.csv row ${i + 1}`
    if (!(row.session! in TRAINING_SESSIONS)) throw new Error(`${where}: unknown session "${row.session}"`)
    const value = csvNumber(row.km, where)
    if (!(value >= 0)) throw new Error(`${where}: km must be 0 or more`)
    km[row.session as SessionType] = value
  }
  const missing = Object.keys(TRAINING_SESSIONS).find((session) => km[session as SessionType] === undefined)
  if (missing) throw new Error(`wear_km.csv: no row for "${missing}"`)
  return km
}

/** The owner's tables. */
export const WEAR: WearConfig = {
  speed: WEAR_SPEED,
  sessionKm: parseWearKm(wearKmCsv),
  bands: parseWearBands(wearBandsCsv),
}

/** True when equipment wears at all. */
export function wearOn(config: WearConfig = WEAR): boolean {
  return config.speed > 0
}

/** Whether an item wears: it has a life in km. */
export function wears(item: EquipmentItem | undefined): item is EquipmentItem & { lifeKm: number } {
  return item?.lifeKm !== undefined
}

/**
 * Durability left in whole percent, rounded up: only gear with no life left at all is at 0 %, so
 * a pair with a few metres left is still in the 1–9 % band.
 */
export function durabilityPct(used: number): number {
  const left = Math.min(1, Math.max(0, 1 - used))
  return Math.min(100, Math.max(0, Math.ceil(left * 100 - 1e-9)))
}

export function bandOf(pct: number, config: WearConfig = WEAR): WearBand {
  return config.bands.find((band) => pct >= band.fromPct && pct <= band.toPct) ?? config.bands[config.bands.length - 1]!
}

/** Rounds a share of life used, so saves stay small and comparisons exact. */
export function roundUsed(used: number): number {
  return Math.min(1, Math.max(0, Math.round(used * 1e6) / 1e6))
}

/** The share of an item's life a distance uses at the current wear speed. */
export function lifeShare(item: EquipmentItem & { lifeKm: number }, km: number, config: WearConfig = WEAR): number {
  return (km * config.speed) / item.lifeKm
}

/** An item's wear, for the server's answers and the screens (A-5). */
export interface WearStatus {
  itemId: string
  /** Share of the life used, 0 to 1. */
  used: number
  /** Durability left in whole percent. */
  durabilityPct: number
  /** The item's whole life as the player sees it: life_km ÷ wear_speed. */
  lifeKm: number
  /** Km of use left at the current wear speed. */
  remainingKm: number
  /** Shoes only: the band of the durability left. */
  band?: WearBand
  /** No life left: shoes cannot start a race, other gear loses its effect (B-6b). */
  wornOut: boolean
}

/** The wear of one item, or null if it does not wear (or wear is off). */
export function wearStatus(itemId: string, used: number, config: WearConfig = WEAR): WearStatus | null {
  const item = getEquipmentItem(itemId)
  if (!wears(item) || !wearOn(config)) return null
  const share = roundUsed(used)
  const pct = durabilityPct(share)
  const lifeKm = item.lifeKm / config.speed
  return {
    itemId,
    used: share,
    durabilityPct: pct,
    lifeKm: Math.round(lifeKm * 10) / 10,
    remainingKm: Math.round((1 - share) * lifeKm * 10) / 10,
    ...(item.slot === 'shoes' ? { band: bandOf(pct, config) } : {}),
    wornOut: pct === 0,
  }
}
