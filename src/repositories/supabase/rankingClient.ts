import type { Sex } from '../../domain/athlete/athlete'
import { getPlayerIdentity } from './playerIdentity'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

/** One row of a ranking (database function get_ranking, owner request 5 November 2026). */
export interface RankingRow {
  rank: number
  name: string
  country: string | null
  sex: Sex | null
  xp: number
  points: number
  isMe: boolean
}

export interface RankingQuery {
  /** season: one season's best results; annual: each season's best results of the last months. */
  mode: 'season' | 'annual'
  /** Season id (year × 100 + month), for the season mode. */
  season?: number
  /** Months the annual mode looks back. */
  months: number
  /** Only players of this country (ISO code); all when missing. */
  country?: string
  /** Only men or only women; all when missing. */
  sex?: Sex
  bestResults: number
  limit: number
}

export interface RankingService {
  /** The ranked players (top `limit`, plus the caller), or 'offline' when the server cannot be reached. */
  fetch(query: RankingQuery): Promise<RankingRow[] | 'offline'>
}

interface RankingClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

function toRow(value: unknown): RankingRow | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.rank !== 'number' || typeof v.points !== 'number') return null
  return {
    rank: v.rank,
    name: typeof v.name === 'string' ? v.name : '',
    country: typeof v.country === 'string' ? v.country : null,
    sex: v.sex === 'male' || v.sex === 'female' ? v.sex : null,
    xp: typeof v.xp === 'number' ? v.xp : 0,
    points: v.points,
    isMe: v.is_me === true,
  }
}

export function createRankingService(client: () => Promise<RankingClient>, ensureSession: () => Promise<unknown>): RankingService {
  return {
    async fetch(query) {
      try {
        await ensureSession()
        const { data, error } = await (await client()).rpc('get_ranking', {
          p_mode: query.mode,
          p_season: query.season ?? null,
          p_months: query.months,
          p_country: query.country ?? null,
          p_sex: query.sex ?? null,
          p_best: query.bestResults,
          p_limit: query.limit,
        })
        if (error || !Array.isArray(data)) return 'offline'
        return data.map(toRow).filter((row): row is RankingRow => row !== null)
      } catch {
        return 'offline'
      }
    },
  }
}

let shared: RankingService | null | undefined

/** The app's ranking service, or null without Supabase (rankings are online only). */
export function getRankingService(): RankingService | null {
  if (shared === undefined) {
    shared =
      supabaseConfigFromEnv().status === 'configured'
        ? createRankingService(
            async () => (await loadSupabaseClient()) as unknown as RankingClient,
            () => getPlayerIdentity()?.start() ?? Promise.resolve(null),
          )
        : null
  }
  return shared
}
