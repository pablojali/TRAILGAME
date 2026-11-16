import { getLevel } from '../domain/athlete/levels'
import { campItems, defaultBackground, ESSENTIAL_ACTION, EXCLUSIVE_IDS, getCampItem, isFreeFromStart, type CampAction, type CampItem, type CampScene, type Currency } from '../domain/basecamp/catalog'
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

export type CampUseError = 'unknown-item' | 'not-owned'

export type ExchangeError = 'bad-amount' | 'rate-changed' | 'insufficient-coins'

const EMPTY: CampState = { owned: [], using: [] }

export function campOf(state: GameState): CampState {
  return state.camp ?? EMPTY
}

export function premiumOf(state: GameState): number {
  return state.premiumCoins ?? 0
}

export function ownsCampItem(state: GameState, item: CampItem): boolean {
  return isFreeFromStart(item) || campOf(state).owned.includes(item.id)
}

/**
 * What the scene shows: the background and cabin in use (else the free ones), and the decor in
 * use plus the free decor not taken out.
 */
export function campScene(state: GameState, scene: CampScene): { background: CampItem; cabin: CampItem | null; decor: CampItem[] } {
  const camp = campOf(state)
  const using = new Set(camp.using)
  const off = new Set(camp.off ?? [])
  const items = campItems(scene)
  const shown = (item: CampItem) => (using.has(item.id) && ownsCampItem(state, item)) || (isFreeFromStart(item) && !off.has(item.id))
  const pick = (kind: 'background' | 'cabin') => {
    const all = items.filter((item) => item.kind === kind)
    return all.find((item) => using.has(item.id) && ownsCampItem(state, item)) ?? all.find((item) => isFreeFromStart(item) && !off.has(item.id)) ?? null
  }
  return {
    background: pick('background') ?? defaultBackground(scene),
    cabin: pick('cabin'),
    decor: items.filter((item) => item.kind === 'decor' && shown(item)),
  }
}

export interface CampSpot {
  item: CampItem
  action: CampAction
  x: number
  y: number
}

/**
 * The buttons of the scene: every shown piece with an action. The scene's essential action (the
 * door outside, the gear inside) is always there: if the shown pieces lack it, the free piece that
 * has it lends its spot.
 */
export function campSpots(state: GameState, scene: CampScene): CampSpot[] {
  const { background, cabin, decor } = campScene(state, scene)
  // One button per action: a piece drawn later (a cabin over its background) moves it.
  const byAction = new Map<CampAction, CampSpot>()
  for (const item of [background, cabin, ...decor]) {
    if (item?.action && item.spot) {
      byAction.delete(item.action)
      byAction.set(item.action, { item, action: item.action, x: item.spot.x, y: item.spot.y })
    }
  }
  const spots = [...byAction.values()]
  if (!spots.some((s) => s.action === ESSENTIAL_ACTION[scene])) {
    const lender = campItems(scene).find((item) => isFreeFromStart(item) && item.action === ESSENTIAL_ACTION[scene])!
    spots.push({ item: lender, action: lender.action!, x: lender.spot!.x, y: lender.spot!.y })
  }
  return spots
}

export function isCampItemUsed(state: GameState, item: CampItem): boolean {
  const shown = campScene(state, item.scene)
  return shown.background.id === item.id || shown.cabin?.id === item.id || shown.decor.some((d) => d.id === item.id)
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
  if (getLevel(state.athlete.xp) < item.level) return { ok: false, error: 'level-locked' }
  if (item.price !== confirmed.price || item.currency !== confirmed.currency) return { ok: false, error: 'price-changed' }
  const camp = campOf(state)
  const next: GameState = { ...state, camp: { owned: [...camp.owned, item.id], using: [...camp.using] } }
  if (item.currency === 'coins') {
    if (item.price > state.coins) return { ok: false, error: 'insufficient-coins' }
    next.coins = state.coins - item.price
  } else {
    if (item.price > premiumOf(state)) return { ok: false, error: 'insufficient-premium' }
    next.premiumCoins = premiumOf(state) - item.price
  }
  return { ok: true, state: next }
}

/**
 * Puts an owned piece in its scene or takes it out. A background or cabin replaces the one in use
 * in the same scene. A free piece taken out stays out until put back; the background cannot be
 * taken out (another one replaces it).
 */
export function setCampItemUsed(state: GameState, itemId: string, used: boolean): { ok: true; state: GameState } | { ok: false; error: CampUseError } {
  const item = getCampItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  if (!ownsCampItem(state, item)) return { ok: false, error: 'not-owned' }
  const camp = campOf(state)
  const replaces = (id: string) => {
    const other = getCampItem(id)
    return item.kind !== 'decor' && !!other && other.scene === item.scene && other.kind === item.kind
  }
  const using = camp.using.filter((id) => id !== item.id && !(used && replaces(id)))
  let off = (camp.off ?? []).filter((id) => id !== item.id)
  if (used) {
    using.push(item.id)
  } else if (isFreeFromStart(item) && item.kind !== 'background') {
    off = [...off, item.id]
  }
  const next: CampState = { owned: [...camp.owned], using }
  if (off.length) next.off = off
  return { ok: true, state: { ...state, camp: next } }
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
    if (item.kind !== 'decor' && using.some((u) => getCampItem(u)!.scene === item.scene && getCampItem(u)!.kind === item.kind)) continue
    using.push(id)
  }
  const off = Array.isArray(raw.off)
    ? [...new Set(raw.off.filter((id): id is string => typeof id === 'string' && !!getCampItem(id) && isFreeFromStart(getCampItem(id)!) && getCampItem(id)!.kind !== 'background'))]
    : []
  return off.length ? { owned, using, off } : { owned, using }
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
