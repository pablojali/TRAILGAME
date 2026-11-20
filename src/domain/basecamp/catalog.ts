import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import basecampCsv from '../../data/basecamp.csv?raw'
import exclusiveCsv from '../../data/basecamp_exclusive.csv?raw'
import { ITEM_LANGUAGES, type ItemLanguage } from '../equipment/items'

/**
 * Base Camp pieces (owner design, 16 November 2026): the player's cabin is built from layers on
 * the same canvas, a background, a cabin over it and decor (seats, banners, flags…) over both;
 * since 20 November 2026 decor too is a whole-canvas picture, transparent but for the object.
 * Every piece is unlocked by the player's level and bought with coins or Premium Coins; the level 0
 * free backgrounds are everyone's from the start. The owner edits the table in Trail Studio.
 */
export type CampScene = 'exterior' | 'interior'
export type CampKind = 'background' | 'upgrade' | 'cabin' | 'decor'
export type Currency = 'coins' | 'premium'

/**
 * What tapping a piece does (owner request, 16 November 2026: the door, the gear bench, the
 * mailbox…). Each piece has at most one action, with its button at the piece's spot.
 */
export type CampAction = 'enter' | 'exit' | 'gear' | 'look' | 'mailbox' | 'training' | 'races' | 'career'
export const CAMP_ACTIONS: readonly CampAction[] = ['enter', 'exit', 'gear', 'look', 'mailbox', 'training', 'races', 'career']
/**
 * The action a scene must offer with its free pieces: the door outside. Inside nothing is forced
 * (owner request, 17 November 2026: he picks each background's button; "Go out" is in the header).
 */
export const ESSENTIAL_ACTION: Partial<Record<CampScene, CampAction>> = { exterior: 'enter' }

export const CAMP_SCENES: readonly CampScene[] = ['exterior', 'interior']
export const CAMP_KINDS: readonly CampKind[] = ['background', 'upgrade', 'cabin', 'decor']
export const CURRENCIES: readonly Currency[] = ['coins', 'premium']

export interface CampItem {
  id: string
  scene: CampScene
  kind: CampKind
  /** Player level that unlocks it. */
  level: number
  price: number
  currency: Currency
  /** The picture's name in assets/ui/basecamp/{scene}/, without extension. */
  art: string
  /** What tapping the piece does, and where its button sits (shares of the picture). */
  action?: CampAction
  spot?: { x: number; y: number }
  /**
   * Upgrades (owner design, 17 November 2026): the background this piece redraws. An upgrade is a
   * whole picture on the same canvas (a new stove, another cabin) that keeps its background's
   * button and slots; the player shows one upgrade of a background at a time, or none.
   */
  base?: string
  /**
   * Upgrades and decor: what the shop shows of the picture (the part that changes, the object),
   * centre and zoom. A decor object's button sits at its centre.
   */
  focus?: { x: number; y: number; zoom: number }
  /**
   * Evolutions (owner design, 20 November 2026): pieces of the same family (e.g. "firepit") are
   * levels of one thing: one in use at a time, the next one replacing the last.
   */
  family?: string
  /** Pieces the player must own before buying this one (e.g. the firepit lvl 2 needs the house lvl 1). */
  requires?: string[]
  /** English name. */
  label: string
  names?: Partial<Record<ItemLanguage, string>>
  /**
   * Never for sale (owner request, 16 November 2026: the admin's own refuge). Listed in
   * src/data/basecamp_exclusive.csv, out of Trail Studio; the server gives it to the admins.
   */
  exclusive?: true
}

const ID = /^[a-z0-9][a-z0-9-]*$/
const ART = /^[a-z0-9][a-z0-9_-]*$/

export function parseCampCatalog(text: string, options: { exclusive?: boolean } = {}): CampItem[] {
  const file = options.exclusive ? 'basecamp_exclusive.csv' : 'basecamp.csv'
  const items = parseCsv(text).map((row, i): CampItem => {
    const where = `${file} row ${i + 1} (${row.id || 'no id'})`
    if (!row.id || !ID.test(row.id)) throw new Error(`${where}: the id must be lower case letters, digits and -`)
    const scene = row.scene as CampScene
    if (!CAMP_SCENES.includes(scene)) throw new Error(`${where}: scene must be exterior or interior`)
    const kind = row.kind as CampKind
    if (!CAMP_KINDS.includes(kind)) throw new Error(`${where}: kind must be background, upgrade, cabin or decor`)
    const currency = (row.currency || 'coins') as Currency
    if (!CURRENCIES.includes(currency)) throw new Error(`${where}: currency must be coins or premium`)
    const level = csvInt(row.level, where)
    const price = csvInt(row.price, where)
    if (level < 0 || price < 0) throw new Error(`${where}: level and price cannot be negative`)
    if (!row.art || !ART.test(row.art)) throw new Error(`${where}: art must be a file name (lower case letters, digits, - and _)`)
    const item: CampItem = { id: row.id, scene, kind, level, price, currency, art: row.art, label: row.name || row.id }
    if (row.family) {
      if (!ID.test(row.family)) throw new Error(`${where}: family must be lower case letters, digits and -`)
      if (kind !== 'decor' && kind !== 'upgrade') throw new Error(`${where}: only decor and upgrades have a family`)
      item.family = row.family
    }
    if (row.requires) item.requires = [...new Set(row.requires.split(/[\s|]+/).filter(Boolean))]
    if (row.spot_x || row.spot_y) {
      const x = csvNumber(row.spot_x, where)
      const y = csvNumber(row.spot_y, where)
      if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error(`${where}: spot_x and spot_y go from 0 to 1`)
      item.spot = { x, y }
    }
    if (row.action) {
      if (!CAMP_ACTIONS.includes(row.action as CampAction)) throw new Error(`${where}: unknown action "${row.action}" (${CAMP_ACTIONS.join(', ')})`)
      item.action = row.action as CampAction
    }
    const readFocus = () => {
      if (!row.focus) return
      const [x, y, zoom] = row.focus.split(':').map(Number)
      if (![x, y].every((n) => Number.isFinite(n) && n! >= 0 && n! <= 1) || !(Number.isFinite(zoom) && zoom! >= 1 && zoom! <= 8)) {
        throw new Error(`${where}: focus is x:y:zoom (x and y from 0 to 1, zoom from 1 to 8)`)
      }
      item.focus = { x: x!, y: y!, zoom: zoom! }
    }
    // Upgrades and decor are whole pictures on the scene's canvas, drawn over the background (owner
    // design, 17 and 20 November 2026): no places. The old slots and size columns are ignored.
    if (kind === 'upgrade') {
      if (row.action || item.spot) throw new Error(`${where}: an upgrade keeps its background's button (no action or spot)`)
      if (!row.base) throw new Error(`${where}: an upgrade needs base (the background it redraws)`)
      item.base = row.base
      readFocus()
      return finishItem(item, row, options)
    }
    if (row.base) throw new Error(`${where}: only upgrades have base`)
    if (kind === 'decor') {
      // Its button sits where its thumbnail points (the focus centre).
      if (item.spot) throw new Error(`${where}: decor has no spot_x and spot_y (its button sits at its focus)`)
      readFocus()
      return finishItem(item, row, options)
    }
    if (row.focus) throw new Error(`${where}: only upgrades and decor have focus`)
    if (item.action && !item.spot) throw new Error(`${where}: an action needs spot_x and spot_y`)
    if (!item.action && item.spot) throw new Error(`${where}: spot_x and spot_y need an action`)
    // The house is part of each background (owner, 16 November 2026): every exterior background
    // has its door. An interior background has any button, or none.
    if (kind === 'background' && ESSENTIAL_ACTION[scene] && item.action !== ESSENTIAL_ACTION[scene]) {
      throw new Error(`${where}: a ${scene} background needs the ${ESSENTIAL_ACTION[scene]} action and its spot`)
    }
    return finishItem(item, row, options)
  })
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${file}: id ${item.id} is repeated`)
    ids.add(item.id)
  }
  for (const item of items) {
    for (const id of item.requires ?? []) {
      if (id === item.id) throw new Error(`${file}: ${item.id} cannot require itself`)
      if (!options.exclusive && !items.some((other) => other.id === id)) throw new Error(`${file}: ${item.id} requires unknown piece ${id}`)
    }
  }
  for (const item of items) {
    if (item.kind !== 'upgrade') continue
    const base = items.find((other) => other.id === item.base)
    if (!base || base.kind !== 'background' || base.scene !== item.scene) {
      throw new Error(`${file}: upgrade ${item.id} needs base to be a background of the ${item.scene} in this table`)
    }
  }
  if (options.exclusive) return items
  for (const scene of CAMP_SCENES) {
    if (!items.some((item) => item.scene === scene && item.kind === 'background' && isFreeFromStart(item))) {
      throw new Error(`basecamp.csv: the ${scene} needs a background with level 0 and price 0 (everyone's from the start)`)
    }
    const free = items.filter((item) => item.scene === scene && isFreeFromStart(item))
    if (ESSENTIAL_ACTION[scene] && !free.some((item) => item.action === ESSENTIAL_ACTION[scene])) {
      throw new Error(`basecamp.csv: a free piece of the ${scene} must have the ${ESSENTIAL_ACTION[scene]} action`)
    }
  }
  return items
}

function finishItem(item: CampItem, row: Record<string, string>, options: { exclusive?: boolean }): CampItem {
  const names: Partial<Record<ItemLanguage, string>> = {}
  for (const language of ITEM_LANGUAGES) if (row[`name_${language}`]) names[language] = row[`name_${language}`]!
  if (Object.keys(names).length) item.names = names
  if (options.exclusive) item.exclusive = true
  return item
}

/** Level 0 and free: every player has it from the start (an exclusive piece never is). */
export function isFreeFromStart(item: CampItem): boolean {
  return item.level === 0 && item.price === 0 && !item.exclusive
}

function joinCatalogs(main: CampItem[], exclusive: CampItem[]): CampItem[] {
  const ids = new Set(main.map((item) => item.id))
  for (const item of exclusive) if (ids.has(item.id)) throw new Error(`basecamp_exclusive.csv: id ${item.id} is also in basecamp.csv`)
  return [...main, ...exclusive]
}

export const CAMP_ITEMS: readonly CampItem[] = joinCatalogs(parseCampCatalog(basecampCsv), parseCampCatalog(exclusiveCsv, { exclusive: true }))
export const EXCLUSIVE_IDS: readonly string[] = CAMP_ITEMS.filter((item) => item.exclusive).map((item) => item.id)
const BY_ID = new Map(CAMP_ITEMS.map((item) => [item.id, item]))

export function getCampItem(id: string): CampItem | undefined {
  return BY_ID.get(id)
}

export function campItems(scene: CampScene, kind?: CampKind): CampItem[] {
  return CAMP_ITEMS.filter((item) => item.scene === scene && (kind === undefined || item.kind === kind))
}

/** The scene's background when the player chose none: its first free one. */
export function defaultBackground(scene: CampScene): CampItem {
  return campItems(scene, 'background').find(isFreeFromStart)!
}

/** The upgrades of a background. */
export function campUpgrades(background: CampItem): CampItem[] {
  return CAMP_ITEMS.filter((item) => item.kind === 'upgrade' && item.base === background.id)
}

export function campItemName(item: CampItem, language: string): string {
  return item.names?.[language as ItemLanguage] ?? item.label
}
