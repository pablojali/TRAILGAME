import { parseCsv } from '../data/csv'

/**
 * The race points the NPC rankings use in Supabase (ranking_race_points and
 * ranking_position_percent), written as a migration exactly like
 * `python3 scripts/ranking_tables_sql.py --points-only`. Trail Studio adds it to a proposal when a
 * race's level or difficulty changes or a race is added, so the database stays in step with the
 * tables (src/data/rankingNpcs.test.ts checks it). Upserts only: it never deletes anything.
 */
export function racePointsRows(racesCsv: string, pointsCsv: string): string[] {
  const level = new Map(parseCsv(racesCsv).map((race) => [race.id!, race.recommended_level!]))
  const points = parseCsv(pointsCsv)
  const base = new Map(points.filter((p) => p.kind === 'difficulty').map((p) => [p.key!, p.value!]))
  return points.filter((p) => p.kind === 'race').map((p) => `${p.key}|${level.get(p.key!)}|${base.get(p.value!)}`)
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** The NPC rows as the migration loads them (id, name, country, sex, level, xp, strength, races per week). */
export function npcRows(npcsCsv: string): string[] {
  return parseCsv(npcsCsv).map((n) => [n.id, n.name, n.country, n.sex, n.level, n.xp, n.strength, n.races_per_week].join('|'))
}

function npcSection(npcsCsv: string): string[] {
  const npcs = parseCsv(npcsCsv)
  return [
    '-- ranking_npcs data (from src/data/ranking_npcs.csv; checked by src/data/rankingNpcs.test.ts)',
    'insert into public.ranking_npcs (id, name, country, sex, level, xp, strength, races_per_week, list_order) values',
    npcs
      .map((n, i) => `  (${q(n.id!)}, ${q(n.name!)}, ${q(n.country!)}, ${q(n.sex!)}, ${n.level}, ${n.xp}, ${n.strength}, ${n.races_per_week}, ${i + 1})`)
      .join(',\n'),
    'on conflict on constraint ranking_npcs_pkey do update set name = excluded.name, country = excluded.country, sex = excluded.sex,',
    '  level = excluded.level, xp = excluded.xp, strength = excluded.strength, races_per_week = excluded.races_per_week, list_order = excluded.list_order;',
    '',
  ]
}

/** The whole ranking data (NPC runners too when `npcsCsv` is given), as one migration. */
export function rankingMigration(racesCsv: string, pointsCsv: string, npcsCsv: string | null, why: string): string {
  const points = racePointsMigration(racesCsv, pointsCsv, why)
  if (!npcsCsv) return points
  const [first, second, blank, ...rest] = points.split('\n')
  return [first, second, blank, ...npcSection(npcsCsv), ...rest].join('\n')
}

export function racePointsMigration(racesCsv: string, pointsCsv: string, why: string): string {
  const level = new Map(parseCsv(racesCsv).map((race) => [race.id!, race.recommended_level!]))
  const points = parseCsv(pointsCsv)
  const base = new Map(points.filter((p) => p.kind === 'difficulty').map((p) => [p.key!, p.value!]))
  const races = points.filter((p) => p.kind === 'race')
  const positions = points.filter((p) => p.kind === 'position')
  return [
    `-- ${why} (made by Trail Studio; same as python3 scripts/ranking_tables_sql.py --points-only).`,
    '-- Upserts only: nothing is deleted.',
    '',
    "-- ranking_race_points data: each race's difficulty base points (src/data/ranking_points.csv) and recommended level",
    'insert into public.ranking_race_points (race_id, recommended_level, points) values',
    races.map((p) => `  (${q(p.key!)}, ${level.get(p.key!)}, ${base.get(p.value!)})`).join(',\n'),
    'on conflict on constraint ranking_race_points_pkey do update set recommended_level = excluded.recommended_level, points = excluded.points;',
    '',
    '-- ranking_position_percent data (src/data/ranking_points.csv)',
    'insert into public.ranking_position_percent (position, percent) values',
    positions.map((p) => `  (${p.key}, ${p.value})`).join(',\n'),
    'on conflict on constraint ranking_position_percent_pkey do update set percent = excluded.percent;',
    '',
  ].join('\n')
}

/** A migration file name after every existing one: supabase/migrations/YYYYMMDDHHMMSS_<name>.sql. */
export function migrationPath(now: Date, name: string): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  return `supabase/migrations/${stamp}_${name}.sql`
}
