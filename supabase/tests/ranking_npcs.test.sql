-- Checks for the NPC runners in the rankings (20261105160000_ranking_npcs.sql): their drawn results,
-- that they rank beside the players, that each real player retires one NPC of the same country, and
-- that players cannot touch their tables.
\set ON_ERROR_STOP on

select pg_temp.expect((select count(*) from public.ranking_npcs) = 200, 'the migration loads the 200 NPC runners');
select pg_temp.expect((select count(*) from public.ranking_race_points) = 17 and (select count(*) from public.ranking_position_percent) = 30,
  'the migration loads the race points and the position percents');

create temp table a as select * from public.npc_ranking_results(date '2026-11-01');
create temp table b as select * from public.npc_ranking_results(date '2026-11-01');
select pg_temp.expect((select count(*) from a) > 0, 'NPCs have results from Season 11 · 2026');
select pg_temp.expect(not exists (select * from a except select * from b) and (select count(*) from a) = (select count(*) from b),
  'the results are the same on every call');
select pg_temp.expect(not exists (select 1 from a where finished_at > now() or finished_at < timestamptz '2026-11-01 00:00+00'),
  'no result in the future or before the first season');
select pg_temp.expect(not exists (select 1 from a where season <> extract(year from finished_at at time zone 'UTC')::int * 100
  + extract(month from finished_at at time zone 'UTC')::int), 'each result is in the season of its day');
select pg_temp.expect((select max(points) from a) <= 250 and (select min(points) from a) >= 0, 'points stay within the difficulty table (V: 250)');
-- Points system v3: every NPC result is a difficulty base × a position percent, with no level factor.
select pg_temp.expect(not exists (
  select 1 from a where points not in (
    select round(rp.points * pp.percent / 100.0)::integer from public.ranking_race_points rp cross join public.ranking_position_percent pp)),
  'NPC points are base × position percent, never scaled by level');
select pg_temp.expect((select count(*) from public.npc_ranking_results(date '2020-01-01')) = (select count(*) from a),
  'never before the first season');

-- The entry window: an NPC above every race's window (level 60) still races the hardest race,
-- and one of level 34 (between windows) races RACE-010.
insert into public.ranking_npcs values ('W-60', 'Top', 'NZ', 'male', 60, 90000, 95, 7, 900), ('W-34', 'Gap', 'NZ', 'male', 34, 30000, 95, 7, 901);
select pg_temp.expect((select max(points) from public.npc_ranking_results(date '2026-11-01') where npc_id = 'W-60') = 250,
  'an NPC above every window races the hardest race (Difficulty V)');
select pg_temp.expect((select max(points) from public.npc_ranking_results(date '2026-11-01') where npc_id = 'W-34') <= 200,
  'an NPC of level 34 races within its reach (up to Difficulty IV)');

-- Controlled runners: three in Uruguay who race every day, one who never races.
delete from public.ranking_npcs;
insert into public.ranking_npcs values
  ('T-1', 'UyOne', 'UY', 'male', 50, 60000, 95, 7, 1),
  ('T-2', 'UyTwo', 'UY', 'female', 10, 3000, 50, 7, 2),
  ('T-3', 'UyThree', 'UY', 'male', 3, 300, 10, 7, 3),
  ('T-4', 'Never', 'UY', 'male', 30, 20000, 90, 0, 4);
create temp table s as select
  (extract(year from now() at time zone 'UTC')::int * 100 + extract(month from now() at time zone 'UTC')::int) as now_season;
grant select on s to authenticated;
select pg_temp.expect((select count(distinct npc_id) from public.npc_ranking_results(date '2026-11-01')) = 3,
  'an NPC with 0 races per week never races');

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000b1', jsonb_build_object('athlete', jsonb_build_object('name', 'Real', 'country', 'UY', 'sex', 'male', 'xp', 100),
    'raceEntries', '[]'::jsonb), 2);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select string_agg(name, ',' order by rank) from public.get_ranking('season', (select now_season from s))) = 'UyOne,UyTwo,UyThree',
  'NPCs rank by their points; a player without points retires nobody');
select pg_temp.expect((select bool_and(not is_me) and min(xp) = 300 from public.get_ranking('season', (select now_season from s))),
  'NPC rows show their XP and are never the caller');
select pg_temp.expect((select string_agg(name, ',' order by rank) from public.get_ranking('annual', null, 'UY', 'female')) = 'UyOne,UyTwo,UyThree',
  'NPCs follow the country filter, and men and women share one classification');
reset role;

-- The player gets ranking points: the first Uruguayan NPC of the list retires.
update public.careers set game_state = jsonb_set(game_state, '{raceEntries}', jsonb_build_array(jsonb_build_object('id', 'e1', 'raceId', 'RACE-001',
  'status', 'finished', 'result', jsonb_build_object('rankingSeason', (select now_season from s), 'rankingPoints', 1,
  'rankingAt', (extract(epoch from now()) * 1000)::bigint))))
where user_id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select string_agg(name, ',' order by rank) from public.get_ranking('season', (select now_season from s))) = 'UyTwo,UyThree,Real',
  'a real player with points retires the first NPC of the same country');
select pg_temp.expect((select is_me from public.get_ranking('season', (select now_season from s)) where name = 'Real'), 'marks the caller');
reset role;

-- A player of another country retires nobody in Uruguay.
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000b2', jsonb_build_object('athlete', jsonb_build_object('name', 'Fra', 'country', 'FR', 'sex', 'female', 'xp', 100),
    'raceEntries', jsonb_build_array(jsonb_build_object('id', 'e1', 'raceId', 'RACE-001', 'status', 'finished', 'result',
      jsonb_build_object('rankingSeason', (select now_season from s), 'rankingPoints', 1, 'rankingAt', (extract(epoch from now()) * 1000)::bigint)))), 2);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((select count(*) from public.get_ranking('season', (select now_season from s), 'UY')) = 3,
  'players of other countries retire nobody here');

select pg_temp.expect_error('select * from public.ranking_npcs', 'players cannot read the NPC table');
select pg_temp.expect_error('select * from public.ranking_race_points', 'players cannot read the race points table');
select pg_temp.expect_error('select * from public.npc_ranking_results(date ''2026-11-01'')', 'players cannot call npc_ranking_results');
select pg_temp.act_as('anon');
select pg_temp.expect_error('select * from public.get_ranking(''annual'')', 'closed to anon');
select pg_temp.expect(true, 'ALL RANKING NPC CHECKS PASSED');
