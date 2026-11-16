import { csvInt, parseCsv } from '../../data/csv'
import economyCsv from '../../data/economy.csv?raw'

/**
 * Premium Coins (owner decision, 16 November 2026): a second currency for Base Camp pieces. For
 * now they only come from exchanging coins, one way, at the table's rate; buying them with real
 * money comes later.
 */
export function parseEconomy(text: string): { coinsPerPremium: number } {
  const values = new Map(parseCsv(text).map((row) => [row.key, row.value]))
  const coinsPerPremium = csvInt(values.get('coins_per_premium'), 'economy.csv coins_per_premium')
  if (coinsPerPremium < 1) throw new Error('economy.csv: coins_per_premium must be 1 or more')
  return { coinsPerPremium }
}

export const COINS_PER_PREMIUM = parseEconomy(economyCsv).coinsPerPremium

/** Most Premium Coins one exchange gives. */
export const MAX_EXCHANGE = 1000
