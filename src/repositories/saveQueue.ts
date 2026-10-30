import type { GameState } from '../game-engine/gameState'
import type { GameRepository } from './gameRepository'

/** Delay before a failed save is tried again, doubled after each failure up to the maximum. */
export const SAVE_RETRY_MS = 2_000
export const SAVE_RETRY_MAX_MS = 30_000

export interface SaveQueue {
  /** Queues the latest career to be stored. A newer state replaces one that is still waiting. */
  save(state: GameState): void
  /** Drops any waiting save, then removes the stored career once earlier writes have finished. */
  clear(): Promise<void>
  /** Resolves when every queued operation has finished (successfully or not). */
  idle(): Promise<void>
  /** Retries a failed save now, if one is waiting. */
  retry(): void
  /** Cancels a scheduled retry (when the game unmounts); a later change or `retry` saves again. */
  dispose(): void
}

/**
 * Serializes writes to the repository: one operation at a time, in the order requested, so an
 * older state never overwrites a newer one. Rapid changes are coalesced: only the latest waiting
 * state is written. After a failure the latest state is kept and retried (with a growing delay, on
 * the next change or on `retry`), never silently dropped.
 */
export function createSaveQueue(
  repository: GameRepository,
  onResult: (saved: boolean) => void,
  retryMs = SAVE_RETRY_MS,
): SaveQueue {
  let tail: Promise<void> = Promise.resolve()
  /** The newest state not yet stored, or null. */
  let latest: GameState | null = null
  let flushQueued = false
  /** Raised by `clear`: writes queued before it must not run after it was requested. */
  let generation = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = retryMs

  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = tail.then(task)
    tail = run.catch(() => {})
    return run
  }

  function cancelRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }

  function queueFlush() {
    if (flushQueued || latest === null) return
    flushQueued = true
    const queuedIn = generation
    void enqueue(() => flush(queuedIn))
  }

  async function flush(queuedIn: number) {
    // Queued before a clear: the state it would write was dropped by that clear.
    if (queuedIn !== generation) return
    flushQueued = false
    const state = latest
    if (state === null) return
    try {
      await repository.save(state)
      // A newer state queued while this one was being written stays queued.
      if (latest === state) latest = null
      retryDelay = retryMs
      onResult(true)
    } catch {
      onResult(false)
      scheduleRetry()
    }
  }

  function scheduleRetry() {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      queueFlush()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, SAVE_RETRY_MAX_MS)
  }

  return {
    save(state) {
      latest = state
      cancelRetry()
      queueFlush()
    },
    clear() {
      latest = null
      generation++
      flushQueued = false
      cancelRetry()
      return enqueue(() => repository.clear())
    },
    idle() {
      return tail
    },
    retry() {
      cancelRetry()
      queueFlush()
    },
    dispose() {
      cancelRetry()
    },
  }
}
