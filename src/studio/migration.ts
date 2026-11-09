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
