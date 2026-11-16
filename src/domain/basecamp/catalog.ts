import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import basecampCsv from '../../data/basecamp.csv?raw'
import { ITEM_LANGUAGES, type ItemLanguage } from '../equipment/items'

/**
 * Base Camp pieces (owner design, 16 November 2026): the player's cabin is built from layers on
 * the same canvas, a background, a cabin over it and decor (seats, banners, flags…) over both.
 * Every piece is unlocked by the player's level and bought with coins or Premium Coins; the level 0
 * free backgrounds are everyone's from the start. The owner edits the table in Trail Studio.
 */
export type CampScene = 'exterior' | 'interior'
export type CampKind = 'background' | 'cabin' | 'decor'
export type Currency = 'coins' | 'premium'

/**
 * What tapping a piece does (owner request, 16 November 2026: the door, the gear bench, the
 * mailbox…). Each piece has at most one action, with its button at the piece's spot.
 */
export type CampAction = 'enter' | 'exit' | 'gear' | 'look' | 'mailbox' | 'training' | 'races' | 'career'
export const CAMP_ACTIONS: readonly CampAction[] = ['enter', 'exit', 'gear', 'look', 'mailbox', 'training', 'races', 'career']
/** The action every scene must offer with its free pieces: the door outside, the gear inside. */
export const ESSENTIAL_ACTION: Record<CampScene, CampAction> = { exterior: 'enter', interior: 'gear' }

export const CAMP_SCENES: readonly CampScene[] = ['exterior', 'interior']
export const CAMP_KINDS: readonly CampKind[] = ['background', 'cabin', 'decor']
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
  /** English name. */
  label: string
  names?: Partial<Record<ItemLanguage, string>>
}

const ID = /^[a-z0-9][a-z0-9-]*$/
const ART = /^[a-z0-9][a-z0-9_-]*$/

export function parseCampCatalog(text: string): CampItem[] {
  const items = parseCsv(text).map((row, i): CampItem => {
    const where = `basecamp.csv row ${i + 1} (${row.id || 'no id'})`
    if (!row.id || !ID.test(row.id)) throw new Error(`${where}: the id must be lower case letters, digits and -`)
    const scene = row.scene as CampScene
    if (!CAMP_SCENES.includes(scene)) throw new Error(`${where}: scene must be exterior or interior`)
    const kind = row.kind as CampKind
    if (!CAMP_KINDS.includes(kind)) throw new Error(`${where}: kind must be background, cabin or decor`)
    const currency = (row.currency || 'coins') as Currency
    if (!CURRENCIES.includes(currency)) throw new Error(`${where}: currency must be coins or premium`)
    const level = csvInt(row.level, where)
    const price = csvInt(row.price, where)
    if (level < 0 || price < 0) throw new Error(`${where}: level and price cannot be negative`)
    if (!row.art || !ART.test(row.art)) throw new Error(`${where}: art must be a file name (lower case letters, digits, - and _)`)
    const item: CampItem = { id: row.id, scene, kind, level, price, currency, art: row.art, label: row.name || row.id }
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
    if (item.action && !item.spot) throw new Error(`${where}: an action needs spot_x and spot_y`)
    if (!item.action && item.spot) throw new Error(`${where}: spot_x and spot_y need an action`)
    const names: Partial<Record<ItemLanguage, string>> = {}
    for (const language of ITEM_LANGUAGES) if (row[`name_${language}`]) names[language] = row[`name_${language}`]!
    if (Object.keys(names).length) item.names = names
    return item
  })
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`basecamp.csv: id ${item.id} is repeated`)
    ids.add(item.id)
  }
  for (const scene of CAMP_SCENES) {
    if (!items.some((item) => item.scene === scene && item.kind === 'background' && isFreeFromStart(item))) {
      throw new Error(`basecamp.csv: the ${scene} needs a background with level 0 and price 0 (everyone's from the start)`)
    }
    const free = items.filter((item) => item.scene === scene && isFreeFromStart(item))
    if (!free.some((item) => item.action === ESSENTIAL_ACTION[scene])) {
      throw new Error(`basecamp.csv: a free piece of the ${scene} must have the ${ESSENTIAL_ACTION[scene]} action`)
    }
  }
  return items
}

/** Level 0 and free: every player has it from the start. */
export function isFreeFromStart(item: CampItem): boolean {
  return item.level === 0 && item.price === 0
}

export const CAMP_ITEMS: readonly CampItem[] = parseCampCatalog(basecampCsv)
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

export function campItemName(item: CampItem, language: string): string {
  return item.names?.[language as ItemLanguage] ?? item.label
}
