-- The friends list (owner design, 17 November 2026): a runner sends a friend request from another
-- runner's refuge; the other accepts or declines it. Only accepted requests are friends, both
-- ways. The list lives in Base Camp, each friend with a way to visit their refuge. Requests and
-- acceptances reach the Inbox.
--
-- Runners are named by their runner name (unique). A name that is not a player's (an NPC) answers
-- like a sent request but records nothing, so NPCs look like any runner.

-- 1. One row per pair of runners, whoever asked first. Read and written only through the functions.
create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id),
  primary key (requester_id, addressee_id)
);
-- One row per pair, in either direction.
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- At most this many friends and requests waiting for an answer, per runner.
create function public.friends_limits() returns table (max_friends int, max_pending int)
language sql immutable as $$ select 200, 50 $$;

-- The caller's runner, checked: signed in and with a career of their own.
create function public.friends_me()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.careers where user_id = me) then
    raise exception 'no-career' using errcode = '42501';
  end if;
  return me;
end;
$$;
revoke all on function public.friends_me() from public, anon, authenticated;

-- 2. Sends a friend request to a runner (by name). Answers the pair's status afterwards:
--    'pending' (sent, or already waiting), 'accepted' (they had asked the caller first: now
--    friends), 'friends' (already friends). Errors: bad-name, self, too-many-friends,
--    too-many-pending.
create function public.friend_request(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.friends_me();
  other uuid;
  row_found public.friendships;
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'bad-name' using errcode = '22023';
  end if;
  other := (public.camp_career_of(p_name)).user_id;
  if other is null then
    return 'pending';
  end if;
  if other = me then
    raise exception 'self' using errcode = '22023';
  end if;
  select * into row_found from public.friendships
  where (requester_id = me and addressee_id = other) or (requester_id = other and addressee_id = me);
  if found then
    if row_found.status = 'accepted' then
      return 'friends';
    end if;
    if row_found.requester_id = me then
      return 'pending';
    end if;
    -- They asked first: asking back accepts.
    if (select count(*) from public.friendships where status = 'accepted' and me in (requester_id, addressee_id)) >= (select max_friends from public.friends_limits()) then
      raise exception 'too-many-friends' using errcode = '22023';
    end if;
    update public.friendships set status = 'accepted', accepted_at = now() where requester_id = other and addressee_id = me;
    return 'accepted';
  end if;
  if (select count(*) from public.friendships where status = 'accepted' and me in (requester_id, addressee_id)) >= (select max_friends from public.friends_limits()) then
    raise exception 'too-many-friends' using errcode = '22023';
  end if;
  if (select count(*) from public.friendships where status = 'pending' and requester_id = me) >= (select max_pending from public.friends_limits()) then
    raise exception 'too-many-pending' using errcode = '22023';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (me, other) on conflict do nothing;
  return 'pending';
end;
$$;
revoke all on function public.friend_request(text) from public, anon;
grant execute on function public.friend_request(text) to authenticated;

-- 3. Answers a request a runner sent the caller: accepted (friends) or declined (forgotten, so
--    they can ask again). Answers 'friends', 'declined' or 'none' (no such request).
create function public.friend_respond(p_name text, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.friends_me();
  other uuid := (public.camp_career_of(p_name)).user_id;
begin
  if other is null or not exists (select 1 from public.friendships where requester_id = other and addressee_id = me and status = 'pending') then
    return 'none';
  end if;
  if not coalesce(p_accept, false) then
    delete from public.friendships where requester_id = other and addressee_id = me;
    return 'declined';
  end if;
  if (select count(*) from public.friendships where status = 'accepted' and me in (requester_id, addressee_id)) >= (select max_friends from public.friends_limits()) then
    raise exception 'too-many-friends' using errcode = '22023';
  end if;
  update public.friendships set status = 'accepted', accepted_at = now() where requester_id = other and addressee_id = me;
  return 'friends';
end;
$$;
revoke all on function public.friend_respond(text, boolean) from public, anon;
grant execute on function public.friend_respond(text, boolean) to authenticated;

-- 4. Ends a friendship, or withdraws the caller's own request, with a runner. Answers whether
--    anything was removed.
create function public.friend_remove(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.friends_me();
  other uuid := (public.camp_career_of(p_name)).user_id;
  removed int;
begin
  if other is null then
    return false;
  end if;
  delete from public.friendships
  where (requester_id = me and addressee_id = other) or (requester_id = other and addressee_id = me and status = 'accepted');
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;
revoke all on function public.friend_remove(text) from public, anon;
grant execute on function public.friend_remove(text) to authenticated;

-- 5. The caller's friends and requests: each runner's current name, country and XP, and the
--    relation: 'friend', 'incoming' (asked the caller) or 'outgoing' (the caller asked them).
--    `since` is when they became friends, or when the request was sent; `mine` says the caller
--    sent the request (for a friend: who asked first).
create function public.friend_list()
returns table (name text, country text, xp integer, relation text, since timestamptz, mine boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public.friends_me();
begin
  return query
  select c.game_state -> 'athlete' ->> 'name',
         c.game_state -> 'athlete' ->> 'country',
         case when jsonb_typeof(c.game_state -> 'athlete' -> 'xp') = 'number' then (c.game_state -> 'athlete' ->> 'xp')::numeric::integer else 0 end,
         case when f.status = 'accepted' then 'friend' when f.requester_id = me then 'outgoing' else 'incoming' end,
         coalesce(f.accepted_at, f.created_at),
         f.requester_id = me
  from public.friendships f
  join public.careers c on c.user_id = case when f.requester_id = me then f.addressee_id else f.requester_id end
  where me in (f.requester_id, f.addressee_id)
  order by 4, 1;
end;
$$;
revoke all on function public.friend_list() from public, anon;
grant execute on function public.friend_list() to authenticated;
