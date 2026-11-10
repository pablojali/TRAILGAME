-- Checks for the Sunday Major event manager (20261111090000_major_events.sql): band validation,
-- publishing with the configuration copied, the state machine, frozen published events,
-- cancelling, and who can read or write.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');

-- Bands.
select pg_temp.expect(public.major_bands_valid((select bands from public.major_config)), 'the default bands are valid');
select pg_temp.expect(not public.major_bands_valid('[{"name":"A","min":2,"max":null}]'), 'bands must start at level 1');
select pg_temp.expect(not public.major_bands_valid('[{"name":"A","min":1,"max":8},{"name":"B","min":8,"max":null}]'), 'no overlap');
select pg_temp.expect(not public.major_bands_valid('[{"name":"A","min":1,"max":8},{"name":"B","min":10,"max":null}]'), 'no gap');
select pg_temp.expect(not public.major_bands_valid('[{"name":"A","min":1,"max":8}]'), 'the last band is open-ended');
select pg_temp.expect(not public.major_bands_valid('[{"name":"A","min":1,"max":0},{"name":"B","min":1,"max":null}]'), 'max not below min');
select pg_temp.expect(not public.major_bands_valid('[{"name":"","min":1,"max":null}]'), 'a band needs a name');
select pg_temp.expect(public.major_bands_valid('[{"name":"Todos","min":1,"max":null}]'), 'one open band is valid');
select pg_temp.expect_error($$update public.major_config set bands = '[{"name":"A","min":3,"max":null}]'$$, 'invalid bands are refused in the configuration');

-- A draft, edited, then published: the configuration and the bands are copied.
insert into public.major_events (id, name, race_id, scheduled_start_at, created_by)
values ('00000000-0000-0000-0000-00000000e001', 'Major 1', 'RACE-002', now() + interval '3 days', '00000000-0000-0000-0000-0000000000b1');
update public.major_events set name = 'Major Uno' where id = '00000000-0000-0000-0000-00000000e001';
select public.major_publish('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b1', now());
select pg_temp.expect((select status = 'SCHEDULED' and participant_limit = 50 and decision_window_s = 90
  and ready_open_at = scheduled_start_at - interval '30 minutes' and registration_open_at <= now() + interval '1 second'
  from public.major_events where id = '00000000-0000-0000-0000-00000000e001'), 'publishing copies the configuration');
select pg_temp.expect((select count(*) = 4 and min(min_level) = 1 and count(*) filter (where max_level is null) = 1
  from public.major_categories where event_id = '00000000-0000-0000-0000-00000000e001'), 'one category per band');
select pg_temp.expect_error($$select public.major_publish('00000000-0000-0000-0000-00000000e001', null, now())$$, 'a published event cannot be published again');

-- Later configuration changes leave the published event alone.
update public.major_config set bands = '[{"name":"Todos","min":1,"max":null}]', decision_window_s = 120;
select pg_temp.expect((select jsonb_array_length(bands_snapshot) = 4 and decision_window_s = 90
  from public.major_events where id = '00000000-0000-0000-0000-00000000e001'), 'the published event keeps its copy');

-- Published events are frozen; the state machine only moves forward.
select pg_temp.expect_error($$update public.major_events set name = 'Otro' where id = '00000000-0000-0000-0000-00000000e001'$$, 'a published event cannot be edited');
select pg_temp.expect_error($$update public.major_events set status = 'DRAFT' where id = '00000000-0000-0000-0000-00000000e001'$$, 'no going back to draft');
select pg_temp.expect_error($$update public.major_events set status = 'RUNNING' where id = '00000000-0000-0000-0000-00000000e001'$$, 'no skipping states');
update public.major_events set status = 'REGISTRATION_OPEN' where id = '00000000-0000-0000-0000-00000000e001';
update public.major_events set status = 'LOCKED' where id = '00000000-0000-0000-0000-00000000e001';
select pg_temp.expect_error($$select public.major_cancel('00000000-0000-0000-0000-00000000e001', null, '  ')$$, 'a cancel needs a reason');
select public.major_cancel('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b1', 'Tormenta');
select pg_temp.expect((select status = 'CANCELLED' and cancel_reason = 'Tormenta' from public.major_events where id = '00000000-0000-0000-0000-00000000e001'), 'cancelled with its reason');
select pg_temp.expect_error($$update public.major_events set status = 'STARTING' where id = '00000000-0000-0000-0000-00000000e001'$$, 'a cancelled event is final');
select pg_temp.expect((select count(*) = 2 from public.major_log where event_id = '00000000-0000-0000-0000-00000000e001'), 'publishing and cancelling are logged');

-- An event that starts too soon cannot be published.
insert into public.major_events (id, name, race_id, scheduled_start_at)
values ('00000000-0000-0000-0000-00000000e002', 'Pronto', 'RACE-001', now() + interval '10 minutes');
select pg_temp.expect_error($$select public.major_publish('00000000-0000-0000-0000-00000000e002', null, now())$$, 'too soon to publish');

-- Media: the banner and the clips may change after publishing, until the race is run.
insert into public.major_events (id, name, race_id, scheduled_start_at)
values ('00000000-0000-0000-0000-00000000e004', 'Con medios', 'RACE-001', now() + interval '2 days');
select public.major_publish('00000000-0000-0000-0000-00000000e004', null, now());
update public.major_events set banner_path = 'events/00000000-0000-0000-0000-00000000e004/banner-1.jpg',
  clips = '{"1": "events/00000000-0000-0000-0000-00000000e004/segment-1-1.mp4"}' where id = '00000000-0000-0000-0000-00000000e004';
select pg_temp.expect((select banner_path is not null and clips ? '1' from public.major_events where id = '00000000-0000-0000-0000-00000000e004'), 'a published event takes a banner and clips');
select pg_temp.expect_error($$update public.major_events set banner_path = 'https://example.com/x.jpg' where id = '00000000-0000-0000-0000-00000000e004'$$, 'a banner is a path of the media bucket');
update public.major_events set status = 'REGISTRATION_OPEN' where id = '00000000-0000-0000-0000-00000000e004';
update public.major_events set status = 'LOCKED' where id = '00000000-0000-0000-0000-00000000e004';
update public.major_events set status = 'STARTING' where id = '00000000-0000-0000-0000-00000000e004';
update public.major_events set status = 'RUNNING' where id = '00000000-0000-0000-0000-00000000e004';
select pg_temp.expect_error($$update public.major_events set banner_path = null where id = '00000000-0000-0000-0000-00000000e004'$$, 'media are frozen once the race runs');

-- Players: they read published events and their categories, never drafts; they write nothing.
insert into public.major_events (id, name, race_id, scheduled_start_at)
values ('00000000-0000-0000-0000-00000000e003', 'Publicado', 'RACE-001', now() + interval '2 days');
select public.major_publish('00000000-0000-0000-0000-00000000e003', null, now());
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((select count(*) = 3 from public.major_events), 'a player reads the published and cancelled events, not the draft');
select pg_temp.expect((select count(*) = 6 from public.major_categories), 'a player reads their categories');
select pg_temp.expect_error($$insert into public.major_events (name, race_id, scheduled_start_at) values ('x', 'RACE-001', now())$$, 'a player cannot create events');
select pg_temp.expect_error($$update public.major_events set status = 'CANCELLED', cancel_reason = 'x'$$, 'a player cannot change events');
select pg_temp.expect_error($$select * from public.major_config$$, 'a player cannot read the configuration');
select pg_temp.expect_error($$select * from public.major_admins$$, 'a player cannot read the administrators');
select pg_temp.expect_error($$select public.major_publish('00000000-0000-0000-0000-00000000e002', null, now())$$, 'a player cannot publish');
reset role;
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select * from public.major_events$$, 'anonymous visitors read nothing');
reset role;
