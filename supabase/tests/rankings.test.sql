-- Checks for the rankings (20261105090000_rankings.sql): the results table filled by the careers
-- trigger and kept when a career restarts, the season and annual rankings, filters, the caller's
-- own row, and that players cannot touch the table or anon the function.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3');

-- A finished entry with ranking fields; `days_ago` sets when the server finished it.
create function pg_temp.result(id text, season int, points int, days_ago int) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'raceId', 'RACE-001', 'status', 'finished', 'result', jsonb_build_object(
    'rankingSeason', season, 'rankingPoints', points,
    'rankingAt', (extract(epoch from now() - make_interval(days => days_ago)) * 1000)::bigint))
$$;

create function pg_temp.athlete(runner text, country text, sex text) returns jsonb language sql as $$
  select jsonb_build_object('name', runner, 'country', country, 'sex', sex, 'xp', 1000)
$$;

-- The current season, and one 13 months ago (out of the annual window).
create temp table s as select
  (extract(year from now() at time zone 'UTC')::int * 100 + extract(month from now() at time zone 'UTC')::int) as now_season,
  (extract(year from (now() - interval '13 months') at time zone 'UTC')::int * 100
   + extract(month from (now() - interval '13 months') at time zone 'UTC')::int) as old_season;
grant select on s to authenticated;

insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000a1', jsonb_build_object('athlete', pg_temp.athlete('Ana', 'AR', 'female'), 'raceEntries',
    jsonb_build_array(pg_temp.result('entry-1', (select now_season from s), 100, 0), pg_temp.result('entry-2', (select now_season from s), 50, 0),
      pg_temp.result('entry-3', (select now_season from s), 10, 0), pg_temp.result('entry-4', (select old_season from s), 999, 400))), 2),
  ('00000000-0000-0000-0000-0000000000a2', jsonb_build_object('athlete', pg_temp.athlete('Bo', 'FR', 'male'), 'raceEntries',
    jsonb_build_array(pg_temp.result('entry-1', (select now_season from s), 120, 0), '{"id":"entry-2","status":"finished","result":{}}'::jsonb)), 2),
  ('00000000-0000-0000-0000-0000000000a3', jsonb_build_object('athlete', pg_temp.athlete('Cy', 'AR', 'male'), 'raceEntries', '[]'::jsonb), 2);

select pg_temp.expect((select count(*) from public.ranking_results) = 5, 'the trigger records every ranked result, and only those');

-- A restarted career keeps its recorded results.
update public.careers set game_state = jsonb_build_object('athlete', pg_temp.athlete('Bo', 'FR', 'male'), 'raceEntries', '[]'::jsonb)
where user_id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect((select count(*) from public.ranking_results where user_id = '00000000-0000-0000-0000-0000000000a2') = 1,
  'a restarted career keeps its results');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking('season', (select now_season from s))) = 'Ana:160,Bo:120',
  'season: sums each player''s results of the season; players without points are left out');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking('season', (select now_season from s), null, null, 2)) = 'Ana:150,Bo:120',
  'season: counts only the best results');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking('annual')) = 'Ana:160,Bo:120',
  'annual: results older than 12 months no longer count');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking('annual', null, null, null, 10, 50, 24)) = 'Ana:1159,Bo:120',
  'annual: a longer window counts the older season too');
select pg_temp.expect((select string_agg(name, ',') from public.get_ranking('season', (select now_season from s), 'FR')) = 'Bo', 'filters by country');
select pg_temp.expect((select string_agg(name, ',') from public.get_ranking('annual', null, null, 'female')) = 'Ana', 'filters by sex');
select pg_temp.expect((select is_me from public.get_ranking('annual') where name = 'Ana'), 'marks the caller');
select pg_temp.expect_error('select * from public.ranking_results', 'players cannot read the results table');
select pg_temp.expect_error($$insert into public.ranking_results values ('00000000-0000-0000-0000-0000000000a1', 'x', 'RACE-001', 202611, now(), 99999)$$,
  'players cannot write the results table');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select string_agg(name, ',' order by rank) from public.get_ranking('annual', null, null, null, 10, 1)) = 'Ana,Bo',
  'always adds the caller''s own row');

select pg_temp.act_as('anon');
select pg_temp.expect_error('select * from public.get_ranking(''annual'')', 'closed to anon');
select pg_temp.expect(true, 'ALL RANKING CHECKS PASSED');
