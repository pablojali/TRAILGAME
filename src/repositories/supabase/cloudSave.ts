import { createCloudSync, type CloudSync } from '../cloudSync'
import { getPlayerIdentity } from './playerIdentity'
import { createSupabaseCareerStore, type CareerStoreClient } from './supabaseCareerStore'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

let shared: CloudSync | null | undefined

/**
 * The app's cloud saves (Phase 2C), or null when Supabase is not configured (local saves only).
 * Uses the shared client and the shared anonymous/linked session.
 */
export function getCloudSync(): CloudSync | null {
  if (shared === undefined) {
    const identity = getPlayerIdentity()
    shared =
      supabaseConfigFromEnv().status === 'configured' && identity
        ? createCloudSync({
            store: createSupabaseCareerStore(
              async () => (await loadSupabaseClient()) as unknown as CareerStoreClient,
              () => identity.start(),
            ),
            storage: safeLocalStorage(),
          })
        : null
  }
  return shared
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
