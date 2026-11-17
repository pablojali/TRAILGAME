import { getLevel } from '../domain/athlete/levels'
import { campItems, defaultBackground, ESSENTIAL_ACTION, EXCLUSIVE_IDS, getCampItem, isFreeFromStart, MAX_SLOTS, type CampAction, type CampItem, type CampScene, type CampSlot, type Currency } from '../domain/basecamp/catalog'
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

/**
 * `no-slot`: the background has no free place for the object; `bad-slot`: not one of its places;
 * `needs-base`: an upgrade of a background the player does not have.
 */
export type CampUseError = 'unknown-item' | 'not-owned' | 'no-slot' | 'bad-slot' | 'needs-base'

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

/** Decor standing in a slot of the background shown. */
export interface PlacedDecor {
  item: CampItem
  /** 1 to 4. */
  slot: number
  at: CampSlot
}

const slotKey = (scene: CampScene, slot: number) => `${scene}:${slot}`

/**
 * Where each decor object stands in the scene: the slots the player chose, then the free decor
 * (not taken out) in the empty slots, in the table's order. Only the background's slots show.
 */
export function campPlacements(state: GameState, scene: CampScene, background: CampItem): PlacedDecor[] {
  const camp = campOf(state)
  const slots = background.slots ?? []
  const taken = new Map<number, CampItem>()
  const placed = new Set<string>()
  for (let n = 1; n <= MAX_SLOTS; n++) {
    const item = getCampItem(camp.slots?.[slotKey(scene, n)] ?? '')
    if (item && item.scene === scene && item.kind === 'decor' && ownsCampItem(state, item)) {
      placed.add(item.id)
      if (n <= slots.length) taken.set(n, item)
    }
  }
  const off = new Set(camp.off ?? [])
  for (const item of campItems(scene, 'decor')) {
    if (!isFreeFromStart(item) || off.has(item.id) || placed.has(item.id)) continue
    const empty = slots.findIndex((_, i) => !taken.has(i + 1))
    if (empty === -1) break
    taken.set(empty + 1, item)
  }
  return [...taken.entries()].sort(([a], [b]) => a - b).map(([slot, item]) => ({ item, slot, at: slots[slot - 1]! }))
}

/**
 * What the scene shows: the background and cabin in use (else the free ones), and the decor in
 * its slots. `picture` is the background's upgrade the player chose, else the background itself:
 * it is what is drawn, while the background keeps the button and slots.
 */
export function campScene(
  state: GameState,
  scene: CampScene,
): { background: CampItem; picture: CampItem; cabin: CampItem | null; decor: CampItem[]; placed: PlacedDecor[] } {
  const camp = campOf(state)
  const using = new Set(camp.using)
  const off = new Set(camp.off ?? [])
  const items = campItems(scene)
  const pick = (kind: 'background' | 'cabin') => {
    const all = items.filter((item) => item.kind === kind)
    return all.find((item) => using.has(item.id) && ownsCampItem(state, item)) ?? all.find((item) => isFreeFromStart(item) && !off.has(item.id)) ?? null
  }
  const background = pick('background') ?? defaultBackground(scene)
  const placed = campPlacements(state, scene, background)
  const picture = items.find((item) => item.kind === 'upgrade' && item.base === background.id && using.has(item.id) && ownsCampItem(state, item)) ?? background
  return { background, picture, cabin: pick('cabin'), decor: placed.map((p) => p.item), placed }
}

/** The slot an object stands in, in the background shown (null: not placed). */
export function campSlotOf(state: GameState, item: CampItem): number | null {
  return campScene(state, item.scene).placed.find((p) => p.item.id === item.id)?.slot ?? null
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
export function campSpots(state: GameState, scene: CampScene): CampSpot[] {
  const { background, cabin, placed } = campScene(state, scene)
  // One button per action: a piece drawn later (a cabin over its background) moves it.
  const byAction = new Map<CampAction, CampSpot>()
  const add = (spot: CampSpot) => {
    byAction.delete(spot.action)
    byAction.set(spot.action, spot)
  }
  for (const item of [background, cabin]) {
    if (item?.action && item.spot) add({ item, action: item.action, x: item.spot.x, y: item.spot.y })
  }
  // An object's button sits on the object, halfway up.
  for (const { item, at } of placed) {
    if (item.action) add({ item, action: item.action, x: at.x, y: at.y - ((item.size ?? 0.2) * at.scale) / 2 })
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

function ownsBase(state: GameState, upgrade: CampItem): boolean {
  const base = getCampItem(upgrade.base ?? '')
  return !!base && ownsCampItem(state, base)
}

/**
 * Puts an owned piece in its scene or takes it out. A background or cabin replaces the one in use
 * in the same scene; the background cannot be taken out (another one replaces it). Decor goes to
 * a slot of the background shown: `slot` (1 to 4), else the first empty one; the object already
 * there makes room. A free piece taken out stays out until put back.
 */
export function setCampItemUsed(
  state: GameState,
  itemId: string,
  used: boolean,
  slot?: number,
): { ok: true; state: GameState } | { ok: false; error: CampUseError } {
  const item = getCampItem(itemId)
  if (!item) return { ok: false, error: 'unknown-item' }
  if (!ownsCampItem(state, item)) return { ok: false, error: 'not-owned' }
  const camp = campOf(state)
  let off = (camp.off ?? []).filter((id) => id !== item.id)
  if (!used && isFreeFromStart(item) && item.kind !== 'background') off = [...off, item.id]
  const finish = (next: CampState) => {
    const result: CampState = { owned: [...next.owned], using: [...next.using] }
    if (off.length) result.off = off
    if (next.slots && Object.keys(next.slots).length) result.slots = { ...next.slots }
    return { ok: true as const, state: { ...state, camp: result } }
  }

  if (item.kind === 'decor') {
    const slots = Object.fromEntries(Object.entries(camp.slots ?? {}).filter(([, id]) => id !== item.id))
    if (!used) return finish({ ...camp, slots })
    const shown = campScene(state, item.scene)
    const count = shown.background.slots?.length ?? 0
    let target = slot
    if (target === undefined) {
      const busy = new Set(shown.placed.filter((p) => p.item.id !== item.id).map((p) => p.slot))
      target = Array.from({ length: count }, (_, i) => i + 1).find((n) => !busy.has(n))
      if (target === undefined) return { ok: false, error: 'no-slot' }
    }
    if (!Number.isInteger(target) || target < 1 || target > count) return { ok: false, error: 'bad-slot' }
    slots[slotKey(item.scene, target)] = item.id
    return finish({ ...camp, slots })
  }

  // An upgrade replaces the background's other upgrade and brings its background into the scene.
  if (item.kind === 'upgrade') {
    if (used && !ownsBase(state, item)) return { ok: false, error: 'needs-base' }
    const base = getCampItem(item.base!)!
    const using = camp.using.filter((id) => {
      const other = getCampItem(id)
      return id !== item.id && !(used && other && ((other.kind === 'upgrade' && other.base === item.base) || (other.kind === 'background' && other.scene === base.scene)))
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
    if (item.kind !== 'decor' && using.some(clash)) continue
    using.push(id)
  }
  const slots: Record<string, string> = {}
  if (raw.slots !== undefined && typeof raw.slots === 'object' && raw.slots !== null) {
    for (const [key, id] of Object.entries(raw.slots as Record<string, unknown>)) {
      const match = /^(exterior|interior):([1-4])$/.exec(key)
      const item = typeof id === 'string' ? getCampItem(id) : undefined
      if (!match || !item || item.kind !== 'decor' || item.scene !== match[1] || Object.values(slots).includes(item.id)) continue
      if (!owned.includes(item.id) && !isFreeFromStart(item)) continue
      slots[key] = item.id
    }
  }
  const off = Array.isArray(raw.off)
    ? [...new Set(raw.off.filter((id): id is string => typeof id === 'string' && !!getCampItem(id) && isFreeFromStart(getCampItem(id)!) && getCampItem(id)!.kind !== 'background'))]
    : []
  const parsed: CampState = { owned, using }
  if (off.length) parsed.off = off
  if (Object.keys(slots).length) parsed.slots = slots
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
