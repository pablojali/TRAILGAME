import { afterEach, describe, expect, it, vi } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { SAVE_KEY } from '../gameRepository'
import { createPlayerIdentity, type IdentityClient } from './playerIdentity'

/** A fake Supabase client: a stored session (or none), failures to inject, and call counts. */
function fakeClient({ session = null as string | null } = {}) {
  const calls = { getSession: 0, signIn: 0 }
  const failures = { getSession: 0, signIn: 0 }
  let stored = session
  const client: IdentityClient = {
    auth: {
      async getSession() {
        calls.getSession++
        if (failures.getSession > 0) {
          failures.getSession--
          return { data: { session: null }, error: new TypeError('Failed to fetch') }
        }
        return { data: { session: stored ? { user: { id: stored } } : null }, error: null }
      },
      async signInAnonymously() {
        calls.signIn++
        if (failures.signIn > 0) {
          failures.signIn--
          return { data: { user: null }, error: new TypeError('Failed to fetch') }
        }
        stored = `anon-${calls.signIn}`
        return { data: { user: { id: stored } }, error: null }
      },
    },
  }
  return { client, calls, failures }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('player identity — anonymous sign-in', () => {
  it('reuses an existing session and creates no new identity', async () => {
    const fake = fakeClient({ session: 'user-1' })
    const identity = createPlayerIdentity(fake.client)
    await expect(identity.start()).resolves.toBe('user-1')
    expect(fake.calls).toMatchObject({ getSession: 1, signIn: 0 })
    expect(identity.status()).toBe('signed-in')
  })

  it('signs in anonymously when there is no session, once', async () => {
    const fake = fakeClient()
    const identity = createPlayerIdentity(fake.client)
    await expect(identity.start()).resolves.toBe('anon-1')
    await expect(identity.start()).resolves.toBe('anon-1')
    expect(fake.calls).toMatchObject({ getSession: 1, signIn: 1 })
  })

  it('shares one sign-in between simultaneous starts (StrictMode, repeated events)', async () => {
    const fake = fakeClient()
    const identity = createPlayerIdentity(fake.client)
    const ids = await Promise.all([identity.start(), identity.start(), identity.start()])
    expect(ids).toEqual(['anon-1', 'anon-1', 'anon-1'])
    expect(fake.calls).toMatchObject({ getSession: 1, signIn: 1 })
  })

  it('retries in the background after a network failure, without blocking', async () => {
    vi.useFakeTimers()
    const fake = fakeClient()
    fake.failures.getSession = 1
    fake.failures.signIn = 1
    const identity = createPlayerIdentity(fake.client, 1_000)
    await expect(identity.start()).resolves.toBeNull()
    expect(identity.status()).toBe('retrying')
    await vi.advanceTimersByTimeAsync(1_000) // getSession works, sign-in fails again
    expect(identity.status()).toBe('retrying')
    await vi.advanceTimersByTimeAsync(2_000) // the delay doubled
    expect(identity.status()).toBe('signed-in')
    expect(fake.calls.signIn).toBe(2)
    identity.stop()
  })

  it('stops retrying when stopped', async () => {
    vi.useFakeTimers()
    const fake = fakeClient()
    fake.failures.getSession = 5
    const identity = createPlayerIdentity(fake.client, 1_000)
    await identity.start()
    identity.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.calls.getSession).toBe(1)
  })
})

describe('player identity — local save', () => {
  it('never reads, changes or deletes the local save', async () => {
    const raw = JSON.stringify({ schemaVersion: 2, savedAt: 'x', state: newGame() })
    localStorage.setItem(SAVE_KEY, raw)
    const fake = fakeClient()
    const identity = createPlayerIdentity(fake.client)
    await identity.start()
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  })
})
