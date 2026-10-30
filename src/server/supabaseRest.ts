import type { GameState } from '../game-engine/gameState'
import { SCHEMA_VERSION } from '../repositories/gameRepository'
import type { CareerOpsStore, CommitStatus } from './careerOps'

/**
 * Supabase access for the Edge Function, over plain HTTP (no client library in the bundle):
 * the player is identified from their own access token by the Auth server, and the database is
 * read and written with the service role key, which exists only in the function's environment
 * (never in the app). Writes go through commit_career only.
 */
export interface ServerConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
}

/** The user id for a player's access token, as the Auth server sees it; null if not valid. */
export async function authenticateWithSupabase(config: ServerConfig, token: string | null): Promise<string | null> {
  if (!token) return null
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: unknown }
  return typeof user.id === 'string' ? user.id : null
}

export function createSupabaseCareerOpsStore(config: ServerConfig): CareerOpsStore {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }

  async function get<T>(path: string): Promise<T[]> {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { headers })
    if (!response.ok) throw new Error(`Database read failed (${response.status})`)
    return (await response.json()) as T[]
  }

  return {
    async load(userId) {
      const rows = await get<{ version: number; schema_version: number; game_state: unknown }>(
        `careers?user_id=eq.${encodeURIComponent(userId)}&select=version,schema_version,game_state`,
      )
      const row = rows[0]
      return row ? { version: row.version, schemaVersion: row.schema_version, state: row.game_state } : null
    },

    async operation(operationId) {
      const rows = await get<{ user_id: string; response: unknown }>(
        `career_operations?operation_id=eq.${encodeURIComponent(operationId)}&select=user_id,response`,
      )
      const row = rows[0]
      return row ? { userId: row.user_id, response: row.response } : null
    },

    async commit({ userId, baseVersion, state, operationId, kind, response }) {
      const result = await fetch(`${config.url}/rest/v1/rpc/commit_career`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_user: userId,
          p_base_version: baseVersion,
          p_state: state satisfies GameState,
          p_schema_version: SCHEMA_VERSION,
          p_operation_id: operationId,
          p_kind: kind,
          p_response: response,
        }),
      })
      if (!result.ok) throw new Error(`Database write failed (${result.status}): ${await result.text()}`)
      const rows = (await result.json()) as { status: CommitStatus; version: number | null; response: unknown }[]
      const row = rows[0]
      if (!row) throw new Error('commit_career returned nothing')
      return row
    },
  }
}
