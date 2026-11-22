import { AD_MIN_SECONDS } from '../../game-engine/adReward'

/**
 * Rewarded-ad provider (brief B-6d, owner decision D11). One replaceable interface: the game asks
 * the provider to show an ad and claims the reward from the server only when the provider reports
 * the ad completed. Nothing is granted on the client.
 *
 * Today the game is closed to testers, so the provider is simulated: it "plays" an ad for the
 * minimum length the server checks. The real network (AdMob in the native app, owner decision D3)
 * replaces it later behind the same interface; it will also need the network's server-side
 * verification callback, so the server can check that the ad was really watched (see
 * src/game-engine/adReward.ts).
 */
export type AdShowResult =
  | { completed: true }
  /** No ad (none available, blocked or failed), no connection, or the player closed it early: no reward. */
  | { completed: false; reason: 'unavailable' | 'offline' | 'closed' }

export interface RewardedAdProvider {
  show(): Promise<AdShowResult>
}

/** The simulated provider: completes after `durationMs` (the server's minimum by default) when online. */
export function simulatedAdProvider(durationMs = AD_MIN_SECONDS * 1000 + 300, wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))): RewardedAdProvider {
  return {
    async show() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { completed: false, reason: 'offline' }
      await wait(durationMs)
      return { completed: true }
    },
  }
}
