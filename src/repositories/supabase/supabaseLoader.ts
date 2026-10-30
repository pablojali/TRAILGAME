import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The app's one Supabase client (src/repositories/supabase/supabaseClient.ts), loaded on first
 * use: the library is downloaded in the background after the game's first screen. Every Supabase
 * feature (anonymous identity, account linking) goes through this, so there is one client, one
 * session and one handling of auth redirects.
 */
export async function loadSupabaseClient(): Promise<SupabaseClient> {
  const client = (await import('./supabaseClient')).getSupabaseClient()
  if (!client) throw new Error('Supabase is not configured')
  return client
}
