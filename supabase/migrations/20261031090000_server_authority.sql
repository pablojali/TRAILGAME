-- Trail Game — Phase 3B.1: server-authoritative progression (31 October 2026).
--
-- Training days, race days and attribute points now run on the server (Edge Function
-- `career-ops`, which reuses the game's TypeScript engine). The server owns XP, level, Fitness,
-- Fatigue, attributes, the completed days of the week and race results. Every write goes
-- through `commit_career`, which only the Edge Function (service role) may call. The client
-- writers `save_my_career` and `create_my_career` are removed by the next migration
-- (20261031090100), applied when the client that uses the Edge Function is released.
-- RLS and table privileges stay as they were: players read their own rows only.

-- ---------------------------------------------------------------------------------------------
-- career_operations: one row per completed server operation (training day, race day, attribute
-- point), keyed by the client's operation id, so a repeated request is answered with the stored
-- response instead of applying the action twice.
-- ---------------------------------------------------------------------------------------------
create table public.career_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('train', 'race', 'allocate', 'save', 'new-career')),
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index career_operations_user_idx on public.career_operations (user_id, created_at);

alter table public.career_operations enable row level security;
-- No policies: no client may read or write it.
revoke all on public.career_operations from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- commit_career: the only write path for careers (service role only). In one transaction, with
-- the player's career row locked:
--   - an operation id already used returns the stored response ('duplicate'), never re-applied;
--   - the write happens only if the career is still at `base_version` ('conflict' otherwise);
--   - race_entries and owned_equipment are rewritten from the snapshot;
--   - the operation is recorded with its response.
-- base_version null creates the player's profile and career when none exists.
-- ---------------------------------------------------------------------------------------------
create or replace function public.commit_career(
  p_user uuid,
  p_base_version integer,
  p_state jsonb,
  p_schema_version integer,
  p_operation_id uuid,
  p_kind text,
  p_response jsonb
)
returns table (status text, version integer, response jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  existing public.careers%rowtype;
  previous public.career_operations%rowtype;
  new_id uuid;
  new_version integer;
begin
  if p_user is null then
    raise exception 'No user' using errcode = '22023';
  end if;
  if p_schema_version is distinct from 2 then
    raise exception 'Unsupported save schema version %', p_schema_version using errcode = '22023';
  end if;
  if not public.is_career_snapshot(p_state) then
    raise exception 'Malformed career snapshot' using errcode = '22023';
  end if;

  -- Serializes every write of this player's career (and its operations).
  select * into existing from public.careers c where c.user_id = p_user for update;

  if p_operation_id is not null then
    select * into previous from public.career_operations o where o.operation_id = p_operation_id;
    if found then
      if previous.user_id <> p_user then
        return query select 'foreign-operation'::text, existing.version, null::jsonb;
      else
        return query select 'duplicate'::text, existing.version, previous.response;
      end if;
      return;
    end if;
  end if;

  if existing.id is null then
    if p_base_version is not null then
      return query select 'conflict'::text, null::integer, null::jsonb;
      return;
    end if;
    insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
    insert into public.careers (user_id, game_state, schema_version)
    values (p_user, p_state, p_schema_version)
    on conflict (user_id) do nothing
    returning id into new_id;
    if new_id is null then
      return query select 'conflict'::text, c.version, null::jsonb from public.careers c where c.user_id = p_user;
      return;
    end if;
    new_version := 1;
    perform public.sync_career_rows(new_id, p_state);
  else
    if p_base_version is distinct from existing.version then
      return query select 'conflict'::text, existing.version, null::jsonb;
      return;
    end if;
    update public.careers c
    set game_state = p_state, schema_version = p_schema_version, version = existing.version + 1
    where c.id = existing.id
    returning c.version into new_version;
    perform public.sync_career_rows(existing.id, p_state);
  end if;

  if p_operation_id is not null then
    insert into public.career_operations (operation_id, user_id, kind, response)
    values (p_operation_id, p_user, p_kind, coalesce(p_response, '{}'::jsonb) || jsonb_build_object('version', new_version));
  end if;

  return query select 'saved'::text, new_version, coalesce(p_response, '{}'::jsonb) || jsonb_build_object('version', new_version);
end;
$$;

revoke all on function public.commit_career(uuid, integer, jsonb, integer, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_career(uuid, integer, jsonb, integer, uuid, text, jsonb) to service_role;
