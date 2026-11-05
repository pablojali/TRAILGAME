-- Ranking points system v3 (owner decisions, 5 November 2026; Game Design Bible §11.2):
--   points = difficulty base points × position percent × competition percent, rounded.
-- The runner's level and sex never change the points; level only sets which races a runner may
-- enter: from 5 levels below a race's recommended level to 2 above, or the hardest race whose
-- minimum the runner reaches (so no level is left without a race). The players' points come from
-- the Edge Function; this migration moves the NPC runners to the same rules: new base points and
-- position percents, no level factor, and the same entry window.
-- No row is deleted: the tables' rows are upserted. get_ranking keeps its signature; p_sex is
-- ignored (one general classification, §11.1).

create or replace function public.npc_ranking_results(p_from date)
returns table (npc_id text, season integer, finished_at timestamptz, points integer)
language sql
stable
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(greatest(p_from, date '2026-11-01'), (now() at time zone 'UTC')::date, interval '1 day') d
  ),
  draws as (
    select n.id, n.level, n.strength, n.races_per_week, days.day,
           decode(md5(n.id || ':' || days.day::text), 'hex') as h
    from public.ranking_npcs n
    cross join days
    where n.races_per_week > 0
  ),
  raced as (
    select d.*,
           (d.day::timestamp + make_interval(secs => (get_byte(d.h, 2) * 256 + get_byte(d.h, 3)) * 86400.0 / 65536)) at time zone 'UTC' as at,
           get_byte(d.h, 4) < 64 as stretch
    from draws d
    where (get_byte(d.h, 0) * 256 + get_byte(d.h, 1)) % 7 < d.races_per_week
  ),
  entered as (
    select r.*, race.points as base,
           least(30, greatest(1, 1 + round((100 - r.strength) / 4.0)::integer + get_byte(r.h, 5) % 9 - 4)) as position
    from raced r
    cross join lateral (
      -- The races the NPC may enter: the same window as the players'.
      select p.recommended_level, p.points
      from public.ranking_race_points p
      where r.level >= p.recommended_level - 5
        and (r.level <= p.recommended_level + 2
             or p.recommended_level = (select max(q.recommended_level) from public.ranking_race_points q
                                       where r.level >= q.recommended_level - 5))
      -- Usually the race closest to its level; one time in four the hardest it may enter.
      order by case when r.stretch then -p.recommended_level else abs(p.recommended_level - r.level) end,
               p.recommended_level desc
      limit 1
    ) race
    where r.at <= now()
  )
  select e.id,
         extract(year from e.day)::integer * 100 + extract(month from e.day)::integer,
         e.at,
         round(e.base * coalesce(pp.percent, 0) / 100.0)::integer
  from entered e
  left join public.ranking_position_percent pp on pp.position = e.position
$$;

revoke all on function public.npc_ranking_results(date) from public, anon, authenticated;

-- ranking_race_points data: each race's difficulty base points (src/data/ranking_points.csv) and recommended level
insert into public.ranking_race_points (race_id, recommended_level, points) values
  ('RACE-001', 4, 100),
  ('RACE-002', 6, 100),
  ('RACE-003', 8, 100),
  ('RACE-004', 11, 125),
  ('RACE-005', 14, 125),
  ('RACE-006', 18, 125),
  ('RACE-007', 21, 160),
  ('RACE-008', 25, 160),
  ('RACE-009', 28, 200),
  ('RACE-010', 31, 200),
  ('RACE-011', 40, 250),
  ('RACE-012', 50, 250)
on conflict on constraint ranking_race_points_pkey do update set recommended_level = excluded.recommended_level, points = excluded.points;

-- ranking_position_percent data (src/data/ranking_points.csv)
insert into public.ranking_position_percent (position, percent) values
  (1, 100),
  (2, 85),
  (3, 75),
  (4, 70),
  (5, 65),
  (6, 60),
  (7, 56),
  (8, 52),
  (9, 48),
  (10, 45),
  (11, 43),
  (12, 40),
  (13, 37),
  (14, 34),
  (15, 31),
  (16, 28),
  (17, 25),
  (18, 22),
  (19, 19),
  (20, 16),
  (21, 12),
  (22, 12),
  (23, 12),
  (24, 12),
  (25, 12),
  (26, 8),
  (27, 8),
  (28, 8),
  (29, 8),
  (30, 8)
on conflict on constraint ranking_position_percent_pkey do update set percent = excluded.percent;
