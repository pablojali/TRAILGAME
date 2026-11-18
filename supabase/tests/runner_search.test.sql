-- Checks for searching runners (20261118110000_runner_search.sql): players and NPCs alike, not
-- oneself, at least 2 characters, % and _ typed as themselves, names starting with the query first.
\set ON_ERROR_STOP on

delete from public.ranking_npcs;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000d1', '{"athlete":{"name":"Martina","country":"AR","xp":300}}', 2),
  ('00000000-0000-0000-0000-0000000000d2', '{"athlete":{"name":"Ana Mar","country":"ES","xp":20}}', 2),
  ('00000000-0000-0000-0000-0000000000d3', '{"athlete":{"name":"50%_Run"}}', 2);
insert into public.ranking_npcs (id, name, country, sex, level, xp, strength, races_per_week, list_order) values
  ('npc-1', 'Marco Polo', 'IT', 'male', 5, 900, 50, 2, 1);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select pg_temp.expect((select array_agg(name || ':' || coalesce(country, '') || ':' || xp) from public.runner_search('  MAR ')) = array['Marco Polo:IT:900', 'Martina:AR:300'],
  'players and NPCs, names starting with the query first, never oneself');
select pg_temp.expect((select count(*) from public.runner_search('%_')) = 1, '% and _ match themselves');
select pg_temp.expect((select count(*) from public.runner_search('zz')) = 0, 'nothing found');
select pg_temp.expect_error($$select * from public.runner_search('m')$$, 'at least two characters');

select pg_temp.act_as('anon');
select pg_temp.expect_error($$select * from public.runner_search('mar')$$, 'anon cannot search');
reset role;
