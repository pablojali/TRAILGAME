/**
 * Coins (Game Design Bible §9, §10). Whole, never negative. The only change in M4.1 is paying race
 * entry fees; there are no other sources or costs yet.
 */

/**
 * Balance of a new career, and of careers saved before coins existed (owner decision,
 * 29 October 2026: 25; was 0). Existing balances are not changed.
 */
export const STARTING_COINS = 25

export function formatCoins(amount: number): string {
  return `${amount.toLocaleString('en-US')} ${amount === 1 ? 'coin' : 'coins'}`
}
