-- Checks for Major registration and the grid (20261112090000_major_registrations.sql): the
-- registration window, frozen level and category, duplicates, the main list and the waiting list,
-- withdrawal and promotion, the plan, READY, the lock with absences and NPCs, the clock, and access.
\set ON_ERROR_STOP on

-- Two bands of 3 places each, to test the limits with few rows.
update public.major_config set participant_limit = 3,
  bands = '[{"name":"Banda 1","min":1,"max":8},{"name":"Banda 2","min":9,"max":null}]';

insert into auth.users (id)
select ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid from generate_series(1, 9) n;

-- An event starting in 2 days: published now, registration opens now (SCHEDULED until the clock runs).
insert into public.major_events (id, name, race_id, scheduled_start_at)
values ('00000000-0000-0000-0000-00000000f001', 'Major', 'RACE-002', now() + interval '2 days');
select public.major_publish('00000000-0000-0000-0000-00000000f001', null, now());

create function pg_temp.u(n integer) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid
$$;
create function pg_temp.reg(n integer, lvl integer) returns public.major_registrations language sql as $$
  select public.major_register('00000000-0000-0000-0000-00000000f001', pg_temp.u(n), lvl, 'Runner ' || n, 'AR', now())
$$;

select pg_temp.expect_error($$select pg_temp.reg(1, 3)$$, 'no registration before the event opens it');
select pg_temp.expect(public.major_advance(now()) = 1, 'the clock opens registration');
select pg_temp.expect((select status = 'REGISTRATION_OPEN' from public.major_events where id = '00000000-0000-0000-0000-00000000f001'), 'registration is open');

-- Band 1: four runners for three places.
select pg_temp.expect((select list = 'main' and level = 3 from pg_temp.reg(1, 3)), 'first runner on the main list, level frozen');
select pg_temp.reg(2, 5);
select pg_temp.reg(3, 8);
select pg_temp.expect((select list = 'waitlist' from pg_temp.reg(4, 1)), 'the fourth goes to the waiting list');
select pg_temp.expect_error($$select pg_temp.reg(1, 3)$$, 'one registration per runner');
select pg_temp.expect((select c.idx = 2 from pg_temp.reg(5, 20) r join public.major_categories c on c.id = r.category_id), 'the level sets the category');

-- Withdrawing promotes the first of the waiting list; registering again goes to the back.
select public.major_withdraw('00000000-0000-0000-0000-00000000f001', pg_temp.u(2), now());
select pg_temp.expect((select list = 'main' from public.major_registrations where user_id = pg_temp.u(4)), 'the waiting list moves up');
select pg_temp.expect((select list = 'waitlist' from pg_temp.reg(2, 5)), 'registering again queues at the back');

-- Plan and READY.
select public.major_save_plan('00000000-0000-0000-0000-00000000f001', pg_temp.u(1), '{"style":"balanced","segments":[{"intensity":"target","stop":"normal"}]}', now());
select pg_temp.expect((select plan ->> 'style' = 'balanced' from public.major_registrations where user_id = pg_temp.u(1)), 'the plan is saved');
select pg_temp.expect_error($$select public.major_set_ready('00000000-0000-0000-0000-00000000f001', pg_temp.u(1), '{}', now())$$, 'READY waits for its window');

-- Move the clock to the READY window (the event's times are frozen, so the calls take a later now).
create temp table t as select ready_open_at + interval '1 minute' as ready_now, scheduled_start_at as start_at
from public.major_events where id = '00000000-0000-0000-0000-00000000f001';
select pg_temp.expect_error($$select public.major_register('00000000-0000-0000-0000-00000000f001', pg_temp.u(6), 4, 'Late', null, (select ready_now from t))$$, 'registration closes when READY opens');
select public.major_set_ready('00000000-0000-0000-0000-00000000f001', pg_temp.u(n), jsonb_build_object('fatigue', n), (select ready_now from t))
from (values (1), (2), (4)) v (n);
select pg_temp.expect_error($$select public.major_set_ready('00000000-0000-0000-0000-00000000f001', pg_temp.u(9), '{}', (select ready_now from t))$$, 'READY needs a registration');

-- The lock does nothing before the start, then builds the grids at the start.
select pg_temp.expect(public.major_lock('00000000-0000-0000-0000-00000000f001', (select ready_now from t)) = 0, 'no lock before the start');
select pg_temp.expect(public.major_advance((select start_at from t)) = 1, 'the clock locks the grid at the start');
select pg_temp.expect((select status = 'LOCKED' from public.major_events where id = '00000000-0000-0000-0000-00000000f001'), 'the event is locked');
select pg_temp.expect(public.major_lock('00000000-0000-0000-0000-00000000f001', (select start_at from t)) = 0, 'locking twice does nothing');

-- Band 1: runners 1 and 4 (main, READY) and 2 (waiting list, READY) race; 3 never confirmed.
select pg_temp.expect((select array_agg(p.user_id order by p.slot) = array[pg_temp.u(1), pg_temp.u(4), pg_temp.u(2)]
  from public.major_participants p join public.major_categories c on c.id = p.category_id
  where c.event_id = '00000000-0000-0000-0000-00000000f001' and c.idx = 1), 'READY main list first, then the waiting list');
select pg_temp.expect((select status = 'ABSENT' from public.major_registrations where user_id = pg_temp.u(3)), 'not READY at the start: absent');
select pg_temp.expect((select status = 'ABSENT' from public.major_registrations where user_id = pg_temp.u(5)), 'band 2: registered but not READY');
select pg_temp.expect((select count(*) = 3 and count(*) filter (where kind = 'NPC') = 3 and min(level) >= 9
  from public.major_participants p join public.major_categories c on c.id = p.category_id
  where c.event_id = '00000000-0000-0000-0000-00000000f001' and c.idx = 2), 'band 2: three NPCs of the band');
select pg_temp.expect((select bool_and(n = 3) from (select count(*) n from public.major_participants
  where event_id = '00000000-0000-0000-0000-00000000f001' group by category_id) s), 'every category has exactly the limit');
select pg_temp.expect((select runner_snapshot ->> 'fatigue' = '1' from public.major_participants where user_id = pg_temp.u(1)), 'the READY snapshot goes into the grid');
select pg_temp.expect_error($$select pg_temp.reg(7, 3)$$, 'no registration once locked');
select pg_temp.expect_error($$select public.major_withdraw('00000000-0000-0000-0000-00000000f001', pg_temp.u(1), now())$$, 'no withdrawal once locked');

-- The same event and categories draw the same NPCs.
create temp table npcs as select npc_id from public.major_participants where event_id = '00000000-0000-0000-0000-00000000f001' and kind = 'NPC' order by category_id, slot;
select pg_temp.expect((select count(distinct npc_id) = count(*) from npcs), 'no NPC twice in a category');

-- Access: a player reads their own registration and the grid without snapshots or plans.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) = 1 from public.major_registrations), 'a player reads only their own registration');
select pg_temp.expect((select count(*) = 6 from (select id, slot, kind, display_name, level from public.major_participants) g), 'a player reads the grid');
select pg_temp.expect_error($$select runner_snapshot from public.major_participants$$, 'but not the runners'' snapshots');
select pg_temp.expect_error($$select public.major_register('00000000-0000-0000-0000-00000000f001', auth.uid(), 1, 'x', null, now())$$, 'a player cannot call the functions directly');
select pg_temp.expect_error($$update public.major_registrations set level = 99$$, 'a player cannot change a registration');
reset role;
