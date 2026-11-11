-- Checks for the Major race state (20261113090000_major_race.sql): the start, single atomic steps
-- (compare-and-swap), aid-station decisions inside their window only, a step refused when a
-- decision arrived after it was computed, and the event finishing with its last category.
\set ON_ERROR_STOP on

update public.major_config set participant_limit = 2, bands = '[{"name":"Todos","min":1,"max":null}]';
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.major_events (id, name, race_id, scheduled_start_at)
values ('00000000-0000-0000-0000-00000000a001', 'Major', 'RACE-002', now() + interval '2 days');
select public.major_publish('00000000-0000-0000-0000-00000000a001', null, now());
select public.major_advance(now());
select public.major_register('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 3, 'Ana.', 'AR', now());
create temp table t as select ready_open_at + interval '1 minute' as ready_now, scheduled_start_at as start_at
from public.major_events where id = '00000000-0000-0000-0000-00000000a001';
select public.major_set_ready('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', '{"fatigue":10}', (select ready_now from t));
select public.major_advance((select start_at from t));

create temp table ids as select p.id, p.kind, c.id as category_id from public.major_participants p join public.major_categories c on c.id = p.category_id
where p.event_id = '00000000-0000-0000-0000-00000000a001';
create function pg_temp.states(label text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', id, 'state', jsonb_build_object('label', label))) from ids
$$;

-- The start.
select pg_temp.expect(public.major_start('00000000-0000-0000-0000-00000000a001', 2, pg_temp.states('start'), now()), 'the race starts');
select pg_temp.expect(not public.major_start('00000000-0000-0000-0000-00000000a001', 2, pg_temp.states('again'), now()), 'starting twice does nothing');
select pg_temp.expect((select status = 'RUNNING' from public.major_events where id = '00000000-0000-0000-0000-00000000a001'), 'the event is running');
select pg_temp.expect((select phase = 'RUNNING' and segment = 0 and segments = 2 and version = 1
  and phase_ends_at = (select start_at from t) + interval '150 seconds' from public.major_categories c where c.id = (select category_id from ids limit 1)), 'the first segment runs from the official start');
select pg_temp.expect((select bool_and(state ->> 'label' = 'start') from public.major_participants where event_id = '00000000-0000-0000-0000-00000000a001'), 'initial states stored');

-- A step commits once: the same version again is refused.
select pg_temp.expect(public.major_commit_step((select category_id from ids limit 1), 1, 'PA', 0, now(), now() + interval '90 seconds', pg_temp.states('seg0'), null, 0), 'segment 1 run, aid station 1 opens');
select pg_temp.expect(not public.major_commit_step((select category_id from ids limit 1), 1, 'PA', 0, now(), now() + interval '90 seconds', pg_temp.states('dup'), null, 0), 'the same step twice is refused');
select pg_temp.expect((select bool_and(state ->> 'label' = 'seg0') from public.major_participants where event_id = '00000000-0000-0000-0000-00000000a001'), 'the refused step changed nothing');

-- Decisions: only the runner's own, only in the open window; changeable until it closes.
select pg_temp.expect(public.major_decide('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 0, 'quick', 'hard'), 'a decision in the window');
select public.major_decide('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 0, 'slow', 'easy');
select pg_temp.expect((select stop = 'slow' and intensity = 'easy' and source = 'PLAYER' from public.major_decisions), 'changed before the window closes');
select pg_temp.expect_error($$select public.major_decide('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 1, 'quick', 'hard')$$, 'not for another aid station');
select pg_temp.expect_error($$select public.major_decide('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c9', 0, 'quick', 'hard')$$, 'not for a runner off the grid');

-- A step computed without that decision is refused; with it, it commits and adds the AUTO ones.
select pg_temp.expect(not public.major_commit_step((select category_id from ids limit 1), 2, 'RUNNING', 1, now(), now() + interval '150 seconds', pg_temp.states('late'), null, 0), 'a step that missed a decision is refused');
select pg_temp.expect(public.major_commit_step((select category_id from ids limit 1), 2, 'RUNNING', 1, now(), now() + interval '150 seconds', pg_temp.states('seg1'),
  (select jsonb_agg(jsonb_build_object('participantId', id, 'segment', 0, 'stop', 'normal', 'intensity', 'target')) from ids), 1), 'the step with the decision commits');
select pg_temp.expect((select count(*) = 2 and count(*) filter (where source = 'PLAYER' and stop = 'slow') = 1 from public.major_decisions), 'the player''s decision is kept, the NPC''s is automatic');

-- The window is closed now.
select pg_temp.expect_error($$select public.major_decide('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 0, 'quick', 'hard')$$, 'no decision once the window closed');

-- The last segment finishes the category, and with it the event.
select public.major_commit_step((select category_id from ids limit 1), 3, 'FINISHED', 1, now(), null, pg_temp.states('finish'), null, 0,
  (select jsonb_agg(jsonb_build_object('participantId', id, 'position', case when kind = 'PLAYER' then 1 else 2 end, 'timeS', 3600)) from ids),
  (select jsonb_agg(jsonb_build_object('participantId', id, 'payload', jsonb_build_object('position', 1))) from ids));
select pg_temp.expect((select status = 'FINISHED' from public.major_events where id = '00000000-0000-0000-0000-00000000a001'), 'the event finishes with its last category');

-- Phase 5: the results of everyone, a reward for the player only (never an NPC), once.
select pg_temp.expect((select count(*) = 2 from public.major_results), 'every runner''s result is recorded');
select pg_temp.expect((select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-0000000000c1' and payload ->> 'position' = '1' and claimed_at is null)
  from public.major_rewards), 'one reward, for the player');
select pg_temp.expect(not public.major_commit_step((select category_id from ids limit 1), 3, 'FINISHED', 1, now(), null, pg_temp.states('again'), null, 0,
  (select jsonb_agg(jsonb_build_object('participantId', id, 'position', 1, 'timeS', 1)) from ids),
  (select jsonb_agg(jsonb_build_object('participantId', id, 'payload', '{}'::jsonb)) from ids)), 'the finish is not committed twice');
select pg_temp.expect((select count(*) = 1 from public.major_rewards), 'still one reward');

-- NPCs are not identifiable: a name ending with a full stop, and players cannot read `kind`.
select pg_temp.expect((select bool_and(display_name like '%.') from public.major_participants where kind = 'NPC'), 'NPC names end with a full stop');
select pg_temp.expect((select bool_and(display_name not like '%.') from public.major_participants where kind = 'PLAYER'), 'player names never do');

-- Access.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select count(*) = 1 from public.major_decisions), 'a player reads their own decisions only');
select pg_temp.expect((select count(id) = 2 from public.major_participants), 'a player reads the grid');
select pg_temp.expect_error($$select kind from public.major_participants$$, 'but not who is an NPC');
select pg_temp.expect_error($$select * from public.major_rewards$$, 'nor the rewards');
select pg_temp.expect_error($$select * from public.major_results$$, 'nor the results table');
select pg_temp.expect_error($$select public.major_decide('00000000-0000-0000-0000-00000000a001', auth.uid(), 0, 'quick', 'hard')$$, 'a player cannot call the function directly');
reset role;
