-- World and country rankings (owner request, 5 November 2026). Asynchronous: every player races in
-- their own career, and the race results the server decided (Edge Function career-ops) carry
-- `rankingSeason` and `rankingPoints`. This function adds up each player's best results of a
-- season and returns only public fields (runner name, country, sex, XP, points) of the ranked
-- players, plus the caller's own row. The careers table and its row level security are unchanged:
-- the function reads them as its owner and exposes nothing else.

create or replace function public.get_ranking(
  p_season integer,
  p_country text default null,
  p_sex text default null,
  p_best integer default 10,
  p_limit integer default 50
)
returns table (rank bigint, name text, country text, sex text, xp integer, points bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with results as (
    select c.user_id,
           (e -> 'result' ->> 'rankingPoints')::integer as result_points,
           row_number() over (
             partition by c.user_id
             order by (e -> 'result' ->> 'rankingPoints')::integer desc
           ) as best
    from public.careers c
    cross join lateral jsonb_array_elements(coalesce(c.game_state -> 'raceEntries', '[]'::jsonb)) e
    where e ->> 'status' = 'finished'
      and jsonb_typeof(e -> 'result' -> 'rankingPoints') = 'number'
      and (e -> 'result' ->> 'rankingSeason') = p_season::text
  ),
  totals as (
    select user_id, sum(result_points) as total
    from results
    where best <= greatest(1, least(coalesce(p_best, 10), 50))
    group by user_id
    having sum(result_points) > 0
  ),
  players as (
    select t.user_id,
           t.total,
           left(coalesce(c.game_state -> 'athlete' ->> 'name', ''), 16) as runner_name,
           c.game_state -> 'athlete' ->> 'country' as runner_country,
           c.game_state -> 'athlete' ->> 'sex' as runner_sex,
           case when jsonb_typeof(c.game_state -> 'athlete' -> 'xp') = 'number'
                then (c.game_state -> 'athlete' ->> 'xp')::integer else 0 end as runner_xp
    from totals t
    join public.careers c on c.user_id = t.user_id
    where (p_country is null or c.game_state -> 'athlete' ->> 'country' = p_country)
      and (p_sex is null or c.game_state -> 'athlete' ->> 'sex' = p_sex)
  ),
  ranked as (
    select rank() over (order by total desc) as position, *
    from players
  )
  select position, runner_name, runner_country, runner_sex, runner_xp, total, user_id = auth.uid()
  from ranked
  where position <= greatest(1, least(coalesce(p_limit, 50), 200)) or user_id = auth.uid()
  order by position, runner_name;
$$;

revoke all on function public.get_ranking(integer, text, text, integer, integer) from public, anon;
grant execute on function public.get_ranking(integer, text, text, integer, integer) to authenticated;
