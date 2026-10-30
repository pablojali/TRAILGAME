import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { newGame, withAthlete } from '../test/gameFixtures'
import { SaveError, type GameRepository } from './gameRepository'
import { createSaveQueue } from './saveQueue'

/** A repository whose writes finish only when the test says so, recording what happens. */
function slowRepository() {
  const log: string[] = []
  const pending: { resolve(): void; reject(error: unknown): void }[] = []
  let active = 0
  let maxActive = 0
  let stored: GameState | null = null
  const repo: GameRepository = {
    load: async () => stored,
    save: (state) =>
      new Promise<void>((resolve, reject) => {
        active++
        maxActive = Math.max(maxActive, active)
        log.push(`save xp=${state.athlete.xp}`)
        pending.push({
          resolve: () => {
            active--
            stored = state
            resolve()
          },
          reject: (error) => {
            active--
            reject(error)
          },
        })
      }),
    clear: async () => {
      log.push('clear')
      stored = null
    },
  }
  return {
    repo,
    log,
    stored: () => stored,
    maxActive: () => maxActive,
    /** Finishes the oldest write in progress, then lets the queue move on. */
    async finish(ok = true) {
      const next = pending.shift()!
      if (ok) next.resolve()
      else next.reject(new SaveError())
      await flush()
    },
  }
}

/** Lets queued promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const withXp = (xp: number) => withAthlete(newGame(), { xp })

describe('save queue', () => {
  it('writes one state at a time and only the latest of several rapid changes', async () => {
    const store = slowRepository()
    const queue = createSaveQueue(store.repo, () => {})
    queue.save(withXp(1))
    await flush()
    // While the first write is in progress, three more changes arrive.
    queue.save(withXp(2))
    queue.save(withXp(3))
    queue.save(withXp(4))
    await store.finish()
    await store.finish()
    await queue.idle()
    expect(store.log).toEqual(['save xp=1', 'save xp=4'])
    expect(store.maxActive()).toBe(1)
    expect(store.stored()!.athlete.xp).toBe(4)
  })

  it('never lets an older write finish after a newer one', async () => {
    const store = slowRepository()
    const queue = createSaveQueue(store.repo, () => {})
    for (let xp = 1; xp <= 20; xp++) {
      queue.save(withXp(xp))
      await flush()
      if (xp % 3 === 0) await store.finish()
    }
    while (store.log.length > 0 && store.stored()?.athlete.xp !== 20) await store.finish()
    await queue.idle()
    expect(store.stored()!.athlete.xp).toBe(20)
    const written = store.log.map((line) => Number(line.split('=')[1]))
    expect(written).toEqual([...written].sort((a, b) => a - b))
  })

  it('keeps the latest state after a failed save and stores it on retry', async () => {
    const store = slowRepository()
    const results: boolean[] = []
    const queue = createSaveQueue(store.repo, (ok) => results.push(ok), 60_000)
    queue.save(withXp(5))
    await flush()
    await store.finish(false)
    expect(results).toEqual([false])
    expect(store.stored()).toBeNull()

    queue.retry()
    await flush()
    await store.finish()
    await queue.idle()
    expect(results).toEqual([false, true])
    expect(store.stored()!.athlete.xp).toBe(5)
  })

  it('retries a failed save by itself after a delay', async () => {
    vi.useFakeTimers()
    try {
      let attempts = 0
      const repo: GameRepository = {
        load: async () => null,
        save: async () => {
          attempts++
          if (attempts === 1) throw new SaveError()
        },
        clear: async () => {},
      }
      const results: boolean[] = []
      const queue = createSaveQueue(repo, (ok) => results.push(ok), 1_000)
      queue.save(withXp(1))
      await vi.advanceTimersByTimeAsync(0)
      expect(results).toEqual([false])
      await vi.advanceTimersByTimeAsync(1_000)
      expect(results).toEqual([false, true])
      expect(attempts).toBe(2)
      queue.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a newer change after a failure is the one written', async () => {
    const store = slowRepository()
    const queue = createSaveQueue(store.repo, () => {}, 60_000)
    queue.save(withXp(1))
    await flush()
    await store.finish(false)
    queue.save(withXp(2))
    await flush()
    await store.finish()
    await queue.idle()
    expect(store.log).toEqual(['save xp=1', 'save xp=2'])
    expect(store.stored()!.athlete.xp).toBe(2)
  })

  it('clears after the write in progress, so an older save cannot bring a reset career back', async () => {
    const store = slowRepository()
    const queue = createSaveQueue(store.repo, () => {})
    queue.save(withXp(1))
    await flush()
    queue.save(withXp(2))
    const cleared = queue.clear()
    // A new career started right after the reset is written after the clear.
    queue.save(withXp(0))
    await store.finish()
    await cleared
    await flush()
    await store.finish()
    await queue.idle()
    expect(store.log).toEqual(['save xp=1', 'clear', 'save xp=0'])
    expect(store.stored()!.athlete.xp).toBe(0)
  })
})
