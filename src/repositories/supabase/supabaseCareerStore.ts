import type { RemoteCareer, RemoteCareerStore, RemoteSaveResult } from '../cloudSync'
import type { CareerOpsCall } from './careerOpsClient'

interface CareerRow {
  version: number
  schema_version: number
  game_state: unknown
  updated_at: string
}

/** The parts of the Supabase client used here (the real client fits; tests pass a fake). */
export interface CareerStoreClient {
  from(table: 'careers'): {
    select(columns: string): { maybeSingle(): PromiseLike<{ data: CareerRow | null; error: unknown }> }
  }
}

/**
 * The player's cloud career in Supabase: read through RLS (own row only), written only through
 * the `career-ops` Edge Function (Phase 3B.1), which keeps the server's progression, takes the
 * fields the client owns, and checks the version so a stale write changes nothing.
 */
export function createSupabaseCareerStore(
  load: () => Promise<CareerStoreClient>,
  userId: () => Promise<string | null>,
  careerOps: CareerOpsCall,
): RemoteCareerStore {
  return {
    async userId() {
      const id = await userId()
      if (!id) throw new Error('Not signed in yet')
      return id
    },

    async fetch(): Promise<RemoteCareer | null> {
      const client = await load()
      const { data, error } = await client.from('careers').select('version, schema_version, game_state, updated_at').maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        version: data.version,
        schemaVersion: data.schema_version,
        state: data.game_state,
        updatedAt: Date.parse(data.updated_at),
      }
    },

    async save(state, baseVersion): Promise<RemoteSaveResult> {
      const response = await careerOps({ action: 'save', baseVersion, snapshot: state })
      if (response.ok) return { saved: true, version: response.version, state: response.state }
      if (response.error === 'conflict') return { saved: false, version: 'version' in response ? (response.version ?? null) : null }
      // Offline or a server failure: the sync keeps the save pending and retries.
      throw new Error(`Cloud save failed: ${response.error}`)
    },
  }
}
