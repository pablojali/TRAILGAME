import { describe, expect, it } from 'vitest'
import { WEAR, type WearConfig } from '../domain/equipment/wear'
import { parseEconomy } from '../domain/economy/premium'
import { parseSave, SCHEMA_VERSION } from '../repositories/gameRepository'
import { newGame, T0 } from '../test/gameFixtures'
import { AD_MIN_SECONDS, AD_RULES, adRewardsLeft, claimAd, isStuckWithoutShoes, startAd } from './adReward'
import type { GameState } from './gameState'

/**
 * Rewarded ad for coins (brief B-6d, owner decision D11 of 22 November 2026). Test table: starter
 * shoes 150 km, 20 coins (the cheapest pair); trail shoes 300 km.
 */
const ON: WearConfig = { ...WEAR, speed: 1 }
const DAY = 24 * 3_600_000
const AD = '11111111-1111-4111-8111-111111111111'
const serializeSave = (state: GameState) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, state })

/** A runner whose only pair is worn out, with `coins`. */
function stuck(coins = 5, extra: Partial<GameState> = {}): GameState {
  return { ...newGame(), ownedEquipment: ['starter-shoes'], equipment: ['starter-shoes'], wear: { 'starter-shoes': 1 }, coins, ...extra }
}

/** Starts an ad at `now` and claims it once it has lasted its minimum. */
function watch(state: GameState, now = T0, id = AD) {
  const started = startAd(state, id, now, ON)
  if (!started.ok) throw new Error(started.error)
  const claimed = claimAd(started.state, id, now + AD_MIN_SECONDS * 1000, ON)
  if (!claimed.ok) throw new Error(claimed.error)
  return claimed
}

describe('rewarded ad: the economy values', () => {
  it('reads the reward and the daily limit from economy.csv (defaults 20 and 2)', () => {
    expect(AD_RULES).toEqual({ coins: 20, perDay: 2 })
    expect(parseEconomy('key,value\ncoins_per_premium,100\nad_reward_coins,30\nad_rewards_per_day,3\n')).toMatchObject({ adRewardCoins: 30, adRewardsPerDay: 3 })
    expect(parseEconomy('key,value\ncoins_per_premium,100\n')).toMatchObject({ adRewardCoins: 20, adRewardsPerDay: 2 })
  })
})

describe('rewarded ad: who gets coins', () => {
  it('gives 20 coins to a runner who cannot race and cannot afford the cheapest pair', () => {
    expect(isStuckWithoutShoes(stuck(), ON)).toBe(true)
    const claimed = watch(stuck(5))
    expect(claimed.outcome).toEqual({ granted: true, coins: 20 })
    expect(claimed.state.coins).toBe(25)
    expect(claimed.state.ads).toEqual({ day: '2026-01-01', rewarded: 1 })
  })

  it('gives nothing to a runner who can race or has 20 coins', () => {
    expect(watch(stuck(20)).outcome).toEqual({ granted: false, reason: 'not-eligible' })
    // A pair at 5 % can still start (it will not finish): not stuck.
    expect(watch(stuck(0, { wear: { 'starter-shoes': 0.95 } })).outcome).toEqual({ granted: false, reason: 'not-eligible' })
    // Another pair owned with life left.
    expect(watch(stuck(0, { ownedEquipment: ['starter-shoes', 'trail-shoes-basic'] })).outcome).toEqual({ granted: false, reason: 'not-eligible' })
  })

  it('gives coins twice per real day; the third ad gives nothing (daily-limit), and the next day resets', () => {
    const first = watch(stuck(0))
    const second = watch({ ...first.state, coins: 0 }, T0 + 60_000)
    expect(second.outcome).toEqual({ granted: true, coins: 20 })
    expect(adRewardsLeft(second.state, T0 + 60_000)).toBe(0)
    const third = watch({ ...second.state, coins: 0 }, T0 + 120_000)
    expect(third.outcome).toEqual({ granted: false, reason: 'daily-limit' })
    expect(third.state.coins).toBe(0)
    const tomorrow = watch({ ...third.state, coins: 0 }, T0 + DAY)
    expect(tomorrow.outcome).toEqual({ granted: true, coins: 20 })
    expect(adRewardsLeft(tomorrow.state, T0 + DAY)).toBe(1)
  })
})

describe('rewarded ad: the server trusts no client claim', () => {
  it('refuses a claim for an ad it did not start, a second claim of the same ad, and an ad cut short', () => {
    expect(claimAd(stuck(), AD, T0, ON)).toEqual({ ok: false, error: 'no-ad' })
    const once = watch(stuck())
    expect(claimAd(once.state, AD, T0 + 60_000, ON)).toEqual({ ok: false, error: 'no-ad' })
    const started = startAd(stuck(), AD, T0, ON)
    if (!started.ok) throw new Error(started.error)
    expect(claimAd(started.state, AD, T0 + 1000, ON)).toEqual({ ok: false, error: 'ad-not-completed' })
    expect(claimAd(started.state, '22222222-2222-4222-8222-222222222222', T0 + 10_000, ON)).toEqual({ ok: false, error: 'no-ad' })
  })

  it('has no ads with wear off, as before', () => {
    expect(startAd(stuck(), AD, T0)).toEqual({ ok: false, error: 'ads-off' })
    expect(isStuckWithoutShoes(stuck())).toBe(false)
  })
})

describe('rewarded ad: saves', () => {
  it('keeps the ad state; older saves load without it; bad values are refused', () => {
    const claimed = watch(stuck())
    const loaded = parseSave(serializeSave(claimed.state), T0)
    expect(loaded.status === 'loaded' && loaded.state.ads).toEqual({ day: '2026-01-01', rewarded: 1 })
    const old = parseSave(serializeSave(newGame()), T0)
    expect(old.status === 'loaded' && 'ads' in old.state).toBe(false)
    expect(parseSave(serializeSave({ ...newGame(), ads: { day: 'today' } }), T0).status).toBe('incompatible')
  })
})
