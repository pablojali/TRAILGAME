import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Trail Studio's own Supabase session (Sunday Major administration, owner decisions of 10
 * November 2026). The owner signs in with the game account's email (a magic link back to the
 * Studio). The admin rights are checked by the Edge Function `major-ops`, never here. Only the
 * public URL and publishable key are used: a secret key never reaches a browser.
 */
const URL_FALLBACK = 'https://zalyfrjfmsirvsrkdroy.supabase.co'
// The project's publishable key: public by design (the game ships it too).
const KEY_FALLBACK = 'sb_publishable_8F35wEJwbrsdHfZWVud-Ew_L7Lvk-NL'

let client: SupabaseClient | null = null

export function majorClient(): SupabaseClient {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL || URL_FALLBACK, import.meta.env.VITE_SUPABASE_ANON_KEY || KEY_FALLBACK, {
    auth: { storageKey: 'trailgame.studio.supabase', persistSession: true, detectSessionInUrl: true },
  })
  return client
}

export async function currentSession(): Promise<Session | null> {
  return (await majorClient().auth.getSession()).data.session
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const { error } = await majorClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
  })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await majorClient().auth.signOut()
}

export type MajorCall = { ok: true; [key: string]: unknown } | { ok: false; error: string }

/** One request to `major-ops`; the session's token goes with it. */
export async function majorOps(body: Record<string, unknown>): Promise<MajorCall> {
  const { data, error } = await majorClient().functions.invoke('major-ops', { body })
  if (!error) return data as MajorCall
  // An error status still carries the server's answer.
  const response = (error as { context?: Response }).context
  if (response && typeof response.json === 'function') {
    try {
      return (await response.json()) as MajorCall
    } catch {
      // Not JSON.
    }
  }
  return { ok: false, error: 'network' }
}

/** "dom, 15 nov 2026, 18:00 UTC · dom, 15:00 hora local". */
export function bothTimes(iso: string): string {
  const date = new Date(iso)
  const utc = date.toLocaleString('es', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const local = date.toLocaleString('es', { hour: '2-digit', minute: '2-digit', weekday: 'short' })
  return `${utc} UTC · ${local} hora local`
}

