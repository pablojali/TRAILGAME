-- Checks for get_ranking (20261105090000_rankings.sql): best results per season, filters, the
-- caller's own row, and that it is closed to anon.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3');

create function pg_temp.career(who text, runner text, country text, sex text, results jsonb) returns void language sql as $$
  insert into public.profiles (id) values (who::uuid) on conflict do nothing;
  insert into public.careers (user_id, game_state, schema_version)
  values (who::uuid, jsonb_build_object(
    'athlete', jsonb_build_object('name', runner, 'country', country, 'sex', sex, 'xp', 1000),
    'raceEntries', results), 2);
$$;

create function pg_temp.result(season int, points int) returns jsonb language sql as $$
  select jsonb_build_object('status', 'finished', 'result', jsonb_build_object('rankingSeason', season, 'rankingPoints', points))
$$;

select pg_temp.career('00000000-0000-0000-0000-0000000000a1', 'Ana', 'AR', 'female',
  jsonb_build_array(pg_temp.result(1, 100), pg_temp.result(1, 50), pg_temp.result(1, 10), pg_temp.result(2, 999)));
select pg_temp.career('00000000-0000-0000-0000-0000000000a2', 'Bo', 'FR', 'male',
  jsonb_build_array(pg_temp.result(1, 120), '{"status":"finished","result":{}}'::jsonb));
select pg_temp.career('00000000-0000-0000-0000-0000000000a3', 'Cy', 'AR', 'male', '[]'::jsonb);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking(1)) = 'Ana:160,Bo:120',
  'sums each player''s results of the season; players without points are left out');
select pg_temp.expect((select string_agg(name || ':' || points, ',' order by rank) from public.get_ranking(1, null, null, 2)) = 'Ana:150,Bo:120',
  'counts only the best results');
select pg_temp.expect((select string_agg(name, ',') from public.get_ranking(1, 'FR')) = 'Bo', 'filters by country');
select pg_temp.expect((select string_agg(name, ',') from public.get_ranking(1, null, 'female')) = 'Ana', 'filters by sex');
select pg_temp.expect((select is_me from public.get_ranking(1) where name = 'Ana'), 'marks the caller');
select pg_temp.expect((select count(*) from public.get_ranking(1, null, null, 10, 1)) = 1, 'limits the rows');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select string_agg(name, ',' order by rank) from public.get_ranking(1, null, null, 10, 1)) = 'Ana,Bo',
  'always adds the caller''s own row');

select pg_temp.act_as('anon');
select pg_temp.expect_error('select * from public.get_ranking(1)', 'closed to anon');
select pg_temp.expect(true, 'ALL RANKING CHECKS PASSED');
