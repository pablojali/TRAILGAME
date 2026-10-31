import { createCloudSync, type CloudSync } from '../cloudSync'
import { createCareerOpsCall, type CareerOpsCall, type FunctionsClient } from './careerOpsClient'
import { getPlayerIdentity } from './playerIdentity'
import { createSupabaseCareerStore, type CareerStoreClient } from './supabaseCareerStore'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

let shared: CloudSync | null | undefined
let ops: CareerOpsCall | null | undefined

/**
 * Server operations (Phase 3B.1: training, race days, attribute points, new careers), or null
 * when Supabase is not configured (the game then runs them locally, as before).
 */
export function getCareerOps(): CareerOpsCall | null {
  if (ops === undefined) {
    const identity = getPlayerIdentity()
    ops =
      supabaseConfigFromEnv().status === 'configured' && identity
        ? createCareerOpsCall(async () => {
            // The call needs the player's session (anonymous or linked).
            if (!(await identity.start())) throw new Error('Not signed in yet')
            return (await loadSupabaseClient()) as unknown as FunctionsClient
          })
        : null
  }
  return ops
}

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
              getCareerOps()!,
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
