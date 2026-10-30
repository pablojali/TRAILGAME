import type { GameState } from '../../game-engine/gameState'
import type { RemoteCareer, RemoteCareerStore, RemoteSaveResult } from '../cloudSync'
import { SCHEMA_VERSION } from '../gameRepository'

interface CareerRow {
  version: number
  schema_version: number
  game_state: unknown
  updated_at: string
}

interface SaveRow {
  career_id: string | null
  version: number | null
  saved: boolean
}

/** The parts of the Supabase client used here (the real client fits; tests pass a fake). */
export interface CareerStoreClient {
  from(table: 'careers'): {
    select(columns: string): { maybeSingle(): PromiseLike<{ data: CareerRow | null; error: unknown }> }
  }
  rpc(
    fn: 'save_my_career',
    args: { snapshot: GameState; snapshot_schema_version: number; base_version: number | null },
  ): PromiseLike<{ data: SaveRow[] | null; error: unknown }>
}

/**
 * The player's cloud career in Supabase (Phase 2C): read through RLS (own row only), written only
 * through `save_my_career`, which checks the version so a stale or foreign write changes nothing.
 */
export function createSupabaseCareerStore(
  load: () => Promise<CareerStoreClient>,
  userId: () => Promise<string | null>,
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
      const client = await load()
      const { data, error } = await client.rpc('save_my_career', {
        snapshot: state,
        snapshot_schema_version: SCHEMA_VERSION,
        base_version: baseVersion,
      })
      if (error) throw error
      const row = data?.[0]
      if (!row) throw new Error('save_my_career returned nothing')
      return row.saved && row.version !== null ? { saved: true, version: row.version } : { saved: false, version: row.version }
    },
  }
}
