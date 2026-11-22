import { csvInt, csvNumber, parseCsv } from '../../data/csv'
import economyCsv from '../../data/economy.csv?raw'

/**
 * Premium Coins (owner decision, 16 November 2026): a second currency for Base Camp pieces. For
 * now they only come from exchanging coins, one way, at the table's rate; buying them with real
 * money comes later.
 */
export function parseEconomy(text: string): { coinsPerPremium: number; wearSpeed: number } {
  const values = new Map(parseCsv(text).map((row) => [row.key, row.value]))
  const coinsPerPremium = csvInt(values.get('coins_per_premium'), 'economy.csv coins_per_premium')
  if (coinsPerPremium < 1) throw new Error('economy.csv: coins_per_premium must be 1 or more')
  // Equipment wear (owner decision, 22 November 2026): missing = 0, wear off.
  const wearSpeed = csvNumber(values.get('wear_speed'), 'economy.csv wear_speed', 0)
  if (!(wearSpeed >= 0)) throw new Error('economy.csv: wear_speed must be 0 or more')
  return { coinsPerPremium, wearSpeed }
}

const ECONOMY = parseEconomy(economyCsv)
export const COINS_PER_PREMIUM = ECONOMY.coinsPerPremium
/** Multiplies the wear of every item with a life (equipment.csv life_km); 0 = wear off. */
export const WEAR_SPEED = ECONOMY.wearSpeed

/** Most Premium Coins one exchange gives. */
export const MAX_EXCHANGE = 1000
