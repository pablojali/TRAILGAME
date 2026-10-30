import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CloudSave, CloudStore, PushResult } from './cloudStore'

/** Postgres unique violation: a row for this player already exists. */
const UNIQUE_VIOLATION = '23505'

interface CareerRow {
  state: unknown
  schema_version: number
  version: number
  changed_at: string
}

/**
 * Cloud save in Supabase: one row per player in `careers` (supabase/migrations), readable and
 * writable only by its owner through RLS. Players start with an anonymous account; only the public
 * anon key is used here.
 */
export function createSupabaseCloudStore(url: string, anonKey: string): CloudStore {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'trailgame.auth' },
  })

  async function userId(): Promise<string> {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    if (data.session) return data.session.user.id
    const signIn = await client.auth.signInAnonymously()
    if (signIn.error || !signIn.data.user) throw signIn.error ?? new Error('Sign-in failed')
    return signIn.data.user.id
  }

  return {
    async connect() {
      await userId()
    },

    async pull() {
      const id = await userId()
      const { data, error } = await client
        .from('careers')
        .select('state, schema_version, version, changed_at')
        .eq('user_id', id)
        .maybeSingle<CareerRow>()
      if (error) throw error
      if (!data) return null
      return {
        state: data.state,
        schemaVersion: data.schema_version,
        version: data.version,
        changedAt: Date.parse(data.changed_at),
      } satisfies CloudSave
    },

    async push(save, baseVersion): Promise<PushResult> {
      const id = await userId()
      const row = {
        state: save.state,
        schema_version: save.schemaVersion,
        changed_at: new Date(save.changedAt).toISOString(),
      }
      if (baseVersion === null) {
        const { error } = await client.from('careers').insert({ user_id: id, version: 1, ...row })
        if (error?.code === UNIQUE_VIOLATION) return { ok: false, reason: 'conflict' }
        if (error) throw error
        return { ok: true, version: 1 }
      }
      // Optimistic concurrency: only the copy this device last saw is replaced.
      const { data, error } = await client
        .from('careers')
        .update({ version: baseVersion + 1, ...row })
        .eq('user_id', id)
        .eq('version', baseVersion)
        .select('version')
      if (error) throw error
      return data.length === 1 ? { ok: true, version: baseVersion + 1 } : { ok: false, reason: 'conflict' }
    },

    async remove() {
      const id = await userId()
      const { error } = await client.from('careers').delete().eq('user_id', id)
      if (error) throw error
    },
  }
}

/** The cloud store configured by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or null. */
export function createConfiguredCloudStore(): CloudStore | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && key ? createSupabaseCloudStore(url, key) : null
}
