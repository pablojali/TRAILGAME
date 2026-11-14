-- Sunday Major: everything is set at READY (owner decision, 14 November 2026: "que todo se
-- reordene en el ready, incluyendo categoría").
--
-- A player may register early and keep training all week. When they confirm READY, their level is
-- taken again (p_level, from the career's XP) and their category follows it: a player who moved up
-- a band during the week races in the new one, joining its main list if it still has room, else its
-- waiting list. The runner snapshot (attributes, Fitness, Fatigue, equipment) was already taken at
-- READY. p_level is optional, so the function keeps working for a caller that does not send it.

drop function public.major_set_ready(uuid, uuid, jsonb, timestamptz);

create function public.major_set_ready(p_event uuid, p_user uuid, p_snapshot jsonb, p_now timestamptz, p_level integer default null)
returns public.major_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.major_events;
  reg public.major_registrations;
  cat public.major_categories;
  taken integer;
begin
  select * into ev from public.major_events where id = p_event for update;
  if not found then raise exception 'major event % not found', p_event; end if;
  if ev.status <> 'REGISTRATION_OPEN' or p_now < ev.ready_open_at or p_now >= ev.scheduled_start_at then
    raise exception 'major event % ready window is closed', p_event;
  end if;
  select * into reg from public.major_registrations
  where event_id = p_event and user_id = p_user and status in ('REGISTERED', 'READY')
  for update;
  if not found then raise exception 'major event % not registered', p_event; end if;
  if p_level is not null then
    select * into cat from public.major_categories
    where event_id = p_event and p_level >= min_level and (max_level is null or p_level <= max_level);
    if not found then raise exception 'major event % has no category for level %', p_event, p_level; end if;
    if cat.id <> reg.category_id then
      -- A new category: a place on its main list if there is room (others than this player).
      select count(*) into taken from public.major_registrations
      where category_id = cat.id and list = 'main' and status <> 'WITHDRAWN' and id <> reg.id;
      update public.major_registrations
      set category_id = cat.id, list = case when taken < ev.participant_limit then 'main' else 'waitlist' end
      where id = reg.id;
      insert into public.major_log (event_id, actor, kind, detail)
      values (p_event, p_user, 'category-changed', jsonb_build_object('level', p_level, 'category', cat.idx));
    end if;
    update public.major_registrations set level = p_level where id = reg.id;
  end if;
  update public.major_registrations set status = 'READY', ready_at = p_now, runner_snapshot = p_snapshot
  where id = reg.id
  returning * into reg;
  return reg;
end;
$$;
revoke all on function public.major_set_ready(uuid, uuid, jsonb, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.major_set_ready(uuid, uuid, jsonb, timestamptz, integer) to service_role;
