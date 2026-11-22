import { getEquipmentItem } from '../domain/equipment/items'
import { durabilityPct, WEAR, wearOn, wearStatus, type WearConfig } from '../domain/equipment/wear'
import { AD_REWARD_COINS, AD_REWARDS_PER_DAY } from '../domain/economy/premium'
import type { GameState } from './gameState'
import { cheapestShoesPrice, usedOf } from './wear'

/**
 * Rewarded ad for coins (brief B-6d, owner decision D11 of 22 November 2026). A runner who cannot
 * race (no pair above 0 %) and cannot afford the cheapest shoes can watch an ad for coins
 * (economy.csv ad_reward_coins), at most ad_rewards_per_day coin-granting ads per real UTC day; more
 * ads can be watched but give nothing. Everything is decided by the server: it starts the ad (an id
 * kept in the career) and only rewards a claim for that id once the ad's minimum length has passed.
 *
 * The simulated provider (src/app/game/ads.ts) stands in for the real network. With the real network
 * (AdMob, D3) the claim must also be verified server-side with the network's own completion callback
 * (server-side verification): an id and a time alone can be forged by a client that skips the ad.
 */

/** Seconds a (simulated) rewarded ad lasts; a claim before then is refused. */
export const AD_MIN_SECONDS = 5

export interface AdRules {
  coins: number
  perDay: number
}

export const AD_RULES: AdRules = { coins: AD_REWARD_COINS, perDay: AD_REWARDS_PER_DAY }

/** The real (UTC) day of a server time, e.g. "2026-11-22". */
export function adDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** True when the runner owns shoes that can start a race: above 0 %, or shoes that never wear. */
export function canRaceWithOwnedShoes(state: GameState, config: WearConfig = WEAR): boolean {
  return state.ownedEquipment.some((id) => {
    if (getEquipmentItem(id)?.slot !== 'shoes') return false
    const status = wearStatus(id, usedOf(state, id), config)
    return status === null || durabilityPct(usedOf(state, id)) > 0
  })
}

/** Whether the ad offer applies: wear on, no pair that can race, and too few coins for the cheapest pair. */
export function isStuckWithoutShoes(state: GameState, config: WearConfig = WEAR): boolean {
  return wearOn(config) && !canRaceWithOwnedShoes(state, config) && state.coins < cheapestShoesPrice()
}

/** Coin-granting ads already given on the UTC day of `now`. */
export function adRewardsToday(state: GameState, now: number): number {
  return state.ads?.day === adDay(now) ? (state.ads.rewarded ?? 0) : 0
}

/** Coin-granting ads left on the UTC day of `now` (the screen says when an ad will give nothing). */
export function adRewardsLeft(state: GameState, now: number, rules: AdRules = AD_RULES): number {
  return Math.max(0, rules.perDay - adRewardsToday(state, now))
}

export type AdError =
  /** Wear is off: there are no rewarded ads. */
  | 'ads-off'
  /** The claim is for no ad this server started (a forged or repeated claim). */
  | 'no-ad'
  /** The ad has not lasted its minimum length yet. */
  | 'ad-not-completed'

/** Starts an ad: the server keeps its id and when it started. */
export function startAd(state: GameState, adId: string, now: number, config: WearConfig = WEAR): { ok: true; state: GameState } | { ok: false; error: AdError } {
  if (!wearOn(config)) return { ok: false, error: 'ads-off' }
  return { ok: true, state: { ...state, ads: { ...state.ads, pending: { id: adId, startedAt: now } } } }
}

export type AdOutcome = { granted: true; coins: number } | { granted: false; reason: 'daily-limit' | 'not-eligible' }

/**
 * Claims the reward of a completed ad. The ad is used up whatever the outcome. Coins only when the
 * runner is stuck without shoes and under today's limit.
 */
export function claimAd(
  state: GameState,
  adId: string,
  now: number,
  config: WearConfig = WEAR,
  rules: AdRules = AD_RULES,
): { ok: true; state: GameState; outcome: AdOutcome } | { ok: false; error: AdError } {
  if (!wearOn(config)) return { ok: false, error: 'ads-off' }
  const pending = state.ads?.pending
  if (!pending || pending.id !== adId) return { ok: false, error: 'no-ad' }
  if (now - pending.startedAt < AD_MIN_SECONDS * 1000) return { ok: false, error: 'ad-not-completed' }
  const day = adDay(now)
  const today = adRewardsToday(state, now)
  const used: GameState = { ...state, ads: { day, rewarded: today } }
  if (!isStuckWithoutShoes(state, config)) return { ok: true, state: used, outcome: { granted: false, reason: 'not-eligible' } }
  if (today >= rules.perDay) return { ok: true, state: used, outcome: { granted: false, reason: 'daily-limit' } }
  return {
    ok: true,
    state: { ...used, coins: state.coins + rules.coins, ads: { day, rewarded: today + 1 } },
    outcome: { granted: true, coins: rules.coins },
  }
}
