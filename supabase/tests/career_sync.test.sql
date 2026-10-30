-- Checks for 20261030200000_career_sync.sql: snapshot saves with optimistic concurrency, shape
-- checks, the race_entries/owned_equipment mirror, and access. Run by scripts/test-db.sh.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');

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

-- A progressed career snapshot (only the fields the database checks, plus race entries).
create function pg_temp.snapshot(coins int, entries jsonb, owned jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'athlete', '{"name":"Ana","profile":"climber","xp":350}'::jsonb,
    'week', '{"number":3,"currentDayIndex":2,"days":[{},{},{},{},{},{},{}]}'::jsonb,
    'coins', coins, 'raceEntries', entries, 'equipment', '[]'::jsonb, 'ownedEquipment', owned)
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');

-- 1. First upload creates the career; later saves need the current version.
create temp table r1 as select * from public.save_my_career(pg_temp.snapshot(60, '[]', '["starter-shoes"]'), 2, null);
select pg_temp.expect((select saved and version = 1 from r1), 'first upload (no cloud career) creates version 1');
create temp table r2 as select * from public.save_my_career(pg_temp.snapshot(80,
  '[{"id":"entry-1","raceId":"RACE-001","status":"finished"}]', '["starter-shoes","poles-1"]'), 2, 1);
select pg_temp.expect((select saved and version = 2 from r2), 'a save on the current version succeeds (version 2)');
create temp table r3 as select * from public.save_my_career(pg_temp.snapshot(10, '[]', '["starter-shoes"]'), 2, 1);
select pg_temp.expect((select not saved and version = 2 from r3), 'a stale save (base 1) is refused and reports version 2');
select pg_temp.expect((select (game_state ->> 'coins')::int = 80 from public.careers), 'the stale save changed nothing');
create temp table r4 as select * from public.save_my_career(pg_temp.snapshot(10, '[]', '["starter-shoes"]'), 2, null);
select pg_temp.expect((select not saved and version = 2 from r4), 'a device that knows no cloud career cannot replace one');
select pg_temp.expect((select count(*) = 1 from public.careers), 'still one career');

-- 2. The mirror tables follow the snapshot.
select pg_temp.expect((select count(*) = 1 from public.race_entries where entry_id = 'entry-1' and status = 'finished'),
  'race entry mirrored');
select pg_temp.expect((select array_agg(item_id order by item_id) = array['poles-1', 'starter-shoes'] from public.owned_equipment),
  'owned equipment mirrored');
create temp table r5 as select * from public.save_my_career(pg_temp.snapshot(80, '[]', '["starter-shoes"]'), 2, 2);
select pg_temp.expect((select saved and version = 3 from r5), 'version 3 saved');
select pg_temp.expect((select count(*) = 0 from public.race_entries), 'race entries removed with the snapshot');
select pg_temp.expect((select array_agg(item_id) = array['starter-shoes'] from public.owned_equipment), 'equipment removed with the snapshot');

-- 3. Malformed or unsupported snapshots are refused.
select pg_temp.expect_error($$select public.save_my_career(pg_temp.snapshot(80, '[]', '[]'), 3, 3)$$, 'schema version 3 refused');
select pg_temp.expect_error($$select public.save_my_career('{"coins":5}', 2, 3)$$, 'a snapshot without athlete refused');
select pg_temp.expect_error($$select public.save_my_career(pg_temp.snapshot(-5, '[]', '[]'), 2, 3)$$, 'negative coins refused');
select pg_temp.expect_error($$select public.save_my_career(pg_temp.snapshot(5,
  '[{"id":"entry-1","raceId":"RACE-001","status":"finished"},{"id":"entry-1","raceId":"RACE-002","status":"pending"}]', '[]'), 2, 3)$$,
  'duplicate race entry ids refused');
select pg_temp.expect_error($$select public.save_my_career(pg_temp.snapshot(5,
  '[{"id":"entry-1","raceId":"RACE-001","status":"won"}]', '[]'), 2, 3)$$, 'unknown race status refused');
select pg_temp.expect((select version = 3 from public.careers), 'refused saves changed nothing');

-- 4. Helpers are not callable by players; direct writes are still refused.
select pg_temp.expect_error($$select public.is_career_snapshot('{}')$$, 'players cannot call is_career_snapshot');
select pg_temp.expect_error($$select public.sync_career_rows(gen_random_uuid(), '{}')$$, 'players cannot call sync_career_rows');
select pg_temp.expect_error($$update public.careers set version = 99$$, 'players still cannot update careers directly');

-- 5. Another player saves only their own career.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
create temp table b1 as select * from public.save_my_career(pg_temp.snapshot(25, '[]', '["starter-shoes"]'), 2, 3);
select pg_temp.expect((select not saved and version is null from b1), 'player B cannot write with player A''s version');
select pg_temp.expect((select count(*) = 0 from public.careers), 'player B sees no career');
create temp table b2 as select * from public.save_my_career(pg_temp.snapshot(25, '[]', '["starter-shoes"]'), 2, null);
select pg_temp.expect((select saved and version = 1 from b2), 'player B creates their own career');
reset role;
select pg_temp.expect((select (game_state ->> 'coins')::int = 80 and version = 3 from public.careers
  where user_id = '00000000-0000-0000-0000-0000000000c1'), 'player A''s career is untouched');

-- 6. Signed-out visitors cannot save.
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select public.save_my_career(pg_temp.snapshot(25, '[]', '[]'), 2, null)$$, 'anon cannot save');
reset role;

\echo 'ALL CAREER SYNC CHECKS PASSED'
