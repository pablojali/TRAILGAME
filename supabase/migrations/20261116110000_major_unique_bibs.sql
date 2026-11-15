-- Sunday Major: bib numbers (slots) unique in the whole event (owner decision, 15 November 2026:
-- "no quiero que se repitan dorsales"). Each band takes the next block of participant_limit
-- numbers: band 1 1–50, band 2 51–100, and so on. Slots used to restart at 1 in every band, which
-- also broke the first live-tracking start (fixed in the orchestrator, PR #74).

alter table public.major_participants drop constraint if exists major_participants_slot_check;
alter table public.major_participants add constraint major_participants_slot_check check (slot between 1 and 10000);
-- Existing grids (the pilots and the Major of 15 November 2026, which is running) take the same
-- numbering: band n moves to its block. States and decisions are kept by participant, not slot.
update public.major_participants p
set slot = p.slot + (c.idx - 1) * coalesce(e.participant_limit, 50)
from public.major_categories c, public.major_events e
where c.id = p.category_id and e.id = p.event_id and c.idx > 1 and p.slot <= coalesce(e.participant_limit, 50);
alter table public.major_participants add constraint major_participants_event_slot_key unique (event_id, slot);

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
  base integer;
  locked integer := 0;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found or ev.status <> 'REGISTRATION_OPEN' or p_now < ev.scheduled_start_at then return 0; end if;
  for cat in select * from public.major_categories where event_id = p_event order by idx loop
    -- Bibs are unique in the event (owner, 15 November 2026): each band takes the next block of
    -- participant_limit numbers (band 1: 1–50, band 2: 51–100…).
    base := (cat.idx - 1) * ev.participant_limit;
    slot_no := base;
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
    npcs_needed := ev.participant_limit - (slot_no - base);
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
    if slot_no - base <> ev.participant_limit then
      raise exception 'major event %: category % has % runners, not %', p_event, cat.idx, slot_no - base, ev.participant_limit;
    end if;
    locked := locked + 1;
  end loop;
  update public.major_events set status = 'LOCKED' where id = p_event;
  insert into public.major_log (event_id, kind, detail)
  values (p_event, 'locked', jsonb_build_object('categories', locked, 'at', p_now));
  return locked;
end;
$$;
