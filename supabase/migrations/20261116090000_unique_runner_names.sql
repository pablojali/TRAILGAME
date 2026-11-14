-- Unique runner names (owner decision, 14 November 2026: "únicos, siempre únicos").
--
-- A player's runner name is unique among all players and all ranking NPCs, ignoring case and the
-- spaces around it. Checked when a career is created or its name changes; careers already saved
-- keep theirs (there were no repeated names when this was applied). A refusal reaches the Edge
-- Function `career-ops` as a unique violation (23505) and the game as `name-taken`.

-- 1. Players: one career per name.
create unique index careers_runner_name_key
  on public.careers (lower(btrim(game_state -> 'athlete' ->> 'name')));

-- 2. NPCs: a player cannot take the name of a ranking NPC.
create function public.careers_runner_name_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name_key text := lower(btrim(new.game_state -> 'athlete' ->> 'name'));
begin
  if tg_op = 'UPDATE' and name_key is not distinct from lower(btrim(old.game_state -> 'athlete' ->> 'name')) then
    return new;
  end if;
  if exists (select 1 from public.ranking_npcs n where lower(btrim(n.name)) = name_key) then
    raise exception 'runner-name-taken: %', name_key using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function public.careers_runner_name_check() from public, anon, authenticated;

create trigger careers_runner_name_check
before insert or update of game_state on public.careers
for each row execute function public.careers_runner_name_check();
