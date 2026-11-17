import { parseCampState } from '../../game-engine/camp'
import type { CampState } from '../../game-engine/gameState'
import { getPlayerIdentity } from './playerIdentity'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

/**
 * Visiting refuges (owner design, 17 November 2026): another runner's Base Camp outside, the visit
 * and congratulations recorded for its owner, and the player's own mailbox. Database functions
 * camp_public, camp_visit and camp_mailbox; online only.
 */
export interface PublicCamp {
  name: string
  /** The caller's own refuge. */
  me: boolean
  /** Null: no pieces saved (the game shows a free refuge). */
  camp: CampState | null
}

export interface MailboxEntry {
  id: number
  kind: 'visit' | 'congrats'
  /** The visitor's runner name. */
  name: string
  /** Epoch ms. */
  at: number
}

export interface CampService {
  refuge(name: string): Promise<PublicCamp | 'offline'>
  /** Records a visit (and a congratulation); answers whether the player congratulated them today. */
  visit(name: string, congratulate: boolean): Promise<{ congratulated: boolean } | 'offline'>
  mailbox(): Promise<MailboxEntry[] | 'offline'>
}

interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

function toEntry(value: unknown): MailboxEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const at = typeof v.at === 'string' ? Date.parse(v.at) : NaN
  if (typeof v.id !== 'number' || (v.kind !== 'visit' && v.kind !== 'congrats') || typeof v.name !== 'string' || !Number.isFinite(at)) return null
  return { id: v.id, kind: v.kind, name: v.name, at }
}

export function createCampService(client: () => Promise<RpcClient>, ensureSession: () => Promise<unknown>): CampService {
  async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    try {
      await ensureSession()
      const { data, error } = await (await client()).rpc(name, args)
      return error ? 'offline' : data
    } catch {
      return 'offline'
    }
  }
  return {
    async refuge(name) {
      const data = await call('camp_public', { p_name: name })
      if (typeof data !== 'object' || data === null) return 'offline'
      const v = data as Record<string, unknown>
      return { name: typeof v.name === 'string' ? v.name : name, me: v.me === true, camp: parseCampState(v.camp) }
    },
    async visit(name, congratulate) {
      const data = await call('camp_visit', { p_name: name, p_congrats: congratulate })
      if (typeof data !== 'object' || data === null) return 'offline'
      return { congratulated: (data as Record<string, unknown>).congratulated === true }
    },
    async mailbox() {
      const data = await call('camp_mailbox')
      if (!Array.isArray(data)) return 'offline'
      return data.map(toEntry).filter((entry): entry is MailboxEntry => entry !== null)
    },
  }
}

let shared: CampService | null | undefined

/** The app's refuge service, or null without Supabase. */
export function getCampService(): CampService | null {
  if (shared === undefined) {
    shared =
      supabaseConfigFromEnv().status === 'configured'
        ? createCampService(
            async () => (await loadSupabaseClient()) as unknown as RpcClient,
            () => getPlayerIdentity()?.start() ?? Promise.resolve(null),
          )
        : null
  }
  return shared
}
