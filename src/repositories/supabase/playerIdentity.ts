import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

/** The parts of the Supabase client used here (the real client fits; tests pass a fake). */
export interface IdentityClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>
    signInAnonymously(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
  }
}

export type IdentityStatus = 'idle' | 'connecting' | 'signed-in' | 'retrying'

export interface PlayerIdentity {
  /**
   * Makes sure the player has a Supabase identity: reuses the stored session, or signs in
   * anonymously the first time. Never throws; on failure it retries in the background.
   * Resolves with the user id, or null after a failed attempt.
   */
  start(): Promise<string | null>
  status(): IdentityStatus
  /** Stops background retries. */
  stop(): void
}

export const IDENTITY_RETRY_MS = 2_000
export const IDENTITY_RETRY_MAX_MS = 60_000

/**
 * The player's Supabase identity (anonymous first; linked to email or Google in Settings). It only
 * signs in: the cloud career is created and saved by the cloud sync (src/repositories/cloudSync.ts),
 * and nothing here reads, changes or deletes the local save.
 */
export function createPlayerIdentity(client: IdentityClient, retryMs = IDENTITY_RETRY_MS): PlayerIdentity {
  let userId: string | null = null
  let state: IdentityStatus = 'idle'
  /** One sign-in at a time: StrictMode double effects and repeated starts share it. */
  let signingIn: Promise<string> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = retryMs

  function session(): Promise<string> {
    if (userId) return Promise.resolve(userId)
    if (!signingIn) {
      state = 'connecting'
      signingIn = (async () => {
        const existing = await client.auth.getSession()
        if (existing.error) throw existing.error
        if (existing.data.session) return existing.data.session.user.id
        const signedIn = await client.auth.signInAnonymously()
        if (signedIn.error || !signedIn.data.user) throw signedIn.error ?? new Error('Anonymous sign-in failed')
        return signedIn.data.user.id
      })().then(
        (id) => {
          userId = id
          state = 'signed-in'
          signingIn = null
          return id
        },
        (error: unknown) => {
          signingIn = null
          throw error
        },
      )
    }
    return signingIn
  }

  function scheduleRetry() {
    state = 'retrying'
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void attempt()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, IDENTITY_RETRY_MAX_MS)
  }

  /** Signs in; on failure, tries again later. */
  async function attempt(): Promise<string | null> {
    try {
      const id = await session()
      retryDelay = retryMs
      return id
    } catch {
      scheduleRetry()
      return null
    }
  }

  return {
    start: attempt,
    status: () => state,
    stop() {
      if (retryTimer !== null) clearTimeout(retryTimer)
      retryTimer = null
    },
  }
}

/** The shared Supabase client, loaded on first use (supabaseLoader). */
function lazyClient(): IdentityClient {
  const load = async () => (await loadSupabaseClient()) as unknown as IdentityClient
  return {
    auth: {
      getSession: async () => (await load()).auth.getSession(),
      signInAnonymously: async () => (await load()).auth.signInAnonymously(),
    },
  }
}

let shared: PlayerIdentity | null | undefined

/** The app's player identity, or null when Supabase is not configured (the game runs without it). */
export function getPlayerIdentity(): PlayerIdentity | null {
  if (shared === undefined) {
    shared = supabaseConfigFromEnv().status === 'configured' ? createPlayerIdentity(lazyClient()) : null
  }
  return shared
}
