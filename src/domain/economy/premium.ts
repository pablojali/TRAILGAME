import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import economyCsv from '../../data/economy.csv?raw'

/**
 * Premium Coins (owner decision, 16 November 2026): a second currency for Base Camp pieces. For
 * now they only come from exchanging coins, one way, at the table's rate; buying them with real
 * money comes later.
 */
export interface Economy {
  coinsPerPremium: number
  wearSpeed: number
  /** Rewarded ads (owner decision D11): the coins one gives, and how many give coins per real day. */
  adRewardCoins: number
  adRewardsPerDay: number
}

export function parseEconomy(text: string): Economy {
  const values = new Map(parseCsv(text).map((row) => [row.key, row.value]))
  const coinsPerPremium = csvInt(values.get('coins_per_premium'), 'economy.csv coins_per_premium')
  if (coinsPerPremium < 1) throw new Error('economy.csv: coins_per_premium must be 1 or more')
  // Equipment wear (owner decision, 22 November 2026): missing = 0, wear off.
  const wearSpeed = csvNumber(values.get('wear_speed'), 'economy.csv wear_speed', 0)
  if (!(wearSpeed >= 0)) throw new Error('economy.csv: wear_speed must be 0 or more')
  // Rewarded ads (owner decision D11, 22 November 2026): missing = 20 coins, 2 a day.
  const adRewardCoins = values.has('ad_reward_coins') ? csvInt(values.get('ad_reward_coins'), 'economy.csv ad_reward_coins') : 20
  const adRewardsPerDay = values.has('ad_rewards_per_day') ? csvInt(values.get('ad_rewards_per_day'), 'economy.csv ad_rewards_per_day') : 2
  if (adRewardCoins < 0 || adRewardsPerDay < 0) throw new Error('economy.csv: ad_reward_coins and ad_rewards_per_day must be 0 or more')
  return { coinsPerPremium, wearSpeed, adRewardCoins, adRewardsPerDay }
}

const ECONOMY = parseEconomy(economyCsv)
export const COINS_PER_PREMIUM = ECONOMY.coinsPerPremium
/** Multiplies the wear of every item with a life (equipment.csv life_km); 0 = wear off. */
export const WEAR_SPEED = ECONOMY.wearSpeed

/** Coins a rewarded ad gives (economy.csv ad_reward_coins). */
export const AD_REWARD_COINS = ECONOMY.adRewardCoins
/** Most coin-granting rewarded ads per real (UTC) day (economy.csv ad_rewards_per_day). */
export const AD_REWARDS_PER_DAY = ECONOMY.adRewardsPerDay

/** Most Premium Coins one exchange gives. */
export const MAX_EXCHANGE = 1000
