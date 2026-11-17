-- Friends inside the refuge (owner design, 17 November 2026): a friend visiting a refuge can go
-- in, and leave the owner a message (up to 140 characters, a few a day). Messages reach the
-- owner's Inbox and mailbox, where the owner can delete them. Non-friends still see the refuge
-- outside only, and congratulate.

-- 1. camp_visits holds messages too: several a day, with their text.
alter table public.camp_visits drop constraint camp_visits_kind_check;
alter table public.camp_visits add constraint camp_visits_kind_check check (kind in ('visit', 'congrats', 'message'));
alter table public.camp_visits add column message text;
alter table public.camp_visits add constraint camp_visits_message_check check (
  (kind = 'message') = (message is not null) and (message is null or char_length(message) between 1 and 140));
alter table public.camp_visits drop constraint camp_visits_once_a_day;
create unique index camp_visits_once_a_day on public.camp_visits (owner_id, visitor_id, kind, day) where kind in ('visit', 'congrats');

-- Whether two runners are friends.
create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)))
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- 2. The refuge as visitors see it, now saying whether the caller is the owner's friend.
create or replace function public.camp_public(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_career public.careers;
  camp jsonb;
  using_ids jsonb;
  slots jsonb;
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'bad-name' using errcode = '22023';
  end if;
  found_career := public.camp_career_of(p_name);
  if found_career.user_id is null then
    return jsonb_build_object('name', btrim(p_name), 'me', false, 'friend', false, 'camp', null);
  end if;
  camp := found_career.game_state -> 'camp';
  if jsonb_typeof(camp) = 'object' then
    using_ids := case when jsonb_typeof(camp -> 'using') = 'array' then camp -> 'using' else '[]'::jsonb end;
    slots := case when jsonb_typeof(camp -> 'slots') = 'object' then camp -> 'slots' else null end;
    camp := jsonb_strip_nulls(jsonb_build_object(
      'owned', using_ids || coalesce((select jsonb_agg(value) from jsonb_each(coalesce(slots, '{}'::jsonb))), '[]'::jsonb),
      'using', using_ids,
      'off', case when jsonb_typeof(camp -> 'off') = 'array' then camp -> 'off' end,
      'slots', slots));
  else
    camp := null;
  end if;
  return jsonb_build_object(
    'name', found_career.game_state -> 'athlete' ->> 'name',
    'me', found_career.user_id = auth.uid(),
    'friend', public.are_friends(found_career.user_id, auth.uid()),
    'camp', camp);
end;
$$;

-- 3. Visits and congratulations: unchanged, but the once-a-day rule is now a partial index.
create or replace function public.camp_visit(p_name text, p_congrats boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  visitor uuid := auth.uid();
  owner_career public.careers;
begin
  if visitor is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'bad-name' using errcode = '22023';
  end if;
  if not exists (select 1 from public.careers where user_id = visitor) then
    raise exception 'no-career' using errcode = '42501';
  end if;
  owner_career := public.camp_career_of(p_name);
  if owner_career.user_id is null or owner_career.user_id = visitor then
    return jsonb_build_object('congratulated', coalesce(p_congrats, false));
  end if;
  insert into public.camp_visits (owner_id, visitor_id, kind)
  values (owner_career.user_id, visitor, 'visit')
  on conflict (owner_id, visitor_id, kind, day) where kind in ('visit', 'congrats') do nothing;
  if coalesce(p_congrats, false) then
    insert into public.camp_visits (owner_id, visitor_id, kind)
    values (owner_career.user_id, visitor, 'congrats')
    on conflict (owner_id, visitor_id, kind, day) where kind in ('visit', 'congrats') do nothing;
  end if;
  delete from public.camp_visits where owner_id = owner_career.user_id and day < (now() at time zone 'UTC')::date - 60;
  return jsonb_build_object('congratulated', exists (
    select 1 from public.camp_visits
    where owner_id = owner_career.user_id and visitor_id = visitor and kind = 'congrats' and day = (now() at time zone 'UTC')::date));
end;
$$;

-- 4. A friend's message: 1 to 140 characters, at most 5 a day to the same refuge. Errors:
--    not-friends, bad-message, too-many-messages.
create function public.camp_message(p_name text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.friends_me();
  owner_uid uuid := (public.camp_career_of(p_name)).user_id;
  text_clean text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if owner_uid is null or owner_uid = me or not public.are_friends(owner_uid, me) then
    raise exception 'not-friends' using errcode = '42501';
  end if;
  if char_length(text_clean) not between 1 and 140 then
    raise exception 'bad-message' using errcode = '22023';
  end if;
  if (select count(*) from public.camp_visits v
      where v.owner_id = owner_uid and v.visitor_id = me and v.kind = 'message' and v.day = (now() at time zone 'UTC')::date) >= 5 then
    raise exception 'too-many-messages' using errcode = '22023';
  end if;
  insert into public.camp_visits (owner_id, visitor_id, kind, message) values (owner_uid, me, 'message', text_clean);
  return true;
end;
$$;
revoke all on function public.camp_message(text, text) from public, anon;
grant execute on function public.camp_message(text, text) to authenticated;

-- 5. The mailbox, now with messages and their text.
drop function public.camp_mailbox();
create function public.camp_mailbox()
returns table (id bigint, kind text, name text, at timestamptz, message text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.kind, c.game_state -> 'athlete' ->> 'name', v.created_at, v.message
  from public.camp_visits v
  join public.careers c on c.user_id = v.visitor_id
  where v.owner_id = auth.uid()
  order by v.created_at desc
  limit 30
$$;
revoke all on function public.camp_mailbox() from public, anon;
grant execute on function public.camp_mailbox() to authenticated;

-- 6. The owner deletes a message from their mailbox. Answers whether one was deleted.
create function public.camp_message_delete(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  delete from public.camp_visits where id = p_id and owner_id = auth.uid() and kind = 'message';
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;
revoke all on function public.camp_message_delete(bigint) from public, anon;
grant execute on function public.camp_message_delete(bigint) to authenticated;
