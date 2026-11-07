import { getLevel } from '../../domain/athlete/levels'
import { getRace } from '../../domain/races/races'
import { rankingSeason, seasonBounds } from '../../domain/ranking/ranking'
import { getAchievements } from '../../game-engine/achievements'
import type { GameState } from '../../game-engine/gameState'
import { getScheduledEntry, isRaceDayToday } from '../../game-engine/raceSchedule'

/**
 * The Inbox (owner request, 6 November 2026): notifications built from the career itself, so the
 * server needs nothing new. Each has a stable id; the ids already read are kept in the browser.
 */
export type InboxKind = 'race' | 'challenge' | 'level' | 'season' | 'race-day' | 'decay' | 'cloud' | 'ranking'

export interface InboxItem {
  id: string
  kind: InboxKind
  /** When it happened (epoch ms), when known; otherwise when it was first seen. */
  at?: number
  /** Where tapping it goes. */
  link?: string
  /** Values for its texts. */
  values: Record<string, string | number>
}

export interface Transient {
  decay?: { periods: number; fitnessLost: number } | null
  cloudNotice?: 'restored' | 'updated' | null
  cloudError?: boolean
}

/** At most this many notifications are kept, newest first. */
export const INBOX_SIZE = 30

export function buildInbox(state: GameState, now: number, transient: Transient = {}): InboxItem[] {
  const items: InboxItem[] = []
  // Race results.
  for (const entry of state.raceEntries) {
    if (entry.status !== 'finished') continue
    const race = getRace(entry.raceId)
    if (!race) continue
    items.push({
      id: `race:${entry.result.startedAt}`,
      kind: 'race',
      at: entry.result.rankingAt ?? entry.result.startedAt,
      link: `/races/results/${entry.id}`,
      values: { race: race.name, position: entry.result.position, field: entry.result.fieldSize, points: entry.result.rankingPoints ?? 0 },
    })
  }
  // Challenge levels reached.
  for (const progress of getAchievements(state)) {
    for (let level = 1; level <= progress.reached; level++) {
      items.push({ id: `challenge:${progress.definition.id}:${level}`, kind: 'challenge', link: '/career?tab=achievements', values: { id: progress.definition.id, level } })
    }
  }
  // The level reached.
  const level = getLevel(state.athlete.xp)
  if (level > 1) items.push({ id: `level:${level}`, kind: 'level', link: '/attributes', values: { level } })
  // The ranking season under way.
  const season = rankingSeason(now)
  if (season > 0) {
    items.push({
      id: `season:${season}`,
      kind: 'season',
      at: seasonBounds(season).start,
      link: '/career',
      values: { season: season % 100, year: Math.floor(season / 100) },
    })
  }
  // Race day.
  const scheduled = getScheduledEntry(state)
  if (scheduled && isRaceDayToday(state)) {
    const race = getRace(scheduled.raceId)
    if (race) items.push({ id: `race-day:${scheduled.id}:${state.week.number}`, kind: 'race-day', link: `/races/${race.id}`, values: { race: race.name } })
  }
  // Messages of this visit only.
  if (transient.decay && transient.decay.fitnessLost > 0) {
    items.push({ id: `decay:${transient.decay.periods}:${transient.decay.fitnessLost}`, kind: 'decay', at: now, link: '/', values: { lost: transient.decay.fitnessLost, count: transient.decay.periods } })
  }
  if (transient.cloudNotice) items.push({ id: `cloud:${transient.cloudNotice}`, kind: 'cloud', at: now, link: '/settings', values: { notice: transient.cloudNotice } })
  if (transient.cloudError) items.push({ id: 'cloud:error', kind: 'cloud', at: now, link: '/settings', values: { notice: 'error' } })
  return items
}

/**
 * What the browser remembers: when each notification was first seen and whether it was read, the
 * player's last known ranking positions (by `scope:season`) and the ranking notifications made
 * from them, which cannot be rebuilt from the career.
 */
export interface InboxMemory {
  seen: Record<string, number>
  read: string[]
  ranks?: Record<string, number | null>
  events?: InboxItem[]
}

export type RankingScope = 'world' | 'country'

/** Positions that count as the top of a ranking (owner request, 7 November 2026). */
export const TOP_POSITIONS = 10

/**
 * The notification for a new ranking position, if any: entering the top 10, moving within it, or
 * leaving it. `previous` undefined means no position is known yet for this season and scope.
 */
export function rankingEvent(
  scope: RankingScope,
  season: number,
  previous: number | null | undefined,
  current: number | null,
  now: number,
  country?: string,
): InboxItem | null {
  const inTop = (rank: number | null | undefined) => rank !== null && rank !== undefined && rank <= TOP_POSITIONS
  let change: 'entered' | 'up' | 'down' | 'left' | null = null
  if (inTop(current) && !inTop(previous)) change = 'entered'
  else if (inTop(current) && inTop(previous) && current !== previous) change = current! < previous! ? 'up' : 'down'
  else if (!inTop(current) && inTop(previous)) change = 'left'
  if (!change) return null
  return {
    id: `ranking:${scope}:${season}:${now}`,
    kind: 'ranking',
    at: now,
    link: '/career',
    values: { scope, change, rank: current ?? 0, previous: previous ?? 0, ...(country ? { country } : {}) },
  }
}

/** The memory after learning the player's position in a ranking, with its notification if any. */
export function rememberRank(
  memory: InboxMemory,
  scope: RankingScope,
  season: number,
  current: number | null,
  now: number,
  country?: string,
): InboxMemory {
  const key = `${scope}:${season}`
  const event = rankingEvent(scope, season, memory.ranks?.[key], current, now, country)
  return {
    ...memory,
    ranks: { ...memory.ranks, [key]: current },
    events: event ? [event, ...(memory.events ?? [])].slice(0, INBOX_SIZE) : memory.events,
  }
}

const KEY = 'trailgame.inbox.v1'

export function loadMemory(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): InboxMemory {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<InboxMemory> | null
    if (value && typeof value.seen === 'object' && Array.isArray(value.read)) {
      return {
        seen: value.seen ?? {},
        read: value.read,
        ranks: value.ranks && typeof value.ranks === 'object' ? value.ranks : {},
        events: Array.isArray(value.events) ? value.events : [],
      }
    }
  } catch {
    // Unreadable or blocked storage: start empty.
  }
  return { seen: {}, read: [] }
}

export function saveMemory(memory: InboxMemory, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(memory))
  } catch {
    // The Inbox still works for this visit.
  }
}

/**
 * The notifications to show, newest first (at most INBOX_SIZE), each with its `unread` flag, and
 * the memory updated with the first-seen time of new ones (transient ones are never remembered).
 */
export function arrange(built: readonly InboxItem[], memory: InboxMemory, now: number): { list: (InboxItem & { unread: boolean })[]; memory: InboxMemory } {
  // Ranking notifications are remembered events; the rest is rebuilt from the career.
  const items = [...built, ...(memory.events ?? [])]
  const seen = { ...memory.seen }
  for (const item of items) if (!(item.id in seen) && !isTransient(item)) seen[item.id] = now
  const read = new Set(memory.read)
  const list = items
    .map((item) => ({ ...item, at: item.at ?? seen[item.id] ?? now, unread: !read.has(item.id) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, INBOX_SIZE)
  // Keep the memory small: only what the inbox can still show.
  const keep = new Set(items.map((item) => item.id))
  const trimmed = Object.fromEntries(Object.entries(seen).filter(([id]) => keep.has(id)))
  return { list, memory: { ...memory, seen: trimmed, read: memory.read.filter((id) => keep.has(id)) } }
}

export function markRead(memory: InboxMemory, ids: readonly string[]): InboxMemory {
  return { ...memory, read: [...new Set([...memory.read, ...ids])] }
}

function isTransient(item: InboxItem): boolean {
  return item.kind === 'decay' || item.kind === 'cloud' || item.kind === 'ranking'
}
