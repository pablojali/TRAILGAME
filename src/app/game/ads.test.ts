import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulatedAdProvider } from './ads'

/** The simulated rewarded-ad provider (B-6d): completes after its length, gives nothing offline. */
describe('simulated rewarded-ad provider', () => {
  afterEach(() => vi.restoreAllMocks())

  it('completes after the ad has played', async () => {
    const waited: number[] = []
    const provider = simulatedAdProvider(5300, async (ms) => void waited.push(ms))
    expect(await provider.show()).toEqual({ completed: true })
    expect(waited).toEqual([5300])
  })

  it('shows no ad offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await simulatedAdProvider(1, async () => {}).show()).toEqual({ completed: false, reason: 'offline' })
  })
})
