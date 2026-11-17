-- Checks for the friends list (20261118090000_friends.sql): requests, answers, the list both ways,
-- asking back, removing, NPC names, limits, and who may call what.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000000f4');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3'),
  ('00000000-0000-0000-0000-0000000000f4');
insert into public.careers (user_id, game_state, schema_version) values
  ('00000000-0000-0000-0000-0000000000f1', '{"athlete":{"name":"Ana","country":"AR","xp":500}}', 2),
  ('00000000-0000-0000-0000-0000000000f2', '{"athlete":{"name":"Bo","country":"FR","xp":20}}', 2),
  ('00000000-0000-0000-0000-0000000000f3', '{"athlete":{"name":"Cy"}}', 2);
-- f4 has no career.

-- Ana asks Bo and Cy.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.friend_request('bo') = 'pending', 'a request is sent, by name in any case');
select pg_temp.expect(public.friend_request('Bo') = 'pending', 'asking again changes nothing');
select pg_temp.expect(public.friend_request('Cy') = 'pending', 'a second request');
select pg_temp.expect(public.friend_request('Ghost Runner.') = 'pending', 'an NPC name answers like a request');
select pg_temp.expect_error($$select public.friend_request('Ana')$$, 'not to oneself');
select pg_temp.expect((select array_agg(name || ':' || relation || ':' || mine order by name) from public.friend_list()) = array['Bo:outgoing:true', 'Cy:outgoing:true'],
  'Ana sees her two requests waiting');
select pg_temp.expect(public.friend_respond('Bo', true) = 'none', 'she cannot accept her own request');
select pg_temp.expect_error($$select count(*) from public.friendships$$, 'players cannot read the table');

-- Bo accepts; Cy asks back, which accepts.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect((select relation from public.friend_list() where name = 'Ana') = 'incoming', 'Bo sees the request');
select pg_temp.expect(public.friend_respond('ana', true) = 'friends', 'Bo accepts');
select pg_temp.expect(public.friend_request('Ana') = 'friends', 'asking a friend says so');
select pg_temp.expect((select country || ':' || xp || ':' || relation || ':' || mine from public.friend_list()) = 'AR:500:friend:false', 'Bo''s friend Ana, with country and XP');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f3');
select pg_temp.expect(public.friend_request('Ana') = 'accepted', 'asking back accepts');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select array_agg(name || ':' || relation order by name) from public.friend_list()) = array['Bo:friend', 'Cy:friend'], 'Ana has two friends');
select pg_temp.expect(public.friend_remove('Cy'), 'Ana removes Cy');
select pg_temp.expect(not public.friend_remove('Cy'), 'nothing left to remove');

-- Cy asks again; Ana declines; Cy can ask again.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f3');
select pg_temp.expect(public.friend_request('Ana') = 'pending', 'Cy asks again');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(not public.friend_remove('Cy'), 'removing does not decline someone else''s request');
select pg_temp.expect(public.friend_respond('Cy', false) = 'declined', 'Ana declines');
select pg_temp.expect((select count(*) from public.friend_list() where name = 'Cy') = 0, 'a declined request is gone');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f3');
select pg_temp.expect(public.friend_request('Ana') = 'pending', 'and can be sent again');
select pg_temp.expect(public.friend_remove('Ana'), 'Cy withdraws it');

-- Limits.
reset role;
create or replace function public.friends_limits() returns table (max_friends int, max_pending int) language sql immutable as $$ select 1, 1 $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f3');
select pg_temp.expect(public.friend_request('Bo') = 'pending', 'one request waiting');
select pg_temp.expect_error($$select public.friend_request('Ana')$$, 'no more than the pending limit');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_error($$select public.friend_respond('Cy', true)$$, 'Bo already has the most friends');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f4');
select pg_temp.expect_error($$select public.friend_request('Ana')$$, 'a user without a career cannot ask');
select pg_temp.act_as('anon');
select pg_temp.expect_error($$select public.friend_request('Ana')$$, 'anon cannot ask');
select pg_temp.expect_error($$select * from public.friend_list()$$, 'nor list');
select pg_temp.expect_error($$select public.friend_respond('Ana', true)$$, 'nor answer');
select pg_temp.expect_error($$select public.friend_remove('Ana')$$, 'nor remove');
reset role;
