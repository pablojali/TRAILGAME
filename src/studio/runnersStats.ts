import type { RunnerRow } from '../server/majorOps'

/**
 * Counts for Trail Studio's Corredores tab (owner request, 14 November 2026): how many runners,
 * players and NPCs, by level band, country and sex, and the player names used more than once.
 */
export type RunnerKindFilter = 'all' | 'PLAYER' | 'NPC'

export interface RunnerFilters {
  kind: RunnerKindFilter
  country: string
  /** Lower-case text in the name; empty: any. */
  search: string
}

/** Level bands of five levels (1–5, 6–10, …). */
export function levelBand(level: number): string {
  const from = Math.floor((Math.max(1, level) - 1) / 5) * 5 + 1
  return `${from}–${from + 4}`
}

export interface Count {
  key: string
  players: number
  npcs: number
}

function countBy(rows: readonly RunnerRow[], keyOf: (row: RunnerRow) => string): Count[] {
  const counts = new Map<string, Count>()
  for (const row of rows) {
    const key = keyOf(row)
    const count = counts.get(key) ?? { key, players: 0, npcs: 0 }
    if (row.kind === 'PLAYER') count.players += 1
    else count.npcs += 1
    counts.set(key, count)
  }
  return [...counts.values()]
}

export interface RunnerStats {
  players: number
  npcs: number
  byLevel: Count[]
  byCountry: Count[]
  bySex: Count[]
  /** Player names (case-insensitive) used by more than one player. */
  repeatedNames: string[]
  /** Average level of players and of NPCs (null when none). */
  averageLevel: { players: number | null; npcs: number | null }
}

const average = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null)

export function runnerStats(rows: readonly RunnerRow[]): RunnerStats {
  const players = rows.filter((r) => r.kind === 'PLAYER')
  const npcs = rows.filter((r) => r.kind === 'NPC')
  const byLevel = countBy(rows, (r) => levelBand(r.level)).sort((a, b) => parseInt(a.key) - parseInt(b.key))
  const byCountry = countBy(rows, (r) => r.country ?? '—').sort(
    (a, b) => b.players + b.npcs - (a.players + a.npcs) || a.key.localeCompare(b.key),
  )
  const bySex = countBy(rows, (r) => (r.sex === 'male' ? 'Hombres' : r.sex === 'female' ? 'Mujeres' : '—'))
  const names = new Map<string, number>()
  for (const p of players) names.set(p.name.toLowerCase(), (names.get(p.name.toLowerCase()) ?? 0) + 1)
  return {
    players: players.length,
    npcs: npcs.length,
    byLevel,
    byCountry,
    bySex,
    repeatedNames: [...names].filter(([, n]) => n > 1).map(([name]) => name).sort(),
    averageLevel: { players: average(players.map((p) => p.level)), npcs: average(npcs.map((n) => n.level)) },
  }
}

export function filterRunners(rows: readonly RunnerRow[], filters: RunnerFilters): RunnerRow[] {
  const search = filters.search.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (filters.kind === 'all' || r.kind === filters.kind) &&
      (!filters.country || (r.country ?? '—') === filters.country) &&
      (!search || r.name.toLowerCase().includes(search)),
  )
}

export type RunnerSort = 'level' | 'name' | 'country' | 'lastActive'

export function sortRunners(rows: readonly RunnerRow[], sort: RunnerSort): RunnerRow[] {
  const copy = [...rows]
  switch (sort) {
    case 'level':
      return copy.sort((a, b) => b.level - a.level || b.xp - a.xp || a.name.localeCompare(b.name))
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'country':
      return copy.sort((a, b) => (a.country ?? '~').localeCompare(b.country ?? '~') || b.level - a.level)
    case 'lastActive':
      return copy.sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') || b.level - a.level)
  }
}
