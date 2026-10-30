import type { GameState } from '../../game-engine/gameState'
import { SCHEMA_VERSION } from '../gameRepository'
import { supabaseConfigFromEnv } from './supabaseEnv'

/** The parts of the Supabase client used here (the real client fits; tests pass a fake). */
export interface IdentityClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>
    signInAnonymously(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
  }
  rpc(
    fn: 'create_my_career',
    args: { initial_state: GameState; initial_schema_version: number },
  ): PromiseLike<{ data: { career_id: string; created: boolean }[] | null; error: unknown }>
}

export type IdentityStatus = 'idle' | 'connecting' | 'signed-in' | 'retrying'

export interface RemoteCareer {
  careerId: string
  /** False when the career already existed (a retry, another device, a later call). */
  created: boolean
}

export interface PlayerIdentity {
  /**
   * Makes sure the player has a Supabase identity: reuses the stored session, or signs in
   * anonymously the first time. Never throws; on failure it retries in the background.
   * Resolves with the user id, or null after a failed attempt.
   */
  start(): Promise<string | null>
  /**
   * Creates the player's remote career from a brand-new local career, once. Safe to call again:
   * the server returns the existing career. Never throws; on failure it retries in the background.
   */
  ensureCareer(initialState: GameState): Promise<RemoteCareer | null>
  status(): IdentityStatus
  /** Stops background retries. */
  stop(): void
}

export const IDENTITY_RETRY_MS = 2_000
export const IDENTITY_RETRY_MAX_MS = 60_000

/**
 * The player's identity for Phase 2A (anonymous first, account linking later). It only signs in
 * and creates the remote career; gameplay still reads and writes localStorage, and nothing here
 * reads, changes or deletes the local save. Future account linking (email, Apple, Google) keeps
 * the same user id, so the same career, with Supabase's identity linking.
 */
export function createPlayerIdentity(client: IdentityClient, retryMs = IDENTITY_RETRY_MS): PlayerIdentity {
  let userId: string | null = null
  let state: IdentityStatus = 'idle'
  /** One sign-in at a time: StrictMode double effects and repeated starts share it. */
  let signingIn: Promise<string> | null = null
  let career: RemoteCareer | null = null
  let creating: Promise<RemoteCareer> | null = null
  /** A new career still to be created remotely after a failure. */
  let pendingCareer: GameState | null = null
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

  function createCareer(initialState: GameState): Promise<RemoteCareer> {
    if (career) return Promise.resolve(career)
    if (!creating) {
      creating = (async () => {
        await session()
        const { data, error } = await client.rpc('create_my_career', {
          initial_state: initialState,
          initial_schema_version: SCHEMA_VERSION,
        })
        if (error) throw error
        const row = data?.[0]
        if (!row) throw new Error('create_my_career returned nothing')
        return { careerId: row.career_id, created: row.created }
      })().then(
        (result) => {
          career = result
          pendingCareer = null
          creating = null
          return result
        },
        (error: unknown) => {
          creating = null
          throw error
        },
      )
    }
    return creating
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

  /** Signs in and creates a pending career; on failure, tries again later. */
  async function attempt(): Promise<string | null> {
    try {
      const id = await session()
      if (pendingCareer) await createCareer(pendingCareer)
      retryDelay = retryMs
      return id
    } catch {
      scheduleRetry()
      return null
    }
  }

  return {
    start: attempt,
    async ensureCareer(initialState) {
      if (career) return career
      pendingCareer = initialState
      await attempt()
      return career
    },
    status: () => state,
    stop() {
      if (retryTimer !== null) clearTimeout(retryTimer)
      retryTimer = null
    },
  }
}

/**
 * The shared Supabase client, loaded on first use: the library is downloaded in the background
 * after the game has started, not with the game's first screen.
 */
function lazyClient(): IdentityClient {
  const load = async () => {
    const client = (await import('./supabaseClient')).getSupabaseClient()
    if (!client) throw new Error('Supabase is not configured')
    return client as unknown as IdentityClient
  }
  return {
    auth: {
      getSession: async () => (await load()).auth.getSession(),
      signInAnonymously: async () => (await load()).auth.signInAnonymously(),
    },
    rpc: async (fn, args) => (await load()).rpc(fn, args),
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
