import type { MajorPlan } from '../../domain/major/major'
import type { PlayerMajor } from '../../server/majorOps'
import type { FunctionsClient } from './careerOpsClient'
import { getPlayerIdentity } from './playerIdentity'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

/**
 * The game's side of the Sunday Majors (phase 2): the published Majors with the player's
 * registration, and the player's actions. Everything is decided by the Edge Function `major-ops`
 * on the server's career; the game only shows the answer.
 */
export type MajorAction =
  | { action: 'majors' }
  | { action: 'register'; id: string }
  | { action: 'withdraw'; id: string }
  | { action: 'save-plan'; id: string; plan: MajorPlan }
  | { action: 'ready'; id: string }

export type MajorAnswer = { ok: true; majors: PlayerMajor[] } | { ok: false; error: string }

export interface MajorService {
  call(request: MajorAction): Promise<MajorAnswer>
  /** The public address of a banner, clip or poster in the Storage bucket `major-media`. */
  mediaUrl(path: string): string
}

export function createMajorService(client: () => Promise<FunctionsClient>, baseUrl: string): MajorService {
  return {
    async call(request) {
      let functions: FunctionsClient
      try {
        functions = await client()
      } catch {
        return { ok: false, error: 'offline' }
      }
      const { data, error } = await functions.functions.invoke('major-ops', { body: request })
      if (!error) return data as MajorAnswer
      const context = error.context
      if (context instanceof Response) {
        try {
          const body = (await context.json()) as MajorAnswer
          if (body && typeof body === 'object' && 'ok' in body) return body
        } catch {
          // Not our JSON.
        }
        return { ok: false, error: 'server-error' }
      }
      return { ok: false, error: 'offline' }
    },
    mediaUrl: (path) => `${baseUrl}/storage/v1/object/public/major-media/${path}`,
  }
}

let shared: MajorService | null | undefined

/** The Majors service, or null without Supabase (Majors are online only). */
export function getMajorService(): MajorService | null {
  if (shared === undefined) {
    const config = supabaseConfigFromEnv()
    const identity = getPlayerIdentity()
    shared =
      config.status === 'configured' && identity
        ? createMajorService(async () => {
            if (!(await identity.start())) throw new Error('Not signed in yet')
            return (await loadSupabaseClient()) as unknown as FunctionsClient
          }, config.config.url)
        : null
  }
  return shared
}
