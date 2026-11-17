-- Checks for visiting refuges (20261117090000_camp_visits.sql): what a visitor sees of a refuge,
-- visits and congratulations once a day, NPC names, the owner's mailbox, and who may call what.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000c1', jsonb_build_object(
    'athlete', jsonb_build_object('name', 'Ana', 'xp', 100),
    'coins', 999,
    'camp', jsonb_build_object('owned', jsonb_build_array('exterior-5', 'flag', 'secret-buy'), 'using', jsonb_build_array('exterior-5'),
      'slots', jsonb_build_object('exterior:2', 'flag'))), 2),
  ('00000000-0000-0000-0000-0000000000c2', jsonb_build_object('athlete', jsonb_build_object('name', 'Bo', 'xp', 10)), 2);
-- c3 has no career yet.

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect(public.camp_public(' ana ') = jsonb_build_object('name', 'Ana', 'me', false, 'friend', false, 'camp', jsonb_build_object(
  'owned', jsonb_build_array('exterior-5', 'flag'), 'using', jsonb_build_array('exterior-5'), 'slots', jsonb_build_object('exterior:2', 'flag'))),
  'a visitor sees the pieces in use and placed, by name in any case, and nothing else of the career');
select pg_temp.expect(public.camp_public('Bo') = '{"name":"Bo","me":true,"friend":false,"camp":null}'::jsonb, 'their own refuge, without a saved camp');
select pg_temp.expect(public.camp_public('Ghost Runner') = '{"name":"Ghost Runner","me":false,"friend":false,"camp":null}'::jsonb, 'an NPC name gets an empty refuge');
select pg_temp.expect_error($$select public.camp_public('')$$, 'no name');

select pg_temp.expect(public.camp_visit('Ana') = '{"congratulated":false}'::jsonb, 'a visit, not congratulated yet');
select pg_temp.expect(public.camp_visit('Ana', true) = '{"congratulated":true}'::jsonb, 'a congratulation');
select pg_temp.expect(public.camp_visit('ANA', true) = '{"congratulated":true}'::jsonb, 'again the same day: nothing new');
select pg_temp.expect(public.camp_visit('Bo', true) = '{"congratulated":true}'::jsonb, 'oneself: nothing recorded');
select pg_temp.expect(public.camp_visit('Ghost Runner', true) = '{"congratulated":true}'::jsonb, 'an NPC: nothing recorded, same answer');
select pg_temp.expect_error($$select count(*) from public.camp_visits$$, 'players cannot read the table');
select pg_temp.expect_error($$select public.camp_career_of('Ana')$$, 'nor the career lookup');
select pg_temp.expect((select count(*) from public.camp_mailbox()) = 0, 'Bo got no visits');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select array_agg(kind || ':' || name order by kind) from public.camp_mailbox()) = array['congrats:Bo', 'visit:Bo'],
  'Ana sees one visit and one congratulation from Bo');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c3');
select pg_temp.expect_error($$select public.camp_visit('Ana')$$, 'a user without a career cannot visit');

select pg_temp.act_as('anon');
select pg_temp.expect_error($$select public.camp_public('Ana')$$, 'anon cannot read refuges');
select pg_temp.expect_error($$select public.camp_visit('Ana')$$, 'nor visit');
select pg_temp.expect_error($$select * from public.camp_mailbox()$$, 'nor read a mailbox');

reset role;
select pg_temp.expect((select count(*) from public.camp_visits) = 2, 'two rows recorded in all');
