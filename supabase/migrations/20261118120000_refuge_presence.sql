-- Who is home (owner design, 18 November 2026): while a runner has the game open, it tells the
-- server every minute. A visitor to their refuge sees a lamp lit over the door; a friend who goes
-- inside finds the owner there, as their avatar in their clothes (no equipment).

-- 1. The last time each runner's game said it was open. Written and read only through functions.
create table public.runner_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.runner_presence enable row level security;
revoke all on public.runner_presence from anon, authenticated;

-- A runner counts as home for this long after their game's last ping.
create function public.presence_window() returns interval language sql immutable as $$ select interval '150 seconds' $$;

-- 2. The game's ping (every minute while it is open and shown).
create function public.presence_ping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.careers where user_id = auth.uid()) then
    return;
  end if;
  insert into public.runner_presence (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end;
$$;
revoke all on function public.presence_ping() from public, anon;
grant execute on function public.presence_ping() to authenticated;

-- 3. The refuge as visitors see it, now with `online` (the owner's game is open) and, for a friend
--    while the owner is home, `avatar`: their sex and appearance (body, hair, shirt; never their
--    equipment).
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
  is_friend boolean;
  is_online boolean;
begin
  if auth.uid() is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'bad-name' using errcode = '22023';
  end if;
  found_career := public.camp_career_of(p_name);
  if found_career.user_id is null then
    return jsonb_build_object('name', btrim(p_name), 'me', false, 'friend', false, 'online', false, 'camp', null);
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
  is_friend := public.are_friends(found_career.user_id, auth.uid());
  is_online := exists (
    select 1 from public.runner_presence p
    where p.user_id = found_career.user_id and p.seen_at > now() - public.presence_window());
  return jsonb_strip_nulls(jsonb_build_object(
    'name', found_career.game_state -> 'athlete' ->> 'name',
    'me', found_career.user_id = auth.uid(),
    'friend', is_friend,
    'online', is_online,
    'avatar', case when is_friend and is_online then jsonb_build_object(
      'sex', found_career.game_state -> 'athlete' -> 'sex',
      'appearance', found_career.game_state -> 'athlete' -> 'appearance') end))
    -- camp may be null: kept as a key.
    || jsonb_build_object('camp', camp);
end;
$$;
