/**
 * Supabase configuration (M7 foundation). Plain functions with no app imports, so the connection
 * check also runs from Node (`npm run supabase:check`). Only the public anon/publishable key is
 * accepted: a service-role or secret key must never reach the frontend.
 */
export interface SupabaseConfig {
  url: string
  anonKey: string
}

export type SupabaseConfigResult =
  | { status: 'configured'; config: SupabaseConfig }
  /** No URL or key: the game runs without Supabase. */
  | { status: 'missing' }
  | { status: 'invalid'; problem: string }

/** True for keys that must stay on a server: `sb_secret_…` keys and JWTs with the service_role role. */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { role?: unknown }).role === 'service_role'
  } catch {
    return false
  }
}

/** Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from an environment object. */
export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfigResult {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!url && !anonKey) return { status: 'missing' }
  if (!url || !anonKey) return { status: 'invalid', problem: 'Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are needed.' }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { status: 'invalid', problem: 'VITE_SUPABASE_URL is not a valid URL.' }
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return { status: 'invalid', problem: 'VITE_SUPABASE_URL must use https.' }
  }
  if (isSecretKey(anonKey)) {
    return { status: 'invalid', problem: 'VITE_SUPABASE_ANON_KEY is a secret (service-role) key. Use the anon/publishable key.' }
  }
  return { status: 'configured', config: { url: parsed.origin, anonKey } }
}

export type ConnectionCheck = { ok: true } | { ok: false; problem: string }

/**
 * Checks that the project answers with this key, through the Auth health endpoint: no sign-in and
 * no database tables needed. Never throws.
 */
export async function checkSupabaseConnection(
  config: SupabaseConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000,
): Promise<ConnectionCheck> {
  try {
    const response = await fetchImpl(`${config.url}/auth/v1/health`, {
      headers: { apikey: config.anonKey },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, problem: `The project rejected the key (HTTP ${response.status}).` }
    }
    return { ok: false, problem: `Unexpected answer from the project (HTTP ${response.status}).` }
  } catch (error) {
    return { ok: false, problem: `Could not reach ${config.url}: ${error instanceof Error ? error.message : String(error)}` }
  }
}
