-- Checks for commit_career (20261031090000_server_authority.sql): version check, idempotent
-- operations, the race_entries/owned_equipment mirror and snapshot checks. Run as the service
-- role, as the Edge Function does.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');

select pg_temp.act_as('service');

-- 1. Creation and version check.
create temp table r1 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', null,
  pg_temp.snapshot(60, '[]', '["starter-shoes"]'), 2, null, 'save', null);
select pg_temp.expect((select status = 'saved' and version = 1 from r1), 'creates version 1');
create temp table r2 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 1,
  pg_temp.snapshot(80, '[{"id":"entry-1","raceId":"RACE-001","status":"finished"}]', '["starter-shoes","poles-1"]'),
  2, '11111111-1111-1111-1111-111111111111', 'train', '{"outcome":"ok"}');
select pg_temp.expect((select status = 'saved' and version = 2 from r2), 'writes on the current version (version 2)');
select pg_temp.expect((select response ->> 'version' = '2' and response ->> 'outcome' = 'ok' from r2), 'returns the response with the version');
create temp table r3 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 1,
  pg_temp.snapshot(5, '[]', '["starter-shoes"]'), 2, '22222222-2222-2222-2222-222222222222', 'train', '{}');
select pg_temp.expect((select status = 'conflict' and version = 2 from r3), 'a stale write is refused (conflict, version 2)');
select pg_temp.expect((select (game_state ->> 'coins')::int = 80 from public.careers c
  where c.user_id = '00000000-0000-0000-0000-0000000000c1'), 'the stale write changed nothing');
create temp table r4 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', null,
  pg_temp.snapshot(5, '[]', '[]'), 2, null, 'save', null);
select pg_temp.expect((select status = 'conflict' from r4), 'a create cannot replace an existing career');

-- 2. Idempotent operations: the same id is answered from the record, never applied twice.
create temp table r5 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 2,
  pg_temp.snapshot(999, '[]', '["starter-shoes"]'), 2, '11111111-1111-1111-1111-111111111111', 'train', '{"outcome":"again"}');
select pg_temp.expect((select status = 'duplicate' and response ->> 'outcome' = 'ok' from r5),
  'a repeated operation id returns the first response');
select pg_temp.expect((select version = 2 and (game_state ->> 'coins')::int = 80 from public.careers c
  where c.user_id = '00000000-0000-0000-0000-0000000000c1'), 'and changes nothing');
select pg_temp.expect((select count(*) = 1 from public.career_operations), 'one operation recorded (conflicts record none)');
create temp table r6 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c2', null,
  pg_temp.snapshot(25, '[]', '[]'), 2, '11111111-1111-1111-1111-111111111111', 'train', '{}');
select pg_temp.expect((select status = 'foreign-operation' from r6), 'another player cannot reuse an operation id');
select pg_temp.expect((select count(*) = 0 from public.careers where user_id = '00000000-0000-0000-0000-0000000000c2'),
  'and nothing was created for them');

-- 3. The mirror tables follow the snapshot.
select pg_temp.expect((select count(*) = 1 from public.race_entries where entry_id = 'entry-1'), 'race entry mirrored');
select pg_temp.expect((select array_agg(item_id order by item_id) = array['poles-1', 'starter-shoes'] from public.owned_equipment),
  'owned equipment mirrored');
create temp table r7 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 2,
  pg_temp.snapshot(80, '[]', '["starter-shoes"]'), 2, null, 'save', null);
select pg_temp.expect((select count(*) = 0 from public.race_entries), 'race entries removed with the snapshot');

-- 4. Malformed or unsupported snapshots are refused.
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-0000000000c1', 3,
  pg_temp.snapshot(80, '[]', '[]'), 3, null, 'save', null)$$, 'schema version 3 refused');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-0000000000c1', 3,
  '{"coins":5}', 2, null, 'save', null)$$, 'a snapshot without athlete refused');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-0000000000c1', 3,
  pg_temp.snapshot(-5, '[]', '[]'), 2, null, 'save', null)$$, 'negative coins refused');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-0000000000c1', 3,
  pg_temp.snapshot(5, '[{"id":"e","raceId":"R","status":"finished"},{"id":"e","raceId":"R","status":"pending"}]', '[]'),
  2, null, 'save', null)$$, 'duplicate race entry ids refused');
select pg_temp.expect_error($$select public.commit_career(null, null, pg_temp.snapshot(5, '[]', '[]'), 2, null, 'save', null)$$,
  'a write without a user refused');
reset role;
select pg_temp.expect((select version = 3 from public.careers where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'refused writes changed nothing');

-- 5. Economy operations (Phase 3B.2) are recorded like the others; unknown kinds are refused.
select pg_temp.act_as('service');
create temp table r8 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 3,
  pg_temp.snapshot(45, '[]', '["starter-shoes","poles"]'), 2, '33333333-3333-3333-3333-333333333333', 'buy', '{}');
select pg_temp.expect((select status = 'saved' and version = 4 from r8), 'a purchase is committed (version 4)');
create temp table r9 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 4,
  pg_temp.snapshot(0, '[]', '["starter-shoes","poles"]'), 2, '33333333-3333-3333-3333-333333333333', 'buy', '{}');
select pg_temp.expect((select status = 'duplicate' and version = 4 from r9), 'a repeated purchase is not charged again');
select pg_temp.expect((select (game_state ->> 'coins')::int = 45 from public.careers c
  where c.user_id = '00000000-0000-0000-0000-0000000000c1'), 'coins unchanged by the repeat');
create temp table r10 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 4,
  pg_temp.snapshot(45, '[{"id":"entry-2","raceId":"RACE-004","status":"pending"}]', '["starter-shoes","poles"]'),
  2, '44444444-4444-4444-4444-444444444444', 'enter-race', '{}');
select pg_temp.expect((select status = 'saved' from r10), 'a race entry is committed');
create temp table r11 as select * from public.commit_career('00000000-0000-0000-0000-0000000000c1', 5,
  pg_temp.snapshot(45, '[]', '["starter-shoes","poles"]'), 2, '55555555-5555-5555-5555-555555555555', 'equip', '{}');
select pg_temp.expect((select status = 'saved' from r11), 'an equipment change is committed');
select pg_temp.expect_error($$select public.commit_career('00000000-0000-0000-0000-0000000000c1', 6,
  pg_temp.snapshot(45, '[]', '[]'), 2, '66666666-6666-6666-6666-666666666666', 'free-coins', '{}')$$,
  'an unknown operation kind is refused');
reset role;
select pg_temp.expect((select count(*) = 0 from public.career_operations where kind = 'free-coins'), 'and nothing recorded');

-- 6. Helpers are not callable by players.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select public.is_career_snapshot('{}')$$, 'players cannot call is_career_snapshot');
select pg_temp.expect_error($$select public.sync_career_rows(gen_random_uuid(), '{}')$$, 'players cannot call sync_career_rows');
reset role;

\echo 'ALL SERVER AUTHORITY CHECKS PASSED'
