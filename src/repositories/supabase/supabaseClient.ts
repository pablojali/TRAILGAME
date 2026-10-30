import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig, type SupabaseConfig, type SupabaseConfigResult } from './supabaseConfig'

/**
 * The one Supabase client of the app (M7 foundation), for future authentication and repository
 * implementations. Nothing uses it yet: localStorage is still the active persistence, and the
 * game never waits for Supabase. Only the repository layer may import this module; `src/domain`
 * and `src/game-engine` never do (checked by src/architecture/layers.test.ts).
 */

/** The configuration from the build's environment (`.env.local`, or the host's settings). */
export function supabaseConfigFromEnv(): SupabaseConfigResult {
  return readSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })
}

/** A client for a configuration. Creating it makes no network request. */
export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'trailgame.auth' },
  })
}

let client: SupabaseClient | null | undefined

/**
 * The shared client, created on first use; null when Supabase is not configured or the
 * configuration is invalid (the game then runs as before, without it).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    const result = supabaseConfigFromEnv()
    client = result.status === 'configured' ? createSupabaseClient(result.config) : null
  }
  return client
}
