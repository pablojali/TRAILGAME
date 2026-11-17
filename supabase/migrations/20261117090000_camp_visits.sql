-- Visiting another runner's refuge (owner design, 17 November 2026): from the rankings and the
-- Majors, a player opens another runner's Base Camp outside, as its owner has it. Visiting is
-- recorded and the visitor can congratulate the owner; both reach the owner's Inbox and mailbox.
-- Every refuge can be visited. Only what the refuge shows leaves the database: the pieces in use
-- and their places, never the career, coins or what else was bought.
--
-- A name that is not a player's (a ranking or Major NPC) gets an empty refuge (the game shows a
-- free one), and visits to it are not recorded, so NPCs look like any runner.

-- 1. Visits and congratulations: one of each per visitor, refuge and UTC day. Read and written only
--    through the functions below.
create table public.camp_visits (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('visit', 'congrats')),
  day date not null default ((now() at time zone 'UTC')::date),
  created_at timestamptz not null default now(),
  constraint camp_visits_not_self check (owner_id <> visitor_id),
  constraint camp_visits_once_a_day unique (owner_id, visitor_id, kind, day)
);
create index camp_visits_owner_recent on public.camp_visits (owner_id, created_at desc);
alter table public.camp_visits enable row level security;
revoke all on public.camp_visits from anon, authenticated;

-- The career of a runner name (names are unique, ignoring case and outer spaces).
create function public.camp_career_of(p_name text)
returns public.careers
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.careers c where lower(btrim(c.game_state -> 'athlete' ->> 'name')) = lower(btrim(p_name)) limit 1
$$;
revoke all on function public.camp_career_of(text) from public, anon, authenticated;

-- 2. A runner's refuge as visitors see it: { name, me, camp } where camp is null (none saved, or
--    not a player) or { owned, using, off?, slots? } with `owned` limited to the pieces in use or
--    placed. `me` says the caller asked for their own.
create function public.camp_public(p_name text)
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
    return jsonb_build_object('name', btrim(p_name), 'me', false, 'camp', null);
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
    'camp', camp);
end;
$$;
revoke all on function public.camp_public(text) from public, anon;
grant execute on function public.camp_public(text) to authenticated;

-- 3. Records a visit (and, with p_congrats, a congratulation) to a runner's refuge, at most once a
--    day each. Returns { congratulated }: whether the caller already congratulated them today.
--    Visiting oneself or an NPC records nothing. Visits older than 60 days are dropped.
create function public.camp_visit(p_name text, p_congrats boolean default false)
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
  -- Only runners visit: the caller needs a career of their own.
  if not exists (select 1 from public.careers where user_id = visitor) then
    raise exception 'no-career' using errcode = '42501';
  end if;
  owner_career := public.camp_career_of(p_name);
  if owner_career.user_id is null or owner_career.user_id = visitor then
    return jsonb_build_object('congratulated', coalesce(p_congrats, false));
  end if;
  insert into public.camp_visits (owner_id, visitor_id, kind)
  values (owner_career.user_id, visitor, 'visit')
  on conflict on constraint camp_visits_once_a_day do nothing;
  if coalesce(p_congrats, false) then
    insert into public.camp_visits (owner_id, visitor_id, kind)
    values (owner_career.user_id, visitor, 'congrats')
    on conflict on constraint camp_visits_once_a_day do nothing;
  end if;
  delete from public.camp_visits where owner_id = owner_career.user_id and day < (now() at time zone 'UTC')::date - 60;
  return jsonb_build_object('congratulated', exists (
    select 1 from public.camp_visits
    where owner_id = owner_career.user_id and visitor_id = visitor and kind = 'congrats' and day = (now() at time zone 'UTC')::date));
end;
$$;
revoke all on function public.camp_visit(text, boolean) from public, anon;
grant execute on function public.camp_visit(text, boolean) to authenticated;

-- 4. The caller's mailbox: the latest 30 visits and congratulations to their refuge, with the
--    visitor's current runner name (rows of visitors without a career are left out).
create function public.camp_mailbox()
returns table (id bigint, kind text, name text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.kind, c.game_state -> 'athlete' ->> 'name', v.created_at
  from public.camp_visits v
  join public.careers c on c.user_id = v.visitor_id
  where v.owner_id = auth.uid()
  order by v.created_at desc
  limit 30
$$;
revoke all on function public.camp_mailbox() from public, anon;
grant execute on function public.camp_mailbox() to authenticated;
