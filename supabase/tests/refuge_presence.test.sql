-- Checks for who is home (20261118120000_refuge_presence.sql): the ping, `online` for any visitor,
-- the owner's avatar (no equipment) for friends only while they are home.
\set ON_ERROR_STOP on

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000b3');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000b3');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000b1', '{"athlete":{"name":"Ana","sex":"female","appearance":{"hair":"natural","skin":"tone-2","outfit":"shirt-l1-01"}},"equipment":["shoe-1"]}', 2),
  ('00000000-0000-0000-0000-0000000000b2', '{"athlete":{"name":"Bo"}}', 2),
  ('00000000-0000-0000-0000-0000000000b3', '{"athlete":{"name":"Cy"}}', 2);
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'accepted', now());

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect(not (public.camp_public('Ana') ->> 'online')::boolean, 'Ana is not home before her game pings');
select pg_temp.expect(public.camp_public('Ana') -> 'avatar' is null, 'so no avatar');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.presence_ping();
select public.presence_ping();

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((public.camp_public('Ana') ->> 'online')::boolean, 'Ana is home');
select pg_temp.expect(public.camp_public('Ana') -> 'avatar' = '{"sex":"female","appearance":{"hair":"natural","skin":"tone-2","outfit":"shirt-l1-01"}}'::jsonb,
  'her friend sees her avatar: sex and appearance, no equipment');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select pg_temp.expect((public.camp_public('Ana') ->> 'online')::boolean, 'anyone sees the lamp lit');
select pg_temp.expect(public.camp_public('Ana') -> 'avatar' is null, 'but only friends see her inside');

reset role;
update public.runner_presence set seen_at = now() - interval '10 minutes';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect(not (public.camp_public('Ana') ->> 'online')::boolean, 'after a while without pings she is out');

select pg_temp.expect_error($$select count(*) from public.runner_presence$$, 'players cannot read presence');
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select public.presence_ping()$$, 'anon cannot ping');
reset role;
