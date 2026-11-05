-- NPC runners in the rankings (owner request, 5 November 2026): 200 runners fill the rankings while
-- there are few players. They look like any runner. They have no account and no career: their
-- results are drawn, the same for everyone, from their row and the day (UTC), so the rankings move
-- every day and never jump on reload. Each real player with ranking points retires one NPC of the
-- same country (the first of that country in the owner's list). Data: src/data/ranking_npcs.csv.

create table public.ranking_npcs (
  id text primary key,
  name text not null check (char_length(name) between 1 and 16),
  country text not null check (country ~ '^[A-Z]{2}$'),
  sex text not null check (sex in ('male', 'female')),
  level integer not null check (level between 1 and 100),
  xp integer not null check (xp >= 0),
  strength integer not null check (strength between 0 and 100),
  races_per_week integer not null check (races_per_week between 0 and 7),
  list_order integer not null
);

-- The ranking points of each race and finishing position (copies of src/data/ranking_points.csv:
-- the server computes the players' points in the Edge Function, the NPCs' here).
create table public.ranking_race_points (
  race_id text primary key,
  recommended_level integer not null,
  points integer not null check (points >= 0)
);

create table public.ranking_position_percent (
  position integer primary key check (position >= 1),
  percent integer not null check (percent between 0 and 100)
);

alter table public.ranking_npcs enable row level security;
alter table public.ranking_race_points enable row level security;
alter table public.ranking_position_percent enable row level security;
revoke all on table public.ranking_npcs, public.ranking_race_points, public.ranking_position_percent
  from public, anon, authenticated;

-- The NPCs' results from p_from (a UTC day, never before Season 11 · 2026) until now. On each day an
-- NPC races with chance races_per_week / 7; it picks the hardest race of its level (one in four
-- times the one a level above, at the lower reward of the race table), finishes about
-- 1 + (100 − strength) / 4 (± 4), and earns base points × position percent × reward percent.
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
           d.level + case when get_byte(d.h, 4) < 64 then 1 else 0 end as target
    from draws d
    where (get_byte(d.h, 0) * 256 + get_byte(d.h, 1)) % 7 < d.races_per_week
  ),
  entered as (
    select r.*, race.recommended_level, race.points as base,
           least(30, greatest(1, 1 + round((100 - r.strength) / 4.0)::integer + get_byte(r.h, 5) % 9 - 4)) as position
    from raced r
    cross join lateral (
      select p.recommended_level, p.points
      from public.ranking_race_points p
      where p.recommended_level <= greatest(r.target, (select min(recommended_level) from public.ranking_race_points))
      order by p.recommended_level desc
      limit 1
    ) race
    where r.level >= race.recommended_level - 2
      and r.at <= now()
  )
  select e.id,
         extract(year from e.day)::integer * 100 + extract(month from e.day)::integer,
         e.at,
         round(e.base * coalesce(pp.percent, 0)
               * case e.level - e.recommended_level when -1 then 75 when -2 then 40 else 100 end / 10000.0)::integer
  from entered e
  left join public.ranking_position_percent pp on pp.position = e.position
$$;

revoke all on function public.npc_ranking_results(date) from public, anon, authenticated;

-- The rankings, now with the NPCs who are not retired. Same arguments and columns as before.
create or replace function public.get_ranking(
  p_mode text,
  p_season integer default null,
  p_country text default null,
  p_sex text default null,
  p_best integer default 10,
  p_limit integer default 50,
  p_months integer default 12
)
returns table (rank bigint, name text, country text, sex text, xp integer, points bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select greatest(1, least(coalesce(p_best, 10), 50)) as best_count,
           greatest(1, least(coalesce(p_limit, 50), 200)) as row_limit,
           now() - make_interval(months => greatest(1, least(coalesce(p_months, 12), 24))) as since
  ),
  -- Real players with ranking points (ever), by country: each retires one NPC of that country.
  real_by_country as (
    select c.game_state -> 'athlete' ->> 'country' as country, count(*) as players
    from public.careers c
    where exists (select 1 from public.ranking_results r where r.user_id = c.user_id)
    group by 1
  ),
  active_npcs as (
    select n.*
    from (select n.*, row_number() over (partition by n.country order by n.list_order) as place from public.ranking_npcs n) n
    left join real_by_country rc on rc.country = n.country
    where n.place > coalesce(rc.players, 0)
  ),
  results as (
    select r.user_id::text as runner, r.season, r.points, r.finished_at
    from public.ranking_results r
    union all
    select 'npc:' || x.npc_id, x.season, x.points, x.finished_at
    from params,
         public.npc_ranking_results(case when p_mode = 'season'
                                         then make_date(p_season / 100, greatest(1, least(p_season % 100, 12)), 1)
                                         else (params.since at time zone 'UTC')::date end) x
    where x.npc_id in (select id from active_npcs)
  ),
  -- Each result's place among the runner's results of its season (best first).
  seasonal as (
    select r.runner, r.points, r.finished_at,
           row_number() over (partition by r.runner, r.season order by r.points desc, r.finished_at) as place
    from results r, params
    where (p_mode = 'season' and r.season = p_season)
       or (p_mode = 'annual' and r.season >= (extract(year from params.since at time zone 'UTC')::integer * 100
                                            + extract(month from params.since at time zone 'UTC')::integer))
  ),
  totals as (
    select s.runner, sum(s.points) as total
    from seasonal s, params
    where s.place <= params.best_count
      and (p_mode = 'season' or s.finished_at >= params.since)
    group by s.runner
    having sum(s.points) > 0
  ),
  players as (
    select t.runner,
           t.total,
           left(coalesce(c.game_state -> 'athlete' ->> 'name', ''), 16) as runner_name,
           c.game_state -> 'athlete' ->> 'country' as runner_country,
           c.game_state -> 'athlete' ->> 'sex' as runner_sex,
           case when jsonb_typeof(c.game_state -> 'athlete' -> 'xp') = 'number'
                then (c.game_state -> 'athlete' ->> 'xp')::integer else 0 end as runner_xp
    from totals t
    join public.careers c on c.user_id::text = t.runner
    union all
    select t.runner, t.total, n.name, n.country, n.sex, n.xp
    from totals t
    join active_npcs n on 'npc:' || n.id = t.runner
  ),
  ranked as (
    select rank() over (order by total desc) as position, *
    from players
    where (p_country is null or runner_country = p_country)
      and (p_sex is null or runner_sex = p_sex)
  )
  select position, runner_name, runner_country, runner_sex, runner_xp, total, coalesce(runner = auth.uid()::text, false)
  from ranked, params
  where position <= params.row_limit or runner = auth.uid()::text
  order by position, runner_name;
$$;

revoke all on function public.get_ranking(text, integer, text, text, integer, integer, integer) from public, anon;
grant execute on function public.get_ranking(text, integer, text, text, integer, integer, integer) to authenticated;

-- ranking_npcs data (from src/data/ranking_npcs.csv; checked by src/data/rankingNpcs.test.ts)
delete from public.ranking_npcs;
insert into public.ranking_npcs (id, name, country, sex, level, xp, strength, races_per_week, list_order) values
  ('NPC-001', 'Ana91', 'MX', 'female', 19, 9822, 68, 2, 1),
  ('NPC-002', 'Lea26', 'CH', 'female', 13, 4788, 75, 1, 2),
  ('NPC-003', 'Ines_E', 'FR', 'female', 35, 32647, 9, 3, 3),
  ('NPC-004', 'Ryan_J', 'US', 'male', 4, 595, 43, 1, 4),
  ('NPC-005', 'FoxRunner', 'GB', 'female', 2, 109, 65, 3, 5),
  ('NPC-006', 'Facu86', 'CL', 'male', 3, 447, 60, 3, 6),
  ('NPC-007', 'Margaux_M', 'BE', 'female', 12, 4299, 5, 2, 7),
  ('NPC-008', 'Hugo_N', 'ES', 'male', 11, 3841, 72, 1, 8),
  ('NPC-009', 'Irene88', 'IT', 'female', 18, 8763, 53, 2, 9),
  ('NPC-010', 'Jess_V', 'GB', 'female', 3, 317, 31, 2, 10),
  ('NPC-011', 'StormClimber', 'DE', 'female', 14, 5881, 59, 2, 11),
  ('NPC-012', 'Lautaro_N', 'ES', 'male', 2, 237, 77, 2, 12),
  ('NPC-013', 'Sofia43', 'AR', 'female', 11, 3666, 25, 2, 13),
  ('NPC-014', 'HawkHunter', 'CH', 'male', 7, 1419, 57, 1, 14),
  ('NPC-015', 'Piotr_T', 'SI', 'male', 2, 216, 29, 2, 15),
  ('NPC-016', 'StoneHopper', 'EC', 'male', 5, 909, 84, 3, 16),
  ('NPC-017', 'WolfWalker', 'PT', 'female', 27, 18901, 76, 2, 17),
  ('NPC-018', 'StormRider', 'US', 'male', 8, 2130, 60, 2, 18),
  ('NPC-019', 'Ines97', 'AR', 'female', 9, 2482, 16, 2, 19),
  ('NPC-020', 'Owen72', 'ZA', 'male', 6, 1341, 15, 3, 20),
  ('NPC-021', 'Holly68', 'GB', 'female', 11, 3653, 50, 2, 21),
  ('NPC-022', 'Chiara43', 'IT', 'female', 10, 3168, 61, 2, 22),
  ('NPC-023', 'WolfRunner', 'BE', 'female', 3, 320, 57, 2, 23),
  ('NPC-024', 'Pavel65', 'SI', 'male', 5, 928, 21, 3, 24),
  ('NPC-025', 'JaviPine', 'AR', 'male', 46, 54704, 54, 1, 25),
  ('NPC-026', 'Lena16', 'DE', 'female', 16, 7521, 19, 1, 26),
  ('NPC-027', 'ZuzaCliff', 'CZ', 'female', 22, 13253, 35, 1, 27),
  ('NPC-028', 'Olav67', 'NO', 'male', 3, 369, 48, 3, 28),
  ('NPC-029', 'Noelia82', 'AR', 'female', 8, 1755, 60, 1, 29),
  ('NPC-030', 'SkyHunter', 'SE', 'male', 25, 17280, 66, 1, 30),
  ('NPC-031', 'Tomek_N', 'PL', 'male', 40, 42229, 61, 3, 31),
  ('NPC-032', 'Tyler74', 'ZA', 'male', 34, 29985, 60, 2, 32),
  ('NPC-033', 'Zoe42', 'FR', 'female', 34, 30685, 36, 1, 33),
  ('NPC-034', 'Julia58', 'UY', 'female', 38, 37389, 59, 1, 34),
  ('NPC-035', 'RockStrider', 'US', 'male', 22, 13552, 78, 3, 35),
  ('NPC-036', 'Hugo80', 'FR', 'male', 33, 28652, 33, 2, 36),
  ('NPC-037', 'AlpineClimber', 'UY', 'female', 2, 103, 90, 1, 37),
  ('NPC-038', 'ZoeDust', 'AU', 'female', 29, 22226, 32, 2, 38),
  ('NPC-039', 'Mateo14', 'MX', 'male', 7, 1692, 52, 3, 39),
  ('NPC-040', 'Moritz71', 'AT', 'male', 13, 4693, 47, 1, 40),
  ('NPC-041', 'ValenMoss', 'ES', 'female', 40, 41821, 30, 2, 41),
  ('NPC-042', 'TrailClimber', 'CA', 'female', 31, 25269, 11, 2, 42),
  ('NPC-043', 'Sofia_J', 'ES', 'female', 32, 27820, 23, 2, 43),
  ('NPC-044', 'StoneRacer', 'US', 'female', 12, 3911, 78, 2, 44),
  ('NPC-045', 'LiamTrail', 'GB', 'male', 2, 205, 51, 1, 45),
  ('NPC-046', 'Ryan96', 'GB', 'male', 3, 262, 17, 1, 46),
  ('NPC-047', 'Giulia56', 'IT', 'female', 14, 5479, 83, 2, 47),
  ('NPC-048', 'KipPine', 'KE', 'male', 48, 60254, 79, 2, 48),
  ('NPC-049', 'Rodri_L', 'PE', 'male', 4, 577, 45, 1, 49),
  ('NPC-050', 'NicoPuma', 'ES', 'male', 4, 697, 78, 2, 50),
  ('NPC-051', 'BelenStone', 'MX', 'female', 27, 19807, 80, 1, 51),
  ('NPC-052', 'Sarah87', 'ZA', 'female', 31, 24794, 25, 2, 52),
  ('NPC-053', 'Mike51', 'US', 'male', 11, 3332, 43, 1, 53),
  ('NPC-054', 'Ola25', 'CZ', 'female', 15, 6200, 54, 1, 54),
  ('NPC-055', 'Luca77', 'IT', 'male', 5, 757, 44, 2, 55),
  ('NPC-056', 'Faith61', 'KE', 'female', 9, 2580, 59, 2, 56),
  ('NPC-057', 'Sota61', 'JP', 'male', 9, 2434, 51, 2, 57),
  ('NPC-058', 'PumaChaser', 'AT', 'male', 20, 10669, 65, 3, 58),
  ('NPC-059', 'StormChaser', 'IT', 'female', 11, 3280, 86, 2, 59),
  ('NPC-060', 'SimoneFox', 'IT', 'male', 21, 12472, 54, 2, 60),
  ('NPC-061', 'Sam34', 'US', 'male', 17, 8144, 60, 2, 61),
  ('NPC-062', 'Tobias68', 'DE', 'male', 6, 1103, 62, 2, 62),
  ('NPC-063', 'RockChaser', 'CH', 'female', 3, 342, 66, 2, 63),
  ('NPC-064', 'Ryan34', 'US', 'male', 31, 26349, 5, 1, 64),
  ('NPC-065', 'Megan_P', 'IE', 'female', 2, 216, 28, 2, 65),
  ('NPC-066', 'ElkStrider', 'JP', 'male', 3, 428, 50, 1, 66),
  ('NPC-067', 'Theo_R', 'FR', 'male', 5, 719, 81, 3, 67),
  ('NPC-068', 'Lotte_B', 'NL', 'female', 9, 2547, 66, 3, 68),
  ('NPC-069', 'Joana_P', 'BR', 'female', 18, 8833, 73, 1, 69),
  ('NPC-070', 'Iker24', 'CO', 'male', 26, 17551, 81, 2, 70),
  ('NPC-071', 'Mateo79', 'MX', 'male', 27, 19914, 64, 1, 71),
  ('NPC-072', 'Valen_C', 'ES', 'female', 24, 15598, 42, 2, 72),
  ('NPC-073', 'Elin18', 'NO', 'female', 3, 362, 33, 2, 73),
  ('NPC-074', 'WildHunter', 'US', 'male', 27, 19758, 59, 2, 74),
  ('NPC-075', 'Ben33', 'ZA', 'male', 8, 2164, 42, 1, 75),
  ('NPC-076', 'Marta60', 'IT', 'female', 4, 657, 64, 2, 76),
  ('NPC-077', 'Haruto56', 'JP', 'male', 48, 60364, 68, 1, 77),
  ('NPC-078', 'Holly_B', 'US', 'female', 11, 3537, 45, 1, 78),
  ('NPC-079', 'WildHopper', 'IT', 'female', 20, 11055, 64, 1, 79),
  ('NPC-080', 'Kaito_T', 'JP', 'male', 14, 5902, 5, 3, 80),
  ('NPC-081', 'CliffHopper', 'CA', 'male', 45, 53216, 41, 2, 81),
  ('NPC-082', 'HugoMoss', 'CO', 'male', 27, 19144, 68, 3, 82),
  ('NPC-083', 'Belen50', 'ES', 'female', 39, 39786, 40, 1, 83),
  ('NPC-084', 'WildRider', 'ES', 'female', 35, 32520, 10, 3, 84),
  ('NPC-085', 'Tyler49', 'GB', 'male', 8, 1869, 60, 3, 85),
  ('NPC-086', 'Tobias36', 'DE', 'male', 3, 327, 30, 1, 86),
  ('NPC-087', 'Emma_K', 'CA', 'female', 20, 10926, 65, 2, 87),
  ('NPC-088', 'LynxRider', 'NO', 'male', 21, 11874, 52, 1, 88),
  ('NPC-089', 'Tereza77', 'SI', 'female', 4, 497, 69, 2, 89),
  ('NPC-090', 'LynxHunter', 'CL', 'female', 18, 8681, 58, 1, 90),
  ('NPC-091', 'RidgeHopper', 'AT', 'female', 49, 62858, 23, 3, 91),
  ('NPC-092', 'Klara_S', 'CZ', 'female', 4, 534, 37, 1, 92),
  ('NPC-093', 'TylerRock', 'CA', 'male', 44, 51040, 48, 2, 93),
  ('NPC-094', 'Noelia_D', 'ES', 'female', 3, 340, 57, 2, 94),
  ('NPC-095', 'SnowHopper', 'CH', 'female', 4, 521, 24, 1, 95),
  ('NPC-096', 'Ben_D', 'AU', 'male', 23, 14667, 22, 2, 96),
  ('NPC-097', 'NinaSky', 'AT', 'female', 38, 38621, 32, 3, 97),
  ('NPC-098', 'StormStrider', 'AD', 'female', 12, 4208, 54, 2, 98),
  ('NPC-099', 'Tyler_D', 'GB', 'male', 12, 4299, 50, 2, 99),
  ('NPC-100', 'BrunoTrail', 'CL', 'male', 2, 213, 22, 2, 100),
  ('NPC-101', 'Facu57', 'AR', 'male', 25, 17473, 77, 2, 101),
  ('NPC-102', 'CliffRacer', 'PE', 'male', 14, 5247, 55, 3, 102),
  ('NPC-103', 'YanisWild', 'FR', 'male', 16, 7286, 77, 2, 103),
  ('NPC-104', 'PumaRider', 'US', 'male', 11, 3835, 67, 2, 104),
  ('NPC-105', 'PumaRacer', 'NZ', 'female', 36, 34715, 51, 2, 105),
  ('NPC-106', 'PeakStrider', 'FR', 'female', 25, 17406, 70, 2, 106),
  ('NPC-107', 'Femke12', 'NL', 'female', 39, 39037, 55, 1, 107),
  ('NPC-108', 'MiaGoat', 'CH', 'female', 11, 3363, 12, 2, 108),
  ('NPC-109', 'GoatRacer', 'SE', 'male', 9, 2404, 56, 1, 109),
  ('NPC-110', 'Tiago99', 'PT', 'male', 28, 21437, 85, 3, 110),
  ('NPC-111', 'FoxChaser', 'NO', 'female', 4, 547, 52, 3, 111),
  ('NPC-112', 'PineHopper', 'BR', 'male', 2, 218, 52, 3, 112),
  ('NPC-113', 'RockClimber', 'IT', 'male', 16, 6972, 56, 2, 113),
  ('NPC-114', 'Ines82', 'UY', 'female', 7, 1652, 52, 2, 114),
  ('NPC-115', 'Julien_F', 'FR', 'male', 10, 2745, 38, 2, 115),
  ('NPC-116', 'Ines35', 'CO', 'female', 26, 18828, 28, 1, 116),
  ('NPC-117', 'Dan_M', 'US', 'male', 38, 37822, 6, 1, 117),
  ('NPC-118', 'Holly_E', 'NZ', 'female', 35, 31693, 35, 2, 118),
  ('NPC-119', 'Niklas63', 'DE', 'male', 10, 3113, 93, 2, 119),
  ('NPC-120', 'Bastien_J', 'FR', 'male', 15, 6040, 12, 2, 120),
  ('NPC-121', 'Brian98', 'KE', 'male', 3, 385, 59, 1, 121),
  ('NPC-122', 'BearChaser', 'ES', 'female', 18, 8910, 39, 3, 122),
  ('NPC-123', 'Brian_P', 'KE', 'male', 25, 16499, 76, 3, 123),
  ('NPC-124', 'BearRunner', 'FR', 'female', 7, 1713, 55, 3, 124),
  ('NPC-125', 'Josh21', 'US', 'male', 18, 9429, 66, 2, 125),
  ('NPC-126', 'Grace38', 'IE', 'female', 43, 48514, 53, 3, 126),
  ('NPC-127', 'Antoine_H', 'FR', 'male', 11, 3838, 15, 2, 127),
  ('NPC-128', 'AlpineStrider', 'PL', 'female', 44, 49684, 55, 3, 128),
  ('NPC-129', 'Tomas52', 'ES', 'male', 23, 14489, 21, 2, 129),
  ('NPC-130', 'Piotr43', 'CZ', 'male', 18, 9374, 60, 2, 130),
  ('NPC-131', 'Holly76', 'CA', 'female', 2, 233, 65, 2, 131),
  ('NPC-132', 'Bruno77', 'AR', 'male', 36, 33539, 53, 1, 132),
  ('NPC-133', 'SummitStrider', 'CH', 'male', 12, 4279, 95, 2, 133),
  ('NPC-134', 'Bruno98', 'AR', 'male', 22, 12970, 52, 2, 134),
  ('NPC-135', 'Tomek79', 'PL', 'male', 41, 43114, 38, 2, 135),
  ('NPC-136', 'Tomas_M', 'AR', 'male', 24, 16105, 60, 2, 136),
  ('NPC-137', 'HarutoPuma', 'JP', 'male', 6, 1089, 73, 2, 137),
  ('NPC-138', 'Freya_M', 'SE', 'female', 11, 3839, 67, 3, 138),
  ('NPC-139', 'StoneClimber', 'IT', 'female', 45, 53977, 77, 2, 139),
  ('NPC-140', 'Mathis85', 'FR', 'male', 32, 27055, 79, 2, 140),
  ('NPC-141', 'BearRider', 'AT', 'female', 17, 8124, 54, 2, 141),
  ('NPC-142', 'Lea15', 'DE', 'female', 9, 2479, 90, 2, 142),
  ('NPC-143', 'Astrid27', 'NO', 'female', 28, 21134, 49, 3, 143),
  ('NPC-144', 'CliffHunter', 'ES', 'male', 47, 56465, 43, 2, 144),
  ('NPC-145', 'CliffRunner', 'PT', 'male', 6, 1019, 47, 2, 145),
  ('NPC-146', 'Sarah52', 'US', 'female', 14, 5235, 43, 2, 146),
  ('NPC-147', 'Lucas_E', 'FR', 'male', 2, 140, 38, 1, 147),
  ('NPC-148', 'Tiago81', 'PT', 'male', 3, 302, 38, 1, 148),
  ('NPC-149', 'Anais30', 'FR', 'female', 36, 33610, 95, 2, 149),
  ('NPC-150', 'Tomas33', 'AR', 'male', 2, 194, 21, 1, 150),
  ('NPC-151', 'DustHunter', 'ES', 'female', 45, 52258, 25, 2, 151),
  ('NPC-152', 'Mike20', 'US', 'male', 9, 2594, 61, 2, 152),
  ('NPC-153', 'SummitClimber', 'VE', 'male', 16, 7040, 44, 3, 153),
  ('NPC-154', 'Sam_A', 'NZ', 'male', 21, 12251, 48, 2, 154),
  ('NPC-155', 'HollyRidge', 'GB', 'female', 33, 29647, 57, 2, 155),
  ('NPC-156', 'Belen43', 'CL', 'female', 21, 11997, 52, 1, 156),
  ('NPC-157', 'Fede_A', 'MX', 'male', 41, 44707, 50, 2, 157),
  ('NPC-158', 'Rui53', 'BR', 'male', 20, 11039, 59, 3, 158),
  ('NPC-159', 'Margaux_E', 'FR', 'female', 28, 20550, 41, 1, 159),
  ('NPC-160', 'Pedro_L', 'BR', 'male', 3, 417, 61, 2, 160),
  ('NPC-161', 'AlpineWalker', 'AU', 'female', 22, 13734, 85, 1, 161),
  ('NPC-162', 'Haruto_V', 'JP', 'male', 20, 11208, 50, 2, 162),
  ('NPC-163', 'ElkHopper', 'FR', 'male', 22, 12895, 57, 3, 163),
  ('NPC-164', 'Noelia_J', 'CL', 'female', 27, 19969, 41, 2, 164),
  ('NPC-165', 'KateStorm', 'CA', 'female', 19, 9997, 83, 3, 165),
  ('NPC-166', 'Chloe_F', 'BE', 'female', 2, 235, 95, 1, 166),
  ('NPC-167', 'DustStrider', 'PT', 'male', 11, 3779, 61, 1, 167),
  ('NPC-168', 'Ana29', 'ES', 'female', 11, 3516, 50, 2, 168),
  ('NPC-169', 'Mia99', 'AT', 'female', 2, 130, 61, 2, 169),
  ('NPC-170', 'Megan13', 'AU', 'female', 15, 6675, 5, 2, 170),
  ('NPC-171', 'Alice_M', 'IT', 'female', 14, 5263, 50, 2, 171),
  ('NPC-172', 'SkyChaser', 'VE', 'male', 5, 809, 5, 2, 172),
  ('NPC-173', 'Lotte95', 'NL', 'female', 2, 111, 74, 1, 173),
  ('NPC-174', 'Kate80', 'AU', 'female', 27, 19212, 26, 2, 174),
  ('NPC-175', 'Tiago72', 'BR', 'male', 11, 3443, 69, 3, 175),
  ('NPC-176', 'Margaux90', 'FR', 'female', 36, 33882, 50, 1, 176),
  ('NPC-177', 'Beatriz_L', 'BR', 'female', 34, 30795, 81, 2, 177),
  ('NPC-178', 'Loic_M', 'FR', 'male', 20, 10498, 95, 2, 178),
  ('NPC-179', 'AlpineRunner', 'CH', 'female', 21, 12287, 26, 2, 179),
  ('NPC-180', 'Iker_B', 'AR', 'male', 32, 27106, 58, 2, 180),
  ('NPC-181', 'Tobias43', 'DE', 'male', 8, 2143, 39, 1, 181),
  ('NPC-182', 'RidgeStrider', 'FR', 'male', 27, 18980, 72, 2, 182),
  ('NPC-183', 'Iker_H', 'AD', 'male', 4, 573, 31, 2, 183),
  ('NPC-184', 'Alice_P', 'IT', 'female', 32, 26421, 11, 2, 184),
  ('NPC-185', 'Jana89', 'CH', 'female', 2, 104, 48, 3, 185),
  ('NPC-186', 'Rocio42', 'EC', 'female', 10, 3047, 79, 1, 186),
  ('NPC-187', 'NicoLynx', 'MX', 'male', 11, 3321, 64, 2, 187),
  ('NPC-188', 'Diego32', 'CO', 'male', 9, 2257, 83, 3, 188),
  ('NPC-189', 'Ben83', 'IE', 'male', 13, 4788, 31, 2, 189),
  ('NPC-190', 'JanLynx', 'DE', 'male', 21, 11561, 35, 3, 190),
  ('NPC-191', 'Santi79', 'CL', 'male', 29, 22381, 43, 3, 191),
  ('NPC-192', 'Luca78', 'IT', 'male', 41, 43479, 78, 2, 192),
  ('NPC-193', 'Ondra50', 'PL', 'male', 14, 5284, 8, 2, 193),
  ('NPC-194', 'BearRacer', 'SE', 'female', 15, 6590, 32, 2, 194),
  ('NPC-195', 'Olav18', 'NO', 'male', 20, 10543, 52, 2, 195),
  ('NPC-196', 'CarlaDust', 'ES', 'female', 31, 24901, 72, 2, 196),
  ('NPC-197', 'LynxClimber', 'NZ', 'female', 7, 1392, 56, 1, 197),
  ('NPC-198', 'LucaCliff', 'IT', 'male', 30, 24446, 54, 2, 198),
  ('NPC-199', 'DustHopper', 'PE', 'female', 42, 45624, 60, 2, 199),
  ('NPC-200', 'TrailRider', 'ES', 'male', 8, 1936, 95, 2, 200);

-- ranking_race_points data (from src/data/ranking_points.csv and the races' recommended levels)
delete from public.ranking_race_points;
insert into public.ranking_race_points (race_id, recommended_level, points) values
  ('RACE-001', 4, 62),
  ('RACE-002', 6, 102),
  ('RACE-003', 8, 135),
  ('RACE-004', 11, 175),
  ('RACE-005', 14, 225),
  ('RACE-006', 18, 275),
  ('RACE-007', 21, 350),
  ('RACE-008', 25, 450),
  ('RACE-009', 28, 570),
  ('RACE-010', 31, 700),
  ('RACE-011', 40, 910),
  ('RACE-012', 50, 1180);
delete from public.ranking_position_percent;
insert into public.ranking_position_percent (position, percent) values
  (1, 100),
  (2, 85),
  (3, 75),
  (4, 67),
  (5, 60),
  (6, 54),
  (7, 49),
  (8, 45),
  (9, 41),
  (10, 38),
  (11, 35),
  (12, 32),
  (13, 30),
  (14, 28),
  (15, 26),
  (16, 24),
  (17, 22),
  (18, 20),
  (19, 18),
  (20, 16),
  (21, 15),
  (22, 14),
  (23, 13),
  (24, 12),
  (25, 11),
  (26, 10),
  (27, 9),
  (28, 8),
  (29, 7),
  (30, 5);
