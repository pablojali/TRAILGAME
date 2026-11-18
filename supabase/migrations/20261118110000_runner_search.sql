-- Searching runners by name (owner request, 18 November 2026): from Base Camp › Amigos, a player
-- types part of a runner's name and opens their refuge (to visit them or ask to be friends).
-- Players and ranking NPCs are searched alike, so NPCs look like any runner. Only the name,
-- country and XP are returned, as in the rankings.

create function public.runner_search(p_query text)
returns table (name text, country text, xp integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  query_text text := lower(btrim(coalesce(p_query, '')));
  escaped text;
  pattern text;
begin
  if me is null then
    raise exception 'not-signed-in' using errcode = '42501';
  end if;
  if char_length(query_text) < 2 or char_length(query_text) > 40 then
    raise exception 'bad-query' using errcode = '22023';
  end if;
  -- The words of the query, as typed: % and _ match themselves.
  escaped := replace(replace(replace(query_text, '\', '\\'), '%', '\%'), '_', '\_');
  pattern := '%' || escaped || '%';
  return query
  select found.name, found.country, found.xp
  from (
    select c.game_state -> 'athlete' ->> 'name' as name,
           c.game_state -> 'athlete' ->> 'country' as country,
           case when jsonb_typeof(c.game_state -> 'athlete' -> 'xp') = 'number' then (c.game_state -> 'athlete' ->> 'xp')::numeric::integer else 0 end as xp
    from public.careers c
    where c.user_id <> me and lower(btrim(c.game_state -> 'athlete' ->> 'name')) like pattern
    union all
    select n.name, n.country, n.xp from public.ranking_npcs n where lower(btrim(n.name)) like pattern
  ) found
  where found.name is not null
  -- Names that start with the query first, then the rest, alphabetically.
  order by (lower(btrim(found.name)) like escaped || '%') desc, lower(found.name)
  limit 12;
end;
$$;
revoke all on function public.runner_search(text) from public, anon;
grant execute on function public.runner_search(text) to authenticated;
