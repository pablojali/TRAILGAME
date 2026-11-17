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
  /** The caller is the owner's friend: they may go inside and leave a message. */
  friend: boolean
  /** Null: no pieces saved (the game shows a free refuge). */
  camp: CampState | null
}

export interface MailboxEntry {
  id: number
  kind: 'visit' | 'congrats' | 'message'
  /** The visitor's runner name. */
  name: string
  /** Epoch ms. */
  at: number
  /** A friend's message (kind message). */
  message?: string
}

export type MessageError = 'offline' | 'not-friends' | 'bad-message' | 'too-many-messages'

/** Most characters of a message (the database's limit). */
export const MESSAGE_MAX = 140

/** A friend or a friend request (owner design, 17 November 2026: requests and acceptance). */
export interface FriendEntry {
  name: string
  country: string | null
  xp: number
  /** friend; incoming: they asked the player; outgoing: the player asked them. */
  relation: 'friend' | 'incoming' | 'outgoing'
  /** Epoch ms: when they became friends, or when the request was sent. */
  since: number
  /** The player sent the request (for a friend: the player asked first). */
  mine: boolean
}

/** What a request answers: sent (or waiting), accepted (they had asked first) or already friends. */
export type FriendRequestAnswer = 'pending' | 'accepted' | 'friends'
export type FriendError = 'offline' | 'too-many-friends' | 'too-many-pending'

export interface CampService {
  refuge(name: string): Promise<PublicCamp | 'offline'>
  /** Records a visit (and a congratulation); answers whether the player congratulated them today. */
  visit(name: string, congratulate: boolean): Promise<{ congratulated: boolean } | 'offline'>
  mailbox(): Promise<MailboxEntry[] | 'offline'>
  friends(): Promise<FriendEntry[] | 'offline'>
  requestFriend(name: string): Promise<FriendRequestAnswer | FriendError>
  /** Accepts or declines a request the player received. */
  answerFriend(name: string, accept: boolean): Promise<'friends' | 'declined' | 'none' | FriendError>
  /** Ends a friendship, or withdraws the player's own request. */
  removeFriend(name: string): Promise<boolean | 'offline'>
  /** Leaves a friend a message in their mailbox. */
  leaveMessage(name: string, text: string): Promise<true | MessageError>
  /** Deletes a message from the player's mailbox. */
  deleteMessage(id: number): Promise<boolean | 'offline'>
}

interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

function toEntry(value: unknown): MailboxEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const at = typeof v.at === 'string' ? Date.parse(v.at) : NaN
  if (typeof v.id !== 'number' || (v.kind !== 'visit' && v.kind !== 'congrats' && v.kind !== 'message') || typeof v.name !== 'string' || !Number.isFinite(at)) return null
  if (v.kind === 'message') return typeof v.message === 'string' ? { id: v.id, kind: v.kind, name: v.name, at, message: v.message } : null
  return { id: v.id, kind: v.kind, name: v.name, at }
}

function toFriend(value: unknown): FriendEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const since = typeof v.since === 'string' ? Date.parse(v.since) : NaN
  if (typeof v.name !== 'string' || !['friend', 'incoming', 'outgoing'].includes(v.relation as string) || !Number.isFinite(since)) return null
  return {
    name: v.name,
    country: typeof v.country === 'string' ? v.country : null,
    xp: typeof v.xp === 'number' ? v.xp : 0,
    relation: v.relation as FriendEntry['relation'],
    since,
    mine: v.mine === true,
  }
}

/** A database error the game explains (raised by the friends functions), else offline. */
function friendError(error: unknown): FriendError {
  const message = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : ''
  return message.includes('too-many-friends') ? 'too-many-friends' : message.includes('too-many-pending') ? 'too-many-pending' : 'offline'
}

export function createCampService(client: () => Promise<RpcClient>, ensureSession: () => Promise<unknown>): CampService {
  async function rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    try {
      await ensureSession()
      return await (await client()).rpc(name, args)
    } catch (error) {
      return { data: null, error }
    }
  }
  async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await rpc(name, args)
    return error ? 'offline' : data
  }
  return {
    async refuge(name) {
      const data = await call('camp_public', { p_name: name })
      if (typeof data !== 'object' || data === null) return 'offline'
      const v = data as Record<string, unknown>
      return { name: typeof v.name === 'string' ? v.name : name, me: v.me === true, friend: v.friend === true, camp: parseCampState(v.camp) }
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
    async friends() {
      const data = await call('friend_list')
      if (!Array.isArray(data)) return 'offline'
      return data.map(toFriend).filter((entry): entry is FriendEntry => entry !== null)
    },
    async requestFriend(name) {
      const { data, error } = await rpc('friend_request', { p_name: name })
      if (error) return friendError(error)
      return data === 'accepted' || data === 'friends' ? data : 'pending'
    },
    async answerFriend(name, accept) {
      const { data, error } = await rpc('friend_respond', { p_name: name, p_accept: accept })
      if (error) return friendError(error)
      return data === 'friends' || data === 'declined' ? data : 'none'
    },
    async removeFriend(name) {
      const data = await call('friend_remove', { p_name: name })
      return data === 'offline' ? 'offline' : data === true
    },
    async leaveMessage(name, text) {
      const { error } = await rpc('camp_message', { p_name: name, p_text: text })
      if (!error) return true
      const message = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : ''
      return (['not-friends', 'bad-message', 'too-many-messages'] as const).find((code) => message.includes(code)) ?? 'offline'
    },
    async deleteMessage(id) {
      const data = await call('camp_message_delete', { p_id: id })
      return data === 'offline' ? 'offline' : data === true
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
