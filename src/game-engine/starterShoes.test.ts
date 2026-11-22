import { describe, expect, it } from 'vitest'
import { WEAR, type WearConfig } from '../domain/equipment/wear'
import { newGame } from '../test/gameFixtures'
import { buyItem } from './equipment'
import type { GameState } from './gameState'
import { cheapestShoesPrice } from './wear'

/**
 * Starter shoes at 20 coins (brief B-6c, owner decision D8 of 22 November 2026). The free emergency
 * pair was dropped (owner decision D11): a runner stuck with no shoes and no money watches a rewarded
 * ad instead (B-6d).
 */
const ON: WearConfig = { ...WEAR, speed: 1 }

function runner(used: number, coins: number): GameState {
  return { ...newGame(), ownedEquipment: ['starter-shoes'], equipment: ['starter-shoes'], wear: { 'starter-shoes': used }, coins }
}

describe('starter shoes at 20 coins', () => {
  it('are the cheapest pair, cost 20 to replace when worn, and are still "already owned" when not', () => {
    expect(cheapestShoesPrice()).toBe(20)
    const replaced = buyItem(runner(0.5, 30), 'starter-shoes', 20, ON)
    expect(replaced.ok && replaced.state.coins).toBe(10)
    expect(buyItem(runner(0.5, 10), 'starter-shoes', 20, ON)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(buyItem(runner(0, 30), 'starter-shoes', 20, ON)).toEqual({ ok: false, error: 'already-owned' })
    // Wear off: as before, owned items are not bought again.
    expect(buyItem(runner(0.5, 30), 'starter-shoes', 20)).toEqual({ ok: false, error: 'already-owned' })
  })
})
