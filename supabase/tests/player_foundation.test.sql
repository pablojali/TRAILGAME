-- Checks for the player tables and RLS (20261030170516_player_foundation.sql, as changed by
-- 20261031090000_server_authority.sql): players read only their own rows and cannot write.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 0. RLS is on everywhere and grants only reads, even if table privileges were widened later.
select pg_temp.expect((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.profiles'::regclass, 'public.careers'::regclass, 'public.race_entries'::regclass,
                'public.owned_equipment'::regclass, 'public.coin_transactions'::regclass,
                'public.career_operations'::regclass)), 'RLS enabled on all player tables');
select pg_temp.expect((select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT') = 0,
  'no INSERT, UPDATE or DELETE policies');
grant insert, update, delete on public.careers, public.coin_transactions to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$insert into public.careers (user_id, game_state, schema_version)
  values ('00000000-0000-0000-0000-00000000000a', '{}', 2)$$, 'RLS alone blocks inserting a career');
reset role;
revoke insert, update, delete on public.careers, public.coin_transactions from authenticated;

-- Player A's career, written as the server does (service role through commit_career).
select pg_temp.act_as('service');
create temp table a_first as select * from public.commit_career('00000000-0000-0000-0000-00000000000a', null,
  pg_temp.snapshot(25, '[{"id":"entry-1","raceId":"RACE-001","status":"finished"}]', '["starter-shoes"]'), 2, null, 'save', null);
reset role;
select pg_temp.expect((select status = 'saved' and version = 1 from a_first), 'the server creates player A''s career');
insert into public.coin_transactions (career_id, amount, transaction_type, reference_id, balance_after)
select c.id, 100, 'race_prize', 'entry-1', 125 from public.careers c;

-- 1. Players have no write path at all.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.careers), 'player A reads their career');
select pg_temp.expect((select count(*) = 1 from public.race_entries), 'player A reads their race entry');
select pg_temp.expect((select count(*) = 1 from public.coin_transactions), 'player A reads their coin transaction');
select pg_temp.expect((select count(*) = 1 from public.owned_equipment), 'player A reads their equipment');
select pg_temp.expect_error($$update public.careers set game_state = jsonb_set(game_state, '{athlete,xp}', '99999')$$,
  'player A cannot update the career (XP)');
select pg_temp.expect_error($$insert into public.careers (user_id, game_state, schema_version)
  values ('00000000-0000-0000-0000-00000000000a', '{}', 2)$$, 'player A cannot insert a second career');
select pg_temp.expect_error($$delete from public.careers$$, 'player A cannot delete the career');
select pg_temp.expect_error($$insert into public.coin_transactions (career_id, amount, transaction_type, balance_after)
  select id, 1000, 'cheat', 1025 from public.careers$$, 'player A cannot insert coin transactions');
select pg_temp.expect_error($$insert into public.owned_equipment (career_id, item_id)
  select id, 'poles-2' from public.careers$$, 'player A cannot add equipment');
select pg_temp.expect_error($$insert into public.race_entries (career_id, entry_id, race_id, status, entry_data)
  select id, 'entry-9', 'RACE-001', 'finished', '{}' from public.careers$$, 'player A cannot add race entries');
select pg_temp.expect_error($$insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000b')$$,
  'player A cannot create profiles');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-00000000000a', 1,
  pg_temp.snapshot(25, '[]', '[]', 99999), 2, null, 'save', null)$$, 'player A cannot call commit_career');
select pg_temp.expect_error($$select * from public.career_operations$$, 'player A cannot read operations');
select pg_temp.expect((select count(*) = 0 from pg_proc where proname in ('save_my_career', 'create_my_career')),
  'the old client-callable writers are gone');

-- 2. Player B sees nothing of player A.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.careers) = 0, 'player B cannot read player A''s career');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'player B cannot read player A''s profile');
select pg_temp.expect((select count(*) from public.race_entries) = 0, 'player B cannot read player A''s race entries');
select pg_temp.expect((select count(*) from public.owned_equipment) = 0, 'player B cannot read player A''s equipment');
select pg_temp.expect((select count(*) from public.coin_transactions) = 0, 'player B cannot read player A''s coins');

-- 3. Signed-out visitors get nothing.
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select count(*) from public.careers$$, 'anon cannot read careers');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-00000000000a', 1,
  pg_temp.snapshot(25, '[]', '[]'), 2, null, 'save', null)$$, 'anon cannot call commit_career');
reset role;

-- 4. Deleting the auth user deletes all of the player's data.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.careers) = 0, 'deleting the user deletes the career');
select pg_temp.expect((select count(*) from public.coin_transactions) = 0, 'and its coin transactions');
select pg_temp.expect((select count(*) from public.race_entries) = 0, 'and its race entries');

\echo 'ALL DATABASE CHECKS PASSED'
