-- Sunday Major, phase 3: the race orchestrator's state (owner specification §6–8; decisions of 10
-- November 2026). The race is computed by the Edge Function `major-ops` with the game's engine;
-- the database keeps every category's phase and makes each step atomic and single:
--
-- RUNNING (segment k)  --phase ends: segment k is simulated for every runner-->  PA (after k)
-- PA (after k)          --window ends: decisions locked, stops applied-->          RUNNING (k + 1)
-- RUNNING (last)        --phase ends-->                                             FINISHED
--
-- A step is computed from the stored state and committed by `major_commit_step` only if the
-- category's `version` is still the one it was computed from (compare-and-swap): two ticks never
-- apply the same step twice, and a tick that dies leaves the step to the next one.

alter table public.major_categories
  add column phase text not null default 'WAITING' check (phase in ('WAITING', 'RUNNING', 'PA', 'FINISHED')),
  -- RUNNING: the segment being run (0-based). PA and FINISHED: the last segment run.
  add column segment integer not null default 0 check (segment between 0 and 19),
  add column segments integer check (segments between 1 and 20),
  add column phase_started_at timestamptz,
  add column phase_ends_at timestamptz,
  add column version integer not null default 0;
create index major_categories_due on public.major_categories (phase, phase_ends_at);

-- The decision at the aid station after segment `segment` (0-based): the stop there and the next
-- segment's intensity. The player's own (until the window closes) or the automatic one, written
-- when the window closes.
create table public.major_decisions (
  participant_id uuid not null references public.major_participants (id) on delete cascade,
  segment integer not null check (segment between 0 and 18),
  stop text not null check (stop in ('quick', 'normal', 'slow')),
  intensity text not null check (intensity in ('recovery', 'easy', 'target', 'hard')),
  source text not null check (source in ('PLAYER', 'AUTO')),
  submitted_at timestamptz not null,
  primary key (participant_id, segment)
);

-- 1. The start: LOCKED → STARTING → RUNNING, with every runner's initial state, and every category
-- running its first segment from the official start time. Returns false if already started.
create or replace function public.major_start(p_event uuid, p_segments integer, p_states jsonb, p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
begin
  update public.major_events set status = 'STARTING' where id = p_event and status = 'LOCKED' returning * into ev;
  if not found then return false; end if;
  update public.major_participants p set state = s.value -> 'state'
  from jsonb_array_elements(p_states) s
  where p.id = (s.value ->> 'id')::uuid and p.event_id = p_event;
  update public.major_categories set phase = 'RUNNING', segment = 0, segments = p_segments,
    phase_started_at = ev.scheduled_start_at,
    phase_ends_at = ev.scheduled_start_at + make_interval(secs => ev.running_s),
    version = version + 1
  where event_id = p_event;
  update public.major_events set status = 'RUNNING' where id = p_event;
  insert into public.major_log (event_id, kind, detail) values (p_event, 'started', jsonb_build_object('at', p_now));
  return true;
end;
$$;

-- 2. One step of one category, committed only from the version it was computed on, and (for an
-- aid station) only if no player decision arrived after the decisions were read. Writes the
-- runners' states and the automatic decisions, moves the phase on, and finishes the event when its
-- last category finishes.
create or replace function public.major_commit_step(
  p_category uuid,
  p_version integer,
  p_phase text,
  p_segment integer,
  p_started_at timestamptz,
  p_ends_at timestamptz,
  p_states jsonb,
  p_decisions jsonb,
  p_player_decisions_seen integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cat public.major_categories;
  seen integer;
begin
  select * into cat from public.major_categories where id = p_category for update;
  if not found or cat.version <> p_version then return false; end if;
  if cat.phase = 'PA' then
    select count(*) into seen from public.major_decisions d
    join public.major_participants p on p.id = d.participant_id
    where p.category_id = p_category and d.segment = cat.segment and d.source = 'PLAYER';
    if seen <> p_player_decisions_seen then return false; end if;
  end if;
  update public.major_participants p set state = s.value -> 'state'
  from jsonb_array_elements(p_states) s
  where p.id = (s.value ->> 'id')::uuid and p.category_id = p_category;
  insert into public.major_decisions (participant_id, segment, stop, intensity, source, submitted_at)
  select (d.value ->> 'participantId')::uuid, (d.value ->> 'segment')::integer, d.value ->> 'stop', d.value ->> 'intensity', 'AUTO', now()
  from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) d
  on conflict do nothing;
  update public.major_categories set phase = p_phase, segment = p_segment, phase_started_at = p_started_at,
    phase_ends_at = p_ends_at, version = version + 1
  where id = p_category;
  insert into public.major_log (event_id, kind, detail)
  values (cat.event_id, 'step', jsonb_build_object('category', cat.idx, 'from', cat.phase, 'to', p_phase, 'segment', p_segment));
  if p_phase = 'FINISHED' and not exists (
    select 1 from public.major_categories where event_id = cat.event_id and phase <> 'FINISHED'
  ) then
    update public.major_events set status = 'FINISHED' where id = cat.event_id and status = 'RUNNING';
    insert into public.major_log (event_id, kind) values (cat.event_id, 'finished');
  end if;
  return true;
end;
$$;

-- 3. A player's decision at an aid station: only while that window is open (the database's own
-- clock decides), as often as they like until it closes.
create or replace function public.major_decide(p_event uuid, p_user uuid, p_segment integer, p_stop text, p_intensity text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  part public.major_participants;
  cat public.major_categories;
begin
  select * into part from public.major_participants where event_id = p_event and user_id = p_user;
  if not found then raise exception 'major event % not on the grid', p_event; end if;
  select * into cat from public.major_categories where id = part.category_id for share;
  if cat.phase <> 'PA' or cat.segment <> p_segment or clock_timestamp() >= cat.phase_ends_at then
    raise exception 'major event % decision window is closed', p_event;
  end if;
  insert into public.major_decisions (participant_id, segment, stop, intensity, source, submitted_at)
  values (part.id, p_segment, p_stop, p_intensity, 'PLAYER', clock_timestamp())
  on conflict (participant_id, segment) do update
    set stop = excluded.stop, intensity = excluded.intensity, submitted_at = excluded.submitted_at
    where public.major_decisions.source = 'PLAYER';
  return true;
end;
$$;

-- 4. Access: players read the decisions of their own runner; everything else stays server-side.
alter table public.major_decisions enable row level security;
revoke all on table public.major_decisions from public, anon, authenticated;
grant select on table public.major_decisions to authenticated;
-- Whether a grid runner is the caller (the grid's user ids are not readable by players).
create or replace function public.major_is_mine(p_participant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.major_participants where id = p_participant and user_id = auth.uid())
$$;
revoke all on function public.major_is_mine(uuid) from public, anon;
grant execute on function public.major_is_mine(uuid) to authenticated;

create policy "Players read their own Major decisions"
on public.major_decisions for select to authenticated
using (public.major_is_mine(participant_id));


revoke all on function public.major_start(uuid, integer, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.major_commit_step(uuid, integer, text, integer, timestamptz, timestamptz, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.major_decide(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.major_start(uuid, integer, jsonb, timestamptz) to service_role;
grant execute on function public.major_commit_step(uuid, integer, text, integer, timestamptz, timestamptz, jsonb, jsonb, integer) to service_role;
grant execute on function public.major_decide(uuid, uuid, integer, text, text) to service_role;
