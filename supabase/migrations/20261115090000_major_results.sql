-- Sunday Major, phase 5 (owner specification §9.3; owner requests of 11 November 2026).
--
-- 1. Results: when a category finishes, every runner's place and time (`major_results`) and, for
--    each player, a reward (`major_rewards`) that the Edge Function career-ops adds to the career
--    at the player's next request (the orchestrator never writes careers). Both are written by
--    `major_commit_step` in the same transaction as the finish, once.
-- 2. Ranking: `ranking_results.competition` ('standard' or 'major'), from the career's result.
-- 3. NPCs are not identifiable by players: they no longer read `kind` of the grid; an NPC's name
--    ends with a full stop (a players' name never does), the only hint (owner request).

-- 1. Results and rewards. Only the service role reads or writes them (major-ops, career-ops).
create table public.major_results (
  participant_id uuid primary key references public.major_participants (id) on delete cascade,
  event_id uuid not null references public.major_events (id) on delete cascade,
  category_id uuid not null references public.major_categories (id) on delete cascade,
  position integer not null check (position between 1 and 50),
  time_s integer not null check (time_s >= 0),
  recorded_at timestamptz not null default now(),
  unique (category_id, position)
);

create table public.major_rewards (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.major_participants (id) on delete cascade,
  event_id uuid not null references public.major_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index major_rewards_pending on public.major_rewards (user_id) where claimed_at is null;

alter table public.major_results enable row level security;
alter table public.major_rewards enable row level security;
revoke all on table public.major_results, public.major_rewards from public, anon, authenticated;

drop function public.major_commit_step(uuid, integer, text, integer, timestamptz, timestamptz, jsonb, jsonb, integer);

create function public.major_commit_step(
  p_category uuid,
  p_version integer,
  p_phase text,
  p_segment integer,
  p_started_at timestamptz,
  p_ends_at timestamptz,
  p_states jsonb,
  p_decisions jsonb,
  p_player_decisions_seen integer,
  p_results jsonb default null,
  p_rewards jsonb default null
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
  if p_phase = 'FINISHED' then
    insert into public.major_results (participant_id, event_id, category_id, position, time_s)
    select p.id, p.event_id, p.category_id, (r.value ->> 'position')::integer, (r.value ->> 'timeS')::integer
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
    join public.major_participants p on p.id = (r.value ->> 'participantId')::uuid and p.category_id = p_category
    on conflict do nothing;
    -- A reward for each player still on the grid with an account; never for an NPC.
    insert into public.major_rewards (participant_id, event_id, user_id, payload)
    select p.id, p.event_id, p.user_id, w.value -> 'payload'
    from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb)) w
    join public.major_participants p on p.id = (w.value ->> 'participantId')::uuid and p.category_id = p_category
    where p.kind = 'PLAYER' and p.user_id is not null
    on conflict do nothing;
  end if;
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
revoke all on function public.major_commit_step(uuid, integer, text, integer, timestamptz, timestamptz, jsonb, jsonb, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.major_commit_step(uuid, integer, text, integer, timestamptz, timestamptz, jsonb, jsonb, integer, jsonb, jsonb) to service_role;

-- 2. The competition of each ranked result: a Major's career entry carries `major`.
alter table public.ranking_results add column competition text not null default 'standard' check (competition in ('standard', 'major', 'world_cup'));

create or replace function public.record_ranking_results()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ranking_results (user_id, entry_id, race_id, season, finished_at, points, competition)
  select new.user_id,
         e ->> 'id',
         coalesce(e ->> 'raceId', ''),
         (e -> 'result' ->> 'rankingSeason')::integer,
         to_timestamp((e -> 'result' ->> 'rankingAt')::double precision / 1000),
         (e -> 'result' ->> 'rankingPoints')::integer,
         case when jsonb_typeof(e -> 'major') = 'object' then 'major' else 'standard' end
  from jsonb_array_elements(coalesce(new.game_state -> 'raceEntries', '[]'::jsonb)) e
  where e ->> 'status' = 'finished'
    and jsonb_typeof(e -> 'id') = 'string'
    and jsonb_typeof(e -> 'result' -> 'rankingSeason') = 'number'
    and jsonb_typeof(e -> 'result' -> 'rankingPoints') = 'number'
    and jsonb_typeof(e -> 'result' -> 'rankingAt') = 'number'
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.record_ranking_results() from public, anon, authenticated;

-- 3. NPCs not identifiable: names (an NPC's ends with '.', a player's never does) and no `kind`.
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
      values (p_event, cat.id, slot_no, 'PLAYER', npc.user_id, npc.id, coalesce(nullif(rtrim(btrim(npc.runner_name), '.'), ''), 'Runner'), npc.country, npc.level, npc.runner_snapshot, npc.plan);
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
      values (p_event, cat.id, slot_no, 'NPC', npc.id, rtrim(npc.name, '.') || '.', npc.country,
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


revoke select on table public.major_participants from authenticated;
grant select (id, event_id, category_id, slot, display_name, country, level) on table public.major_participants to authenticated;

-- 4. career-ops `claim`: adds the waiting Major results to the career right after the finish.
alter table public.career_operations drop constraint career_operations_kind_check;
alter table public.career_operations
  add constraint career_operations_kind_check
  check (kind in ('train', 'race', 'race-start', 'race-step', 'allocate', 'buy', 'equip', 'enter-race', 'save', 'new-career', 'claim'));
