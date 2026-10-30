-- Trail Game — Phase 2C: cloud saves of the career snapshot (30 October 2026).
--
-- The client still cannot write tables directly (RLS and privileges unchanged). Saving goes through
-- `save_my_career`, a security definer function that:
--   - writes only the caller's own career (auth.uid());
--   - checks the snapshot's shape and schema version (not game rules: the snapshot is a cloud
--     backup, not anti-cheat; client values are not authoritative for future competitive features);
--   - uses optimistic concurrency: the write succeeds only if the device saw the current version,
--     so an older snapshot or another device's write is never overwritten silently;
--   - keeps race_entries and owned_equipment equal to the snapshot, in the same transaction.
-- coin_transactions stays empty until server-side game operations exist (no history invented).

-- ---------------------------------------------------------------------------------------------
-- The shape of a GameState snapshot (schema v2) that the database relies on. The app's own parser
-- (parseGameState) checks every field before loading a snapshot.
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_career_snapshot(snapshot jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce: a missing field makes the checks null, which must count as malformed.
  select coalesce(
    jsonb_typeof(snapshot) = 'object'
    and pg_column_size(snapshot) <= 524288
    and jsonb_typeof(snapshot -> 'athlete') = 'object'
    and jsonb_typeof(snapshot -> 'athlete' -> 'name') = 'string'
    and jsonb_typeof(snapshot -> 'athlete' -> 'profile') = 'string'
    and jsonb_typeof(snapshot -> 'athlete' -> 'xp') = 'number'
    and jsonb_typeof(snapshot -> 'week') = 'object'
    and jsonb_typeof(snapshot -> 'week' -> 'number') = 'number'
    and jsonb_typeof(snapshot -> 'week' -> 'days') = 'array'
    and jsonb_array_length(snapshot -> 'week' -> 'days') = 7
    and jsonb_typeof(snapshot -> 'coins') = 'number'
    and (snapshot ->> 'coins')::numeric >= 0
    and jsonb_typeof(snapshot -> 'raceEntries') = 'array'
    and jsonb_typeof(snapshot -> 'equipment') = 'array'
    and jsonb_typeof(snapshot -> 'ownedEquipment') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(snapshot -> 'ownedEquipment') as item
      where jsonb_typeof(item) <> 'string'
    )
    and not exists (
      select 1 from jsonb_array_elements(snapshot -> 'raceEntries') as entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or jsonb_typeof(entry -> 'raceId') <> 'string'
        or (entry ->> 'status') not in ('pending', 'finished')
    )
    and (
      select count(*) = count(distinct entry ->> 'id')
      from jsonb_array_elements(snapshot -> 'raceEntries') as entry
    ),
    false)
$$;

-- ---------------------------------------------------------------------------------------------
-- Keeps race_entries and owned_equipment equal to a career's snapshot.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sync_career_rows(target_career uuid, snapshot jsonb)
returns void
language sql
set search_path = ''
as $$
  delete from public.owned_equipment e
  where e.career_id = target_career
    and e.item_id not in (select jsonb_array_elements_text(snapshot -> 'ownedEquipment'));

  insert into public.owned_equipment (career_id, item_id)
  select target_career, item from jsonb_array_elements_text(snapshot -> 'ownedEquipment') as item
  on conflict do nothing;

  delete from public.race_entries r
  where r.career_id = target_career
    and r.entry_id not in (select entry ->> 'id' from jsonb_array_elements(snapshot -> 'raceEntries') as entry);

  insert into public.race_entries (career_id, entry_id, race_id, status, entry_data)
  select target_career, entry ->> 'id', entry ->> 'raceId', entry ->> 'status', entry
  from jsonb_array_elements(snapshot -> 'raceEntries') as entry
  on conflict (career_id, entry_id) do update
    set race_id = excluded.race_id, status = excluded.status, entry_data = excluded.entry_data
    where public.race_entries.entry_data is distinct from excluded.entry_data;
$$;

revoke all on function public.is_career_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.sync_career_rows(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- save_my_career: stores the caller's career snapshot.
--   base_version null: the device knows no cloud career; creates one, or reports a conflict if
--   one already exists. base_version n: replaces the career only if it is still at version n.
-- Returns the career id, its version after the call and whether this call saved. saved = false
-- means a conflict: nothing was written, and `version` is the cloud's current version (null when
-- the device expected a career that no longer exists).
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_my_career(snapshot jsonb, snapshot_schema_version integer, base_version integer)
returns table (career_id uuid, version integer, saved boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  existing public.careers%rowtype;
  new_id uuid;
  new_version integer;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if snapshot_schema_version is distinct from 2 then
    raise exception 'Unsupported save schema version %', snapshot_schema_version using errcode = '22023';
  end if;
  if not public.is_career_snapshot(snapshot) then
    raise exception 'Malformed career snapshot' using errcode = '22023';
  end if;

  select * into existing from public.careers c where c.user_id = caller for update;

  if not found then
    if base_version is not null then
      return query select null::uuid, null::integer, false;
      return;
    end if;
    insert into public.profiles (id) values (caller) on conflict (id) do nothing;
    insert into public.careers (user_id, game_state, schema_version)
    values (caller, snapshot, snapshot_schema_version)
    on conflict (user_id) do nothing
    returning id into new_id;
    if new_id is null then
      -- Created at the same moment by another device: report it as a conflict.
      return query select c.id, c.version, false from public.careers c where c.user_id = caller;
      return;
    end if;
    perform public.sync_career_rows(new_id, snapshot);
    return query select new_id, 1, true;
    return;
  end if;

  if base_version is distinct from existing.version then
    return query select existing.id, existing.version, false;
    return;
  end if;

  update public.careers c
  set game_state = snapshot, schema_version = snapshot_schema_version, version = existing.version + 1
  where c.id = existing.id
  returning c.version into new_version;
  perform public.sync_career_rows(existing.id, snapshot);
  return query select existing.id, new_version, true;
end;
$$;

revoke all on function public.save_my_career(jsonb, integer, integer) from public, anon;
grant execute on function public.save_my_career(jsonb, integer, integer) to authenticated;
