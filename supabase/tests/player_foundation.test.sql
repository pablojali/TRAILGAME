-- Checks for 20261030120000_player_foundation.sql: career creation, RLS between two players, and
-- that clients cannot write. Run by scripts/test-db.sh on a throwaway local database.
\set ON_ERROR_STOP on

-- Two anonymous players.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

create function pg_temp.act_as(who text) returns void language plpgsql as $$
begin
  if who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', false);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, false);
    execute 'set role authenticated';
  end if;
end $$;

-- A new career as createInitialGameState makes it (trimmed to the fields the function checks).
create function pg_temp.new_career() returns jsonb language sql as $$
  select '{"athlete":{"name":"Ana","xp":0,"spentAttributePoints":0},"week":{"number":1,"currentDayIndex":0},
           "coins":25,"raceEntries":[],"equipment":[],"ownedEquipment":["starter-shoes"]}'::jsonb
$$;

-- Fails the run unless the statement raises an error.
create function pg_temp.expect_error(statement text, label text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED: % (no error)', label;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  raise notice 'ok: % (%)', label, sqlerrm;
end $$;

create function pg_temp.expect(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- 0. RLS is on everywhere and grants only reads, even if table privileges were widened later.
select pg_temp.expect((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.profiles'::regclass, 'public.careers'::regclass, 'public.race_entries'::regclass,
                'public.owned_equipment'::regclass, 'public.coin_transactions'::regclass)), 'RLS enabled on all player tables');
select pg_temp.expect((select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT') = 0,
  'no INSERT, UPDATE or DELETE policies');
-- With write privileges granted back (as Supabase's defaults would), RLS alone still blocks writes.
grant insert, update, delete on public.careers, public.coin_transactions to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$insert into public.careers (user_id, game_state, schema_version)
  values ('00000000-0000-0000-0000-00000000000a', '{}', 2)$$, 'RLS alone blocks inserting a career');
reset role;
revoke insert, update, delete on public.careers, public.coin_transactions from authenticated;

-- 1. Career creation is idempotent and only for signed-in players.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
create temp table a_first as select * from public.create_my_career(pg_temp.new_career(), 2);
create temp table a_again as select * from public.create_my_career(pg_temp.new_career(), 2);
select pg_temp.expect((select created from a_first), 'player A: first call creates the career');
select pg_temp.expect((select not created from a_again), 'player A: second call creates nothing');
select pg_temp.expect((select career_id from a_first) = (select career_id from a_again), 'player A: same career both times');
select pg_temp.expect((select count(*) from public.careers) = 1, 'player A sees exactly one career');
select pg_temp.expect((select array_agg(item_id) from public.owned_equipment) = array['starter-shoes'], 'starter shoes owned');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'player A has a profile');

select pg_temp.expect_error($$select public.create_my_career(jsonb_set(pg_temp.new_career(), '{coins}', '9999'), 2)$$,
  'a career with planted coins is refused');
select pg_temp.expect_error($$select public.create_my_career(jsonb_set(pg_temp.new_career(), '{athlete,xp}', '5000'), 2)$$,
  'a career with planted XP is refused');
select pg_temp.expect_error($$select public.create_my_career(pg_temp.new_career(), 7)$$, 'an unknown schema version is refused');

-- 2. Clients cannot write anything directly.
select pg_temp.expect_error($$insert into public.careers (user_id, game_state, schema_version)
  values ('00000000-0000-0000-0000-00000000000a', '{}', 2)$$, 'player A cannot insert a second career');
select pg_temp.expect_error($$update public.careers set game_state = jsonb_set(game_state, '{coins}', '9999')$$,
  'player A cannot update the career');
select pg_temp.expect_error($$delete from public.careers$$, 'player A cannot delete the career');
select pg_temp.expect_error($$insert into public.coin_transactions (career_id, amount, transaction_type, balance_after)
  select id, 1000, 'cheat', 1025 from public.careers$$, 'player A cannot insert coin transactions');
select pg_temp.expect_error($$update public.coin_transactions set amount = 1$$, 'player A cannot update coin transactions');
select pg_temp.expect_error($$delete from public.coin_transactions$$, 'player A cannot delete coin transactions');
select pg_temp.expect_error($$insert into public.owned_equipment (career_id, item_id)
  select id, 'poles-2' from public.careers$$, 'player A cannot add equipment');
select pg_temp.expect_error($$insert into public.race_entries (career_id, entry_id, race_id, status, entry_data)
  select id, 'entry-9', 'RACE-001', 'finished', '{}' from public.careers$$, 'player A cannot add race entries');
select pg_temp.expect_error($$insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000b')$$,
  'player A cannot create profiles');

-- Server-side data for player A (as the owner role, like a future Edge Function).
reset role;
insert into public.race_entries (career_id, entry_id, race_id, status, entry_data)
select career_id, 'entry-1', 'RACE-001', 'finished', '{"id":"entry-1"}' from a_first;
insert into public.coin_transactions (career_id, amount, transaction_type, reference_id, balance_after)
select career_id, 100, 'race_prize', 'entry-1', 125 from a_first;
select pg_temp.expect_error($$insert into public.race_entries (career_id, entry_id, race_id, status, entry_data)
  select career_id, 'entry-1', 'RACE-001', 'pending', '{}' from a_first$$, 'a duplicate race entry is refused');
select pg_temp.expect_error($$insert into public.careers (user_id, game_state, schema_version)
  values ('00000000-0000-0000-0000-00000000000a', '{}', 2)$$, 'a second career for the same user is refused by the database');

-- 3. Player B sees nothing of player A.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.careers) = 0, 'player B cannot read player A''s career');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'player B cannot read player A''s profile');
select pg_temp.expect((select count(*) from public.race_entries) = 0, 'player B cannot read player A''s race entries');
select pg_temp.expect((select count(*) from public.owned_equipment) = 0, 'player B cannot read player A''s equipment');
select pg_temp.expect((select count(*) from public.coin_transactions) = 0, 'player B cannot read player A''s coins');
create temp table b_first as select * from public.create_my_career(pg_temp.new_career(), 2);
select pg_temp.expect((select created from b_first), 'player B gets a career of their own');
select pg_temp.expect((select count(*) from public.careers) = 1, 'player B sees only their own career');

-- Player A still sees their own rows.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.race_entries) = 1, 'player A reads their race entry');
select pg_temp.expect((select count(*) from public.coin_transactions) = 1, 'player A reads their coin transaction');

-- 4. Signed-out visitors (anon key, no session) get nothing.
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select count(*) from public.careers$$, 'anon cannot read careers');
select pg_temp.expect_error($$select public.create_my_career(pg_temp.new_career(), 2)$$, 'anon cannot create a career');

-- 5. Deleting the auth user deletes all of the player's data.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.careers where user_id = '00000000-0000-0000-0000-00000000000a') = 0,
  'deleting the user deletes the career');
select pg_temp.expect((select count(*) from public.coin_transactions) = 0, 'and its coin transactions');
select pg_temp.expect((select count(*) from public.race_entries) = 0, 'and its race entries');
select pg_temp.expect((select count(*) from public.careers) = 1, 'player B''s career is untouched');

\echo 'ALL DATABASE CHECKS PASSED'
