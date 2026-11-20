import { getLevel } from '../domain/athlete/levels'
import { campItems, defaultBackground, ESSENTIAL_ACTION, EXCLUSIVE_IDS, getCampItem, isFreeFromStart, tiedBackground, type CampAction, type CampItem, type CampScene, type Currency } from '../domain/basecamp/catalog'
import { COINS_PER_PREMIUM, MAX_EXCHANGE } from '../domain/economy/premium'
import type { CampState, GameState } from './gameState'

/**
 * Base Camp pieces (owner design, 16 November 2026): bought once with coins or Premium Coins once
 * the player's level unlocks them, then put in the scene or taken out. Server-authoritative like
 * the rest of the economy (career-ops `camp-buy`, `camp-use`, `premium-exchange`).
 */
export type CampBuyError =
  | 'unknown-item'
  | 'already-owned'
  | 'level-locked'
  /** The price or currency the player confirmed is not the current one. */
  | 'price-changed'
  | 'insufficient-coins'
  | 'insufficient-premium'
  /** An exclusive piece (the admin's refuge): never sold. */
  | 'not-for-sale'
  /** An upgrade of a background the player does not have. */
  | 'needs-base'
  /** A piece it requires (an earlier evolution, the house…) that the player does not own. */
  | 'needs-piece'

/** `needs-base`: an upgrade of a background the player does not have. */
export type CampUseError = 'unknown-item' | 'not-owned' | 'needs-base'

export type ExchangeError = 'bad-amount' | 'rate-changed' | 'insufficient-coins'

const EMPTY: CampState = { owned: [], using: [] }

/** What reading a refuge needs: its pieces (a whole career, or another runner's refuge). */
export type CampHolder = Pick<GameState, 'camp'>

export function campOf(state: CampHolder): CampState {
  return state.camp ?? EMPTY
}

export function premiumOf(state: GameState): number {
  return state.premiumCoins ?? 0
}

export function ownsCampItem(state: CampHolder, item: CampItem): boolean {
  return isFreeFromStart(item) || campOf(state).owned.includes(item.id)
}

/**
 * What the scene shows: the background and cabin in use (else the free ones), and the decor in use.
 * `picture` is the background's upgrade the player chose, else the background itself: it is what is
 * drawn, while the background keeps the button. Decor (owner design, 20 November 2026) is a picture
 * on the scene's whole canvas, transparent but for the object, drawn over the background like an
 * upgrade: no places, any number at once, each shown once the player puts it in (free ones too).
 */
export function campScene(
  state: CampHolder,
  scene: CampScene,
): { background: CampItem; picture: CampItem; cabin: CampItem | null; decor: CampItem[] } {
  const camp = campOf(state)
  const using = new Set(camp.using)
  const off = new Set(camp.off ?? [])
  const items = campItems(scene)
  const pick = (kind: 'background' | 'cabin') => {
    const all = items.filter((item) => item.kind === kind)
    return all.find((item) => using.has(item.id) && ownsCampItem(state, item)) ?? all.find((item) => isFreeFromStart(item) && !off.has(item.id)) ?? null
  }
  const background = pick('background') ?? defaultBackground(scene)
  const picture = items.find((item) => item.kind === 'upgrade' && item.base === background.id && using.has(item.id) && ownsCampItem(state, item)) ?? background
  // One level per family: the latest put in (later in `using`).
  const decor = items
    .filter((item) => item.kind === 'decor' && using.has(item.id) && ownsCampItem(state, item))
    // An object tied to a background (a house, a fireplace) is only drawn over it.
    .filter((item) => {
      const tied = tiedBackground(item)
      return !tied || tied.id === background.id
    })
    .filter((item, _, all) => !all.some((other) => other !== item && sameFamily(other, item) && camp.using.indexOf(other.id) > camp.using.indexOf(item.id)))
  return { background, picture, cabin: pick('cabin'), decor }
}

export interface CampSpot {
  item: CampItem
  action: CampAction
  x: number
  y: number
}

/**
 * The buttons of the scene: every shown piece with an action. The scene's essential action (the
 * door outside) is always there: if the shown pieces lack it, the free piece that has it lends its
 * spot.
 */
export function campSpots(state: CampHolder, scene: CampScene): CampSpot[] {
  const { background, cabin, decor } = campScene(state, scene)
  // One button per action: a piece drawn later (a cabin over its background) moves it.
  const byAction = new Map<CampAction, CampSpot>()
  const add = (spot: CampSpot) => {
    byAction.delete(spot.action)
    byAction.set(spot.action, spot)
  }
  for (const item of [background, cabin]) {
    if (item?.action && item.spot) add({ item, action: item.action, x: item.spot.x, y: item.spot.y })
  }
  // An object's button sits where its shop thumbnail points (its focus): on the object.
  for (const item of decor) {
    if (item.action) add({ item, action: item.action, x: item.focus?.x ?? 0.5, y: item.focus?.y ?? 0.5 })
  }
  const spots = [...byAction.values()]
  const essential = ESSENTIAL_ACTION[scene]
  if (essential && !spots.some((s) => s.action === essential)) {
    const lender = campItems(scene).find((item) => isFreeFromStart(item) && item.action === essential)!
    spots.push({ item: lender, action: lender.action!, x: lender.spot!.x, y: lender.spot!.y })
  }
  return spots
}

export function isCampItemUsed(state: GameState, item: CampItem): boolean {
  const shown = campScene(state, item.scene)
  return shown.background.id === item.id || shown.picture.id === item.id || shown.cabin?.id === item.id || shown.decor.some((d) => d.id === item.id)
}

export function buyCampItem(
  state: GameState,
  itemId: string,
  confirmed: { price: number; currency: Currency },
): { ok: true; state: GameState } | { ok: false; error: CampBuyError } {
  const item = getCampItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  if (ownsCampItem(state, item)) return { ok: false, error: 'already-owned' }
  if (item.exclusive) return { ok: false, error: 'not-for-sale' }
  if (item.kind === 'upgrade' && !ownsBase(state, item)) return { ok: false, error: 'needs-base' }
  if (missingRequired(state, item).length) return { ok: false, error: 'needs-piece' }
  if (getLevel(state.athlete.xp) < item.level) return { ok: false, error: 'level-locked' }
  if (item.price !== confirmed.price || item.currency !== confirmed.currency) return { ok: false, error: 'price-changed' }
  const camp = campOf(state)
  const next: GameState = { ...state, camp: { ...camp, owned: [...camp.owned, item.id], using: [...camp.using] } }
  if (item.currency === 'coins') {
    if (item.price > state.coins) return { ok: false, error: 'insufficient-coins' }
    next.coins = state.coins - item.price
  } else {
    if (item.price > premiumOf(state)) return { ok: false, error: 'insufficient-premium' }
    next.premiumCoins = premiumOf(state) - item.price
  }
  return { ok: true, state: next }
}

/** The pieces an item requires that the player does not own (empty: it can be bought). */
export function missingRequired(state: CampHolder, item: CampItem): CampItem[] {
  return (item.requires ?? []).map((id) => getCampItem(id)).filter((other): other is CampItem => !!other && !ownsCampItem(state, other))
}

/** Same family (an evolution of the same thing) in the same scene: only one object in use. */
// A background in a family is its first level: it stays under the objects (one background per scene anyway).
const sameFamily = (a: CampItem, b: CampItem) => !!a.family && a.family === b.family && a.scene === b.scene && a.kind !== 'background' && b.kind !== 'background'

function ownsBase(state: GameState, upgrade: CampItem): boolean {
  const base = getCampItem(upgrade.base ?? '')
  return !!base && ownsCampItem(state, base)
}

/**
 * Puts an owned piece in its scene or takes it out. A background or cabin replaces the one in use
 * in the same scene; the background cannot be taken out (another one replaces it). Decor is put in
 * or taken out on its own: any number at once. A free piece taken out stays out until put back.
 */
export function setCampItemUsed(state: GameState, itemId: string, used: boolean): { ok: true; state: GameState } | { ok: false; error: CampUseError } {
  const item = getCampItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  if (!ownsCampItem(state, item)) return { ok: false, error: 'not-owned' }
  const camp = campOf(state)
  let off = (camp.off ?? []).filter((id) => id !== item.id)
  if (!used && isFreeFromStart(item) && item.kind !== 'background' && item.kind !== 'decor') off = [...off, item.id]
  const finish = (next: CampState) => {
    const result: CampState = { owned: [...next.owned], using: [...next.using] }
    if (off.length) result.off = off
    return { ok: true as const, state: { ...state, camp: result } }
  }

  if (item.kind === 'decor') {
    // Another level of the same family makes room.
    const using = camp.using.filter((id) => {
      const other = getCampItem(id)
      return id !== item.id && !(used && other && sameFamily(other, item))
    })
    if (used) using.push(item.id)
    return finish({ ...camp, using })
  }

  // An upgrade replaces the background's other upgrade and brings its background into the scene.
  if (item.kind === 'upgrade') {
    if (used && !ownsBase(state, item)) return { ok: false, error: 'needs-base' }
    const base = getCampItem(item.base!)!
    const using = camp.using.filter((id) => {
      const other = getCampItem(id)
      return (
        id !== item.id &&
        !(used && other && ((other.kind === 'upgrade' && other.base === item.base) || (other.kind === 'background' && other.scene === base.scene) || sameFamily(other, item)))
      )
    })
    if (used) using.push(base.id, item.id)
    return finish({ ...camp, using })
  }
  const replaces = (id: string) => {
    const other = getCampItem(id)
    return !!other && other.scene === item.scene && other.kind === item.kind
  }
  const using = camp.using.filter((id) => id !== item.id && !(used && replaces(id)))
  if (used) using.push(item.id)
  return finish({ ...camp, using })
}

/**
 * Exchanges coins for Premium Coins (one way), at the rate the player saw. `amount`: Premium
 * Coins wanted (1 to MAX_EXCHANGE).
 */
export function exchangePremium(
  state: GameState,
  amount: number,
  confirmedRate: number,
): { ok: true; state: GameState } | { ok: false; error: ExchangeError } {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_EXCHANGE) return { ok: false, error: 'bad-amount' }
  if (confirmedRate !== COINS_PER_PREMIUM) return { ok: false, error: 'rate-changed' }
  const cost = amount * COINS_PER_PREMIUM
  if (cost > state.coins) return { ok: false, error: 'insufficient-coins' }
  return { ok: true, state: { ...state, coins: state.coins - cost, premiumCoins: premiumOf(state) + amount } }
}

/**
 * A saved Base Camp, cleaned: pieces no longer in the catalog are dropped (the owner can remove
 * one), and at most one background and one cabin per scene stay in use. Null if it is not a Base
 * Camp at all.
 */
export function parseCampState(value: unknown): CampState | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.owned) || !Array.isArray(raw.using)) return null
  if (![...raw.owned, ...raw.using].every((id) => typeof id === 'string')) return null
  const owned = [...new Set(raw.owned as string[])].filter((id) => getCampItem(id) && !isFreeFromStart(getCampItem(id)!))
  const has = (id: string) => owned.includes(id) || isFreeFromStart(getCampItem(id)!)
  const using: string[] = []
  for (const id of raw.using as string[]) {
    const item = getCampItem(id)
    if (!item || !has(id) || using.includes(id)) continue
    // One background and one cabin per scene, one upgrade per background.
    const clash = (u: string) => {
      const other = getCampItem(u)!
      return item.kind === 'upgrade' ? other.kind === 'upgrade' && other.base === item.base : other.scene === item.scene && other.kind === item.kind
    }
    if ((item.kind !== 'decor' && using.some(clash)) || using.some((u) => sameFamily(getCampItem(u)!, item))) continue
    using.push(id)
  }
  // Saves from when decor stood in places ("scene:slot" → id): the objects placed stay in use.
  if (raw.slots !== undefined && typeof raw.slots === 'object' && raw.slots !== null) {
    for (const id of Object.values(raw.slots as Record<string, unknown>)) {
      const item = typeof id === 'string' ? getCampItem(id) : undefined
      if (item && item.kind === 'decor' && has(item.id) && !using.includes(item.id)) using.push(item.id)
    }
  }
  const off = Array.isArray(raw.off)
    ? [...new Set(raw.off.filter((id): id is string => typeof id === 'string' && !!getCampItem(id) && isFreeFromStart(getCampItem(id)!) && !['background', 'decor'].includes(getCampItem(id)!.kind)))]
    : []
  const parsed: CampState = { owned, using }
  if (off.length) parsed.off = off
  return parsed
}

/**
 * Gives the exclusive pieces (the admin's refuge) to a career, once: the server calls it for the
 * admins only. Nothing changes if they are already owned.
 */
export function withExclusivePieces(state: GameState): GameState {
  const camp = campOf(state)
  const missing = EXCLUSIVE_IDS.filter((id) => !camp.owned.includes(id))
  if (missing.length === 0) return state
  return { ...state, camp: { ...camp, owned: [...camp.owned, ...missing], using: [...camp.using] } }
}
