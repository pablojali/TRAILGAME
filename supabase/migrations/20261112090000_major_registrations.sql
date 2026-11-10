-- Sunday Major, phase 2: registration, the race plan, READY and the grid (owner specification and
-- decisions, 10 November 2026; docs/MAJOR_PHASE0_AUDIT.md). Written only through the functions
-- below, called by the Edge Function `major-ops` (service role) or by the scheduler.
--
-- Rules (owner decisions 3, 4 and 10):
-- - The level is frozen at registration and sets the category; it never changes afterwards.
-- - Up to `participant_limit` registrations per category are on the main list, the rest on the
--   waiting list. A withdrawal promotes the first of the waiting list.
-- - Registration closes when READY opens (`ready_open_at`); READY is confirmed between then and the
--   start. At the start the grid is locked: READY players of the main list by registration order,
--   then READY players of the waiting list, up to the limit; the others are ABSENT (no result, no
--   reward). NPCs fill the places left, so every category has exactly `participant_limit` runners.

-- 1. Registrations.
create table public.major_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.major_events (id) on delete cascade,
  category_id uuid not null references public.major_categories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Frozen at registration (owner decision 3).
  level integer not null check (level >= 1),
  runner_name text not null check (length(btrim(runner_name)) between 1 and 40),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  list text not null check (list in ('main', 'waitlist')),
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'READY', 'WITHDRAWN', 'RACING', 'ABSENT')),
  registered_at timestamptz not null,
  ready_at timestamptz,
  withdrawn_at timestamptz,
  -- The race plan: {"style", "gel", "bar", "segments": [{"intensity", "stop"}, …]} (the first
  -- segment's intensity is the start; each segment's stop is the aid station after it).
  plan jsonb not null default '{}'::jsonb check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 8192),
  -- The runner as they confirmed READY (attributes, Fitness, Fatigue, equipment, nutrition taken).
  runner_snapshot jsonb check (runner_snapshot is null or (jsonb_typeof(runner_snapshot) = 'object' and pg_column_size(runner_snapshot) <= 16384)),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint major_registrations_ready check ((status in ('READY', 'RACING')) <= (ready_at is not null and runner_snapshot is not null))
);
create index major_registrations_category on public.major_registrations (category_id, status, list, registered_at);

create trigger major_registrations_set_updated_at
before update on public.major_registrations
for each row execute function public.set_updated_at();

-- 2. The grid: exactly `participant_limit` runners per category once locked.
create table public.major_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.major_events (id) on delete cascade,
  category_id uuid not null references public.major_categories (id) on delete cascade,
  slot integer not null check (slot between 1 and 50),
  kind text not null check (kind in ('PLAYER', 'NPC')),
  user_id uuid references auth.users (id) on delete set null,
  registration_id uuid references public.major_registrations (id) on delete set null,
  npc_id text,
  display_name text not null,
  country text,
  level integer not null check (level >= 1),
  -- Players: their READY snapshot and plan. NPCs: none here; the race engine builds them from
  -- their level and the event (deterministic).
  runner_snapshot jsonb,
  plan jsonb not null default '{}'::jsonb,
  -- The running state (phase 3).
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (category_id, slot),
  constraint major_participants_kind check (
    (kind = 'PLAYER' and registration_id is not null and npc_id is null)
    or (kind = 'NPC' and user_id is null and registration_id is null and npc_id is not null)
  )
);
create unique index major_participants_player on public.major_participants (category_id, user_id) where user_id is not null;
create unique index major_participants_npc on public.major_participants (category_id, npc_id) where npc_id is not null;

-- 3. Registering. The caller (major-ops) passes the level and the runner's name from the career.
create or replace function public.major_register(
  p_event uuid, p_user uuid, p_level integer, p_name text, p_country text, p_now timestamptz
)
returns public.major_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  cat public.major_categories;
  reg public.major_registrations;
  taken integer;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'REGISTRATION_OPEN' or p_now < ev.registration_open_at or p_now >= ev.ready_open_at then
    raise exception 'major event % registration is closed', p_event;
  end if;
  select * into cat from public.major_categories
  where event_id = p_event and p_level >= min_level and (max_level is null or p_level <= max_level);
  if not found then raise exception 'major event % has no category for level %', p_event, p_level; end if;
  select * into reg from public.major_registrations where event_id = p_event and user_id = p_user for update;
  if found and reg.status <> 'WITHDRAWN' then raise exception 'major event % already registered', p_event; end if;
  select count(*) into taken from public.major_registrations
  where category_id = cat.id and list = 'main' and status <> 'WITHDRAWN';
  if reg.id is null then
    insert into public.major_registrations (event_id, category_id, user_id, level, runner_name, country, list, registered_at)
    values (p_event, cat.id, p_user, p_level, btrim(p_name), p_country,
            case when taken < ev.participant_limit then 'main' else 'waitlist' end, p_now)
    returning * into reg;
  else
    -- Registering again after withdrawing: a new place in the queue (the level is frozen anew).
    update public.major_registrations set category_id = cat.id, level = p_level, runner_name = btrim(p_name), country = p_country,
      list = case when taken < ev.participant_limit then 'main' else 'waitlist' end,
      status = 'REGISTERED', registered_at = p_now, ready_at = null, withdrawn_at = null, runner_snapshot = null
    where id = reg.id
    returning * into reg;
  end if;
  insert into public.major_log (event_id, actor, kind, detail)
  values (p_event, p_user, 'registered', jsonb_build_object('category', cat.idx, 'list', reg.list, 'level', p_level));
  return reg;
end;
$$;

-- 4. Withdrawing (until the start). The first of the waiting list takes the place on the main list.
create or replace function public.major_withdraw(p_event uuid, p_user uuid, p_now timestamptz)
returns public.major_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  reg public.major_registrations;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'REGISTRATION_OPEN' or p_now >= ev.scheduled_start_at then
    raise exception 'major event % registration is closed', p_event;
  end if;
  update public.major_registrations set status = 'WITHDRAWN', withdrawn_at = p_now, ready_at = null, runner_snapshot = null
  where event_id = p_event and user_id = p_user and status in ('REGISTERED', 'READY')
  returning * into reg;
  if not found then raise exception 'major event % not registered', p_event; end if;
  if reg.list = 'main' then
    update public.major_registrations set list = 'main'
    where id = (select id from public.major_registrations
                where category_id = reg.category_id and list = 'waitlist' and status <> 'WITHDRAWN'
                order by registered_at, id limit 1);
  end if;
  insert into public.major_log (event_id, actor, kind, detail) values (p_event, p_user, 'withdrew', '{}'::jsonb);
  return reg;
end;
$$;

-- 5. The race plan (until the start).
create or replace function public.major_save_plan(p_event uuid, p_user uuid, p_plan jsonb, p_now timestamptz)
returns public.major_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  reg public.major_registrations;
begin
  select * into ev from public.major_events where id = p_event;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'REGISTRATION_OPEN' or p_now >= ev.scheduled_start_at then
    raise exception 'major event % registration is closed', p_event;
  end if;
  update public.major_registrations set plan = p_plan
  where event_id = p_event and user_id = p_user and status in ('REGISTERED', 'READY')
  returning * into reg;
  if not found then raise exception 'major event % not registered', p_event; end if;
  return reg;
end;
$$;

-- 6. READY: between `ready_open_at` and the start, with the runner as they are now. Confirming
-- again refreshes the snapshot.
create or replace function public.major_set_ready(p_event uuid, p_user uuid, p_snapshot jsonb, p_now timestamptz)
returns public.major_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  reg public.major_registrations;
begin
  select * into ev from public.major_events where id = p_event;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'REGISTRATION_OPEN' or p_now < ev.ready_open_at or p_now >= ev.scheduled_start_at then
    raise exception 'major event % ready window is closed', p_event;
  end if;
  update public.major_registrations set status = 'READY', ready_at = p_now, runner_snapshot = p_snapshot
  where event_id = p_event and user_id = p_user and status in ('REGISTERED', 'READY')
  returning * into reg;
  if not found then raise exception 'major event % not registered', p_event; end if;
  return reg;
end;
$$;

-- 7. Locking the grid at the start (idempotent: an event already locked is left alone).
create or replace function public.major_lock(p_event uuid, p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  cat public.major_categories;
  slot_no integer;
  hi integer;
  npc record;
  npcs_needed integer;
  i integer;
  locked integer := 0;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found or ev.status <> 'REGISTRATION_OPEN' or p_now < ev.scheduled_start_at then return 0; end if;
  for cat in select * from public.major_categories where event_id = p_event order by idx loop
    slot_no := 0;
    -- Players: READY, main list first, by registration order.
    for npc in
      select r.* from public.major_registrations r
      where r.category_id = cat.id and r.status = 'READY'
      order by (r.list = 'main') desc, r.registered_at, r.id
      limit ev.participant_limit
    loop
      slot_no := slot_no + 1;
      insert into public.major_participants (event_id, category_id, slot, kind, user_id, registration_id, display_name, country, level, runner_snapshot, plan)
      values (p_event, cat.id, slot_no, 'PLAYER', npc.user_id, npc.id, npc.runner_name, npc.country, npc.level, npc.runner_snapshot, npc.plan);
      update public.major_registrations set status = 'RACING' where id = npc.id;
    end loop;
    -- Everyone else registered is absent (owner rule: not READY at the start, no race).
    update public.major_registrations set status = 'ABSENT'
    where category_id = cat.id and status in ('REGISTERED', 'READY');
    -- NPCs fill the grid: the ranking's NPC runners in an order drawn from the event and category,
    -- their levels spread over the band (deterministic for the same event).
    npcs_needed := ev.participant_limit - slot_no;
    hi := coalesce(cat.max_level, cat.min_level + 10);
    i := 0;
    for npc in
      select n.id, n.name, n.country from public.ranking_npcs n
      order by md5(p_event::text || ':' || cat.idx || ':' || n.id), n.id
      limit npcs_needed
    loop
      slot_no := slot_no + 1;
      insert into public.major_participants (event_id, category_id, slot, kind, npc_id, display_name, country, level)
      values (p_event, cat.id, slot_no, 'NPC', npc.id, npc.name, npc.country,
              cat.min_level + ((i * (hi - cat.min_level + 1)) / greatest(npcs_needed, 1)));
      i := i + 1;
    end loop;
    if slot_no <> ev.participant_limit then
      raise exception 'major event %: category % has % runners, not %', p_event, cat.idx, slot_no, ev.participant_limit;
    end if;
    locked := locked + 1;
  end loop;
  update public.major_events set status = 'LOCKED' where id = p_event;
  insert into public.major_log (event_id, kind, detail)
  values (p_event, 'locked', jsonb_build_object('categories', locked, 'at', p_now));
  return locked;
end;
$$;

-- 8. The clock: opens registration when its time comes and locks the grids at the start. Safe to
-- call any number of times (the scheduler every 15 seconds, and major-ops on every request).
create or replace function public.major_advance(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  changed integer := 0;
begin
  for ev in select id from public.major_events where status = 'SCHEDULED' and registration_open_at <= p_now for update skip locked loop
    update public.major_events set status = 'REGISTRATION_OPEN' where id = ev.id;
    insert into public.major_log (event_id, kind) values (ev.id, 'registration-open');
    changed := changed + 1;
  end loop;
  for ev in select id from public.major_events where status = 'REGISTRATION_OPEN' and scheduled_start_at <= p_now loop
    if public.major_lock(ev.id, p_now) > 0 then changed := changed + 1; end if;
  end loop;
  return changed;
end;
$$;

-- 9. The scheduler (pg_cron, where the extension exists: not in the local test database).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('major-advance', '15 seconds', 'select public.major_advance(now())');
  end if;
end $$;

-- 10. Access. Players read their own registrations; everyone signed in reads the grid of published
-- events, but not the runners' snapshots or plans. Only the service role writes.
alter table public.major_registrations enable row level security;
alter table public.major_participants enable row level security;
revoke all on table public.major_registrations, public.major_participants from public, anon, authenticated;

grant select on table public.major_registrations to authenticated;
create policy "Players read their own Major registrations"
on public.major_registrations for select to authenticated
using (user_id = auth.uid());

grant select (id, event_id, category_id, slot, kind, display_name, country, level) on table public.major_participants to authenticated;
create policy "Players read the grids of published Majors"
on public.major_participants for select to authenticated
using (exists (select 1 from public.major_events e where e.id = event_id and e.status <> 'DRAFT'));

revoke all on function public.major_register(uuid, uuid, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.major_withdraw(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.major_save_plan(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.major_set_ready(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.major_lock(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.major_advance(timestamptz) from public, anon, authenticated;
grant execute on function public.major_register(uuid, uuid, integer, text, text, timestamptz) to service_role;
grant execute on function public.major_withdraw(uuid, uuid, timestamptz) to service_role;
grant execute on function public.major_save_plan(uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.major_set_ready(uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.major_lock(uuid, timestamptz) to service_role;
grant execute on function public.major_advance(timestamptz) to service_role;
