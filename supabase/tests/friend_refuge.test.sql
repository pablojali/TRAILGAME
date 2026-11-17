-- Checks for friends inside the refuge (20261118100000_friend_refuge.sql): the friend flag,
-- messages between friends only, their limits, the mailbox with text, and deleting them.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000e1', '{"athlete":{"name":"Ana"}}', 2),
  ('00000000-0000-0000-0000-0000000000e2', '{"athlete":{"name":"Bo"}}', 2),
  ('00000000-0000-0000-0000-0000000000e3', '{"athlete":{"name":"Cy"}}', 2);
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'accepted', now());

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select pg_temp.expect((public.camp_public('Ana') ->> 'friend')::boolean, 'Bo is Ana''s friend');
select pg_temp.expect(public.camp_message('ana', '  ¡Qué  lindo refugio!  '), 'a friend leaves a message');
select pg_temp.expect(public.camp_visit('Ana', true) = '{"congratulated":true}'::jsonb, 'visits and congratulations still work');
select pg_temp.expect(public.camp_visit('Ana', true) = '{"congratulated":true}'::jsonb, 'still once a day');
select pg_temp.expect_error($$select public.camp_message('Ana', '   ')$$, 'not an empty message');
select pg_temp.expect_error($$select public.camp_message('Ana', repeat('a', 141))$$, 'not over 140 characters');
select public.camp_message('Ana', 'dos'), public.camp_message('Ana', 'tres'), public.camp_message('Ana', 'cuatro'), public.camp_message('Ana', 'cinco');
select pg_temp.expect_error($$select public.camp_message('Ana', 'seis')$$, 'at most five a day');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e3');
select pg_temp.expect(not (public.camp_public('Ana') ->> 'friend')::boolean, 'Cy is not');
select pg_temp.expect_error($$select public.camp_message('Ana', 'hola')$$, 'only friends leave messages');
select pg_temp.expect_error($$select public.camp_message('Ghost Runner.', 'hola')$$, 'nor to an NPC');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select count(*) from public.camp_mailbox() where kind = 'message') = 5, 'Ana has five messages');
select pg_temp.expect((select message from public.camp_mailbox() where kind = 'message' order by id limit 1) = '¡Qué lindo refugio!', 'spaces are tidied');
select pg_temp.expect((select count(*) from public.camp_mailbox() where kind <> 'message') = 2, 'and the visit and congratulation');
select pg_temp.expect(public.camp_message_delete((select id from public.camp_mailbox() where kind = 'message' order by id limit 1)), 'Ana deletes a message');
select pg_temp.expect(not public.camp_message_delete((select id from public.camp_mailbox() where kind = 'visit')), 'but not a visit');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select pg_temp.expect(not public.camp_message_delete(2), 'nor someone else''s message');

select pg_temp.act_as('anon');
select pg_temp.expect_error($$select public.camp_message('Ana', 'hola')$$, 'anon cannot leave messages');
select pg_temp.expect_error($$select public.camp_message_delete(1)$$, 'nor delete them');
reset role;
