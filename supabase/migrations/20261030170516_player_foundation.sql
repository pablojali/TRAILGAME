-- Trail Game — Phase 2A: player data foundation (30 October 2026).
--
-- One Supabase user (anonymous first, linked to email/Apple/Google later) = one profile = one
-- career. Clients can only READ their own rows; every write goes through server-side code:
-- `create_my_career` below now, Edge Functions or secure functions for game operations later.
-- Game catalogs (races, sessions, equipment, levels) stay in TypeScript, the source of truth.
-- Deleting the auth user (in-app account deletion, later) deletes all of the player's data.

-- ---------------------------------------------------------------------------------------------
-- Shared: keep updated_at current.
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- profiles: the player's account, keyed by the auth identity (no auth data duplicated).
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- careers: the player's one career. game_state is the GameState snapshot read by the app's save
-- parser (parseGameState), unchanged; schema_version is the save schema (2 today); version
-- rises by one on every write, for optimistic concurrency (later phases).
-- ---------------------------------------------------------------------------------------------
create table public.careers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  game_state jsonb not null check (jsonb_typeof(game_state) = 'object'),
  schema_version integer not null check (schema_version >= 1),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A career snapshot is a few kilobytes; this stops abuse of the column as storage.
  constraint careers_game_state_size check (pg_column_size(game_state) <= 1048576)
);

create trigger careers_set_updated_at
before update on public.careers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- race_entries: one row per race entry, for queries independent of the snapshot. entry_id is the
-- game's own id (`entry-N`, unique within a career); entry_data is the entry with its result, as
-- the game stores it.
-- ---------------------------------------------------------------------------------------------
create table public.race_entries (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers (id) on delete cascade,
  entry_id text not null,
  race_id text not null,
  status text not null check (status in ('pending', 'finished')),
  entry_data jsonb not null check (jsonb_typeof(entry_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_entries_career_entry_unique unique (career_id, entry_id)
);

create index race_entries_career_race_idx on public.race_entries (career_id, race_id);

create trigger race_entries_set_updated_at
before update on public.race_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- owned_equipment: items owned by the career (ids from the TypeScript equipment catalog).
-- ---------------------------------------------------------------------------------------------
create table public.owned_equipment (
  career_id uuid not null references public.careers (id) on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (career_id, item_id)
);

-- ---------------------------------------------------------------------------------------------
-- coin_transactions: append-only coin ledger, written only by server-side code (later phases).
-- No history is reconstructed from current balances.
-- ---------------------------------------------------------------------------------------------
create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers (id) on delete cascade,
  amount integer not null check (amount <> 0),
  transaction_type text not null check (length(transaction_type) between 1 and 64),
  reference_id text,
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create index coin_transactions_career_created_idx on public.coin_transactions (career_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: players read only their own rows; no client writes at all.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.careers enable row level security;
alter table public.race_entries enable row level security;
alter table public.owned_equipment enable row level security;
alter table public.coin_transactions enable row level security;

-- Table privileges as a second barrier: Supabase grants anon and authenticated everything on new
-- public tables by default. Signed-out visitors get nothing; signed-in players (including
-- anonymous ones) may only SELECT, filtered by the policies below.
revoke all on public.profiles, public.careers, public.race_entries, public.owned_equipment,
  public.coin_transactions from anon, authenticated;
grant select on public.profiles, public.careers, public.race_entries, public.owned_equipment,
  public.coin_transactions to authenticated;

create policy "Players read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Players read their own career"
on public.careers for select to authenticated
using (user_id = (select auth.uid()));

create policy "Players read their own race entries"
on public.race_entries for select to authenticated
using (career_id in (select c.id from public.careers c where c.user_id = (select auth.uid())));

create policy "Players read their own equipment"
on public.owned_equipment for select to authenticated
using (career_id in (select c.id from public.careers c where c.user_id = (select auth.uid())));

create policy "Players read their own coin transactions"
on public.coin_transactions for select to authenticated
using (career_id in (select c.id from public.careers c where c.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------------------------
-- create_my_career: creates the caller's profile and career once. Idempotent: called again (a
-- retry, a second device, StrictMode), it creates nothing and returns the existing career.
-- Accepts only a brand-new career (Level 1, starting coins, week 1, no races), so it cannot be
-- used to plant progress; importing an existing local career is a later phase.
-- Keep the checks in step with createInitialGameState (src/game-engine/gameState.ts):
-- STARTING_COINS = 25, OWNED_FROM_START = ['starter-shoes'].
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_my_career(initial_state jsonb, initial_schema_version integer)
returns table (career_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if initial_schema_version is distinct from 2 then
    raise exception 'Unsupported save schema version %', initial_schema_version using errcode = '22023';
  end if;
  if jsonb_typeof(initial_state) is distinct from 'object'
    or jsonb_typeof(initial_state -> 'athlete') is distinct from 'object'
    or (initial_state -> 'athlete' ->> 'xp') is distinct from '0'
    or (initial_state -> 'athlete' ->> 'spentAttributePoints') is distinct from '0'
    or (initial_state ->> 'coins') is distinct from '25'
    or (initial_state -> 'week' ->> 'number') is distinct from '1'
    or (initial_state -> 'week' ->> 'currentDayIndex') is distinct from '0'
    or (initial_state -> 'raceEntries') is distinct from '[]'::jsonb
    or (initial_state -> 'equipment') is distinct from '[]'::jsonb
    or (initial_state -> 'ownedEquipment') is distinct from '["starter-shoes"]'::jsonb
    or pg_column_size(initial_state) > 65536
  then
    raise exception 'Not a new career' using errcode = '22023';
  end if;

  insert into public.profiles (id) values (caller) on conflict (id) do nothing;

  insert into public.careers (user_id, game_state, schema_version)
  values (caller, initial_state, initial_schema_version)
  on conflict (user_id) do nothing
  returning id into new_id;

  if new_id is null then
    return query select c.id, false from public.careers c where c.user_id = caller;
    return;
  end if;

  insert into public.owned_equipment (career_id, item_id)
  select new_id, item from jsonb_array_elements_text(initial_state -> 'ownedEquipment') as item;

  return query select new_id, true;
end;
$$;

revoke all on function public.create_my_career(jsonb, integer) from public, anon;
grant execute on function public.create_my_career(jsonb, integer) to authenticated;
