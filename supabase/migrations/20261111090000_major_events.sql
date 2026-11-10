-- Sunday Major, phase 1: the event manager (owner specification and decisions, 10 November 2026;
-- docs/MAJOR_PHASE0_AUDIT.md). Events, their level categories, the global configuration, the
-- administrators and an audit log. Everything is written only by the Edge Function `major-ops`
-- (service role), which checks the administrator first; players can read published events.

-- 1. Administrators: user ids, added with SQL by the owner. Nobody else can read or change them.
create table public.major_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Level bands: a JSON array of {name, min, max}, contiguous from level 1, the last open-ended
-- (max null). Between 1 and 12 bands, names 1–40 characters.
create or replace function public.major_bands_valid(bands jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  n integer;
  i integer;
  band jsonb;
  expected integer := 1;
  lo integer;
  hi integer;
begin
  if bands is null or jsonb_typeof(bands) <> 'array' then return false; end if;
  n := jsonb_array_length(bands);
  if n < 1 or n > 12 then return false; end if;
  for i in 0 .. n - 1 loop
    band := bands -> i;
    if jsonb_typeof(band) <> 'object' or jsonb_typeof(band -> 'name') <> 'string'
       or length(btrim(band ->> 'name')) not between 1 and 40
       or jsonb_typeof(band -> 'min') <> 'number' then
      return false;
    end if;
    lo := (band ->> 'min')::integer;
    if lo <> expected or (band ->> 'min')::numeric <> lo then return false; end if;
    if i = n - 1 then
      if jsonb_typeof(band -> 'max') <> 'null' then return false; end if;
    else
      if jsonb_typeof(band -> 'max') <> 'number' then return false; end if;
      hi := (band ->> 'max')::integer;
      if hi < lo or (band ->> 'max')::numeric <> hi then return false; end if;
      expected := hi + 1;
    end if;
  end loop;
  return true;
end;
$$;

-- 3. The global configuration (one row): what new events copy when they are published.
create table public.major_config (
  id boolean primary key default true check (id),
  -- Default start time of a Sunday Major (UTC).
  start_time_utc time not null default '18:00',
  -- Registration opens this many days before the start; READY opens (and registration closes)
  -- this many minutes before it.
  registration_open_days integer not null default 6 check (registration_open_days between 1 and 13),
  ready_minutes integer not null default 30 check (ready_minutes between 5 and 180),
  -- Length of each aid-station decision window and of each segment's running phase, in seconds.
  decision_window_s integer not null default 90 check (decision_window_s between 30 and 600),
  running_s integer not null default 150 check (running_s between 30 and 900),
  participant_limit integer not null default 50 check (participant_limit between 2 and 50),
  bands jsonb not null default '[
    {"name": "Banda 1", "min": 1, "max": 8},
    {"name": "Banda 2", "min": 9, "max": 16},
    {"name": "Banda 3", "min": 17, "max": 24},
    {"name": "Banda 4", "min": 25, "max": null}
  ]'::jsonb check (public.major_bands_valid(bands)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.major_config default values;

-- 4. Events. Editable while DRAFT; publishing copies the configuration and the bands into the
-- event (later changes to the configuration never change a published event).
create table public.major_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  -- The course: a race of the game's catalog (owner decision 5).
  race_id text not null check (race_id ~ '^[A-Z]+-[0-9]{3}$'),
  scheduled_start_at timestamptz not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SCHEDULED', 'REGISTRATION_OPEN', 'LOCKED', 'STARTING', 'RUNNING', 'FINISHED', 'CANCELLED')),
  -- Set when published, from the configuration.
  registration_open_at timestamptz,
  ready_open_at timestamptz,
  decision_window_s integer check (decision_window_s between 30 and 600),
  running_s integer check (running_s between 30 and 900),
  participant_limit integer check (participant_limit between 2 and 50),
  bands_snapshot jsonb check (bands_snapshot is null or public.major_bands_valid(bands_snapshot)),
  config_snapshot jsonb,
  published_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(btrim(cancel_reason)) between 1 and 300),
  -- Media in the Storage bucket `major-media` (owner request, 10 November 2026): the banner, and a
  -- clip per segment ({"1": "events/<id>/segment-1-<ms>.mp4", …}; its poster is the same path in
  -- .jpg). A segment without one plays the course race's own clip. They may change until the race
  -- is run (cosmetic, not frozen with the published settings).
  banner_path text check (banner_path is null or banner_path ~ '^events/[0-9a-f-]{36}/banner-[0-9]+\.jpg$'),
  clips jsonb not null default '{}'::jsonb check (jsonb_typeof(clips) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint major_events_published check (
    status = 'DRAFT' or (status = 'CANCELLED' and published_at is null)
    or (published_at is not null and registration_open_at is not null and ready_open_at is not null
        and decision_window_s is not null and running_s is not null and participant_limit is not null
        and bands_snapshot is not null and config_snapshot is not null
        and registration_open_at < ready_open_at and ready_open_at < scheduled_start_at)
  ),
  constraint major_events_cancel_reason check ((status = 'CANCELLED') = (cancel_reason is not null))
);
create index major_events_upcoming on public.major_events (status, scheduled_start_at);

create trigger major_events_set_updated_at
before update on public.major_events
for each row execute function public.set_updated_at();

-- The state machine: forward only; CANCELLED from any state before FINISHED.
create or replace function public.major_status_allowed(old_status text, new_status text)
returns boolean
language sql
immutable
as $$
  select case old_status
    when 'DRAFT' then new_status in ('SCHEDULED', 'CANCELLED')
    when 'SCHEDULED' then new_status in ('REGISTRATION_OPEN', 'CANCELLED')
    when 'REGISTRATION_OPEN' then new_status in ('LOCKED', 'CANCELLED')
    when 'LOCKED' then new_status in ('STARTING', 'CANCELLED')
    when 'STARTING' then new_status in ('RUNNING', 'CANCELLED')
    when 'RUNNING' then new_status in ('FINISHED', 'CANCELLED')
    else false
  end
$$;

-- Guards every update: valid transitions only, and a published event's course, time and copied
-- settings never change. Finished and cancelled events are final.
create or replace function public.major_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('FINISHED', 'CANCELLED') then
    raise exception 'major event % is % and cannot change', old.id, old.status;
  end if;
  if new.status <> old.status and not public.major_status_allowed(old.status, new.status) then
    raise exception 'major event %: % → % is not allowed', old.id, old.status, new.status;
  end if;
  if old.status <> 'DRAFT' and (
    new.name, new.description, new.race_id, new.scheduled_start_at, new.registration_open_at, new.ready_open_at,
    new.decision_window_s, new.running_s, new.participant_limit, new.bands_snapshot, new.config_snapshot, new.published_at
  ) is distinct from (
    old.name, old.description, old.race_id, old.scheduled_start_at, old.registration_open_at, old.ready_open_at,
    old.decision_window_s, old.running_s, old.participant_limit, old.bands_snapshot, old.config_snapshot, old.published_at
  ) then
    raise exception 'major event % is published: only its status can change', old.id;
  end if;
  if old.status in ('RUNNING') and (new.banner_path, new.clips) is distinct from (old.banner_path, old.clips) then
    raise exception 'major event % is running: its media cannot change', old.id;
  end if;
  return new;
end;
$$;

create trigger major_events_guard
before update on public.major_events
for each row execute function public.major_events_guard();

-- 5. Categories: one per band, created when the event is published (a copy of the band).
create table public.major_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.major_events (id) on delete cascade,
  idx integer not null check (idx between 1 and 12),
  name text not null check (length(btrim(name)) between 1 and 40),
  min_level integer not null check (min_level >= 1),
  max_level integer check (max_level is null or max_level >= min_level),
  created_at timestamptz not null default now(),
  unique (event_id, idx)
);

-- 6. Audit log of administration and, later, of the orchestrator.
create table public.major_log (
  id bigint generated always as identity primary key,
  event_id uuid references public.major_events (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  kind text not null check (length(kind) between 1 and 60),
  detail jsonb not null default '{}'::jsonb
);
create index major_log_event on public.major_log (event_id, at);

-- 7. Publishing and cancelling, atomically (called by `major-ops` with the service role).
create or replace function public.major_publish(p_event uuid, p_actor uuid, p_now timestamptz)
returns public.major_events
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  cfg public.major_config;
  band jsonb;
  i integer;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'DRAFT' then raise exception 'major event % is not a draft', p_event; end if;
  select * into cfg from public.major_config where id;
  if ev.scheduled_start_at - make_interval(mins => cfg.ready_minutes) <= p_now then
    raise exception 'major event % starts too soon to be published', p_event;
  end if;
  update public.major_events set
    status = 'SCHEDULED',
    published_at = p_now,
    -- Registration opens N days before the start, or now if that is already past.
    registration_open_at = greatest(p_now, scheduled_start_at - make_interval(days => cfg.registration_open_days)),
    ready_open_at = scheduled_start_at - make_interval(mins => cfg.ready_minutes),
    decision_window_s = cfg.decision_window_s,
    running_s = cfg.running_s,
    participant_limit = cfg.participant_limit,
    bands_snapshot = cfg.bands,
    config_snapshot = jsonb_build_object(
      'startTimeUtc', cfg.start_time_utc, 'registrationOpenDays', cfg.registration_open_days,
      'readyMinutes', cfg.ready_minutes, 'decisionWindowS', cfg.decision_window_s,
      'runningS', cfg.running_s, 'participantLimit', cfg.participant_limit)
  where id = p_event
  returning * into ev;
  for i in 0 .. jsonb_array_length(cfg.bands) - 1 loop
    band := cfg.bands -> i;
    insert into public.major_categories (event_id, idx, name, min_level, max_level)
    values (p_event, i + 1, band ->> 'name', (band ->> 'min')::integer, (band ->> 'max')::integer);
  end loop;
  insert into public.major_log (event_id, actor, kind, detail) values (p_event, p_actor, 'published', '{}'::jsonb);
  return ev;
end;
$$;

create or replace function public.major_cancel(p_event uuid, p_actor uuid, p_reason text)
returns public.major_events
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
begin
  update public.major_events set status = 'CANCELLED', cancel_reason = btrim(p_reason)
  where id = p_event
  returning * into ev;
  if not found then raise exception 'major event % not found', p_event; end if;
  insert into public.major_log (event_id, actor, kind, detail)
  values (p_event, p_actor, 'cancelled', jsonb_build_object('reason', btrim(p_reason)));
  return ev;
end;
$$;

-- 8. The media bucket: public to read (the game shows banners and clips), written only by the
-- service role through signed upload URLs that `major-ops` hands to administrators. Images up to
-- 5 MB, videos up to 24 MB (as the game's own clips). Skipped where Storage does not exist (the
-- local test database).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('major-media', 'major-media', true, 25165824, array['image/jpeg', 'video/mp4'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- 9. Access. RLS everywhere; only the service role writes. Signed-in players read published events
-- and their categories; nobody else reads the configuration, the administrators or the log.
alter table public.major_admins enable row level security;
alter table public.major_config enable row level security;
alter table public.major_events enable row level security;
alter table public.major_categories enable row level security;
alter table public.major_log enable row level security;

revoke all on table public.major_admins, public.major_config, public.major_events, public.major_categories, public.major_log
  from public, anon, authenticated;
grant select on table public.major_events, public.major_categories to authenticated;

create policy "Players read published majors"
on public.major_events for select to authenticated
using (status <> 'DRAFT');

create policy "Players read the categories of published majors"
on public.major_categories for select to authenticated
using (exists (select 1 from public.major_events e where e.id = event_id and e.status <> 'DRAFT'));

revoke all on function public.major_publish(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.major_cancel(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.major_events_guard() from public, anon, authenticated;
grant execute on function public.major_publish(uuid, uuid, timestamptz) to service_role;
grant execute on function public.major_cancel(uuid, uuid, text) to service_role;
