-- One general classification for everyone (owner decision, 5 November 2026; Game Design Bible
-- §11.1): the ranking no longer filters by sex. p_sex stays in the signature, ignored, so clients
-- already published keep working; it goes away with the next change to the ranking function.

create or replace function public.get_ranking(
  p_mode text,
  p_season integer default null,
  p_country text default null,
  p_sex text default null,
  p_best integer default 10,
  p_limit integer default 50,
  p_months integer default 12
)
returns table (rank bigint, name text, country text, sex text, xp integer, points bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select greatest(1, least(coalesce(p_best, 10), 50)) as best_count,
           greatest(1, least(coalesce(p_limit, 50), 200)) as row_limit,
           now() - make_interval(months => greatest(1, least(coalesce(p_months, 12), 24))) as since
  ),
  -- Real players with ranking points (ever), by country: each retires one NPC of that country.
  real_by_country as (
    select c.game_state -> 'athlete' ->> 'country' as country, count(*) as players
    from public.careers c
    where exists (select 1 from public.ranking_results r where r.user_id = c.user_id)
    group by 1
  ),
  active_npcs as (
    select n.*
    from (select n.*, row_number() over (partition by n.country order by n.list_order) as place from public.ranking_npcs n) n
    left join real_by_country rc on rc.country = n.country
    where n.place > coalesce(rc.players, 0)
  ),
  results as (
    select r.user_id::text as runner, r.season, r.points, r.finished_at
    from public.ranking_results r
    union all
    select 'npc:' || x.npc_id, x.season, x.points, x.finished_at
    from params,
         public.npc_ranking_results(case when p_mode = 'season'
                                         then make_date(p_season / 100, greatest(1, least(p_season % 100, 12)), 1)
                                         else (params.since at time zone 'UTC')::date end) x
    where x.npc_id in (select id from active_npcs)
  ),
  -- Each result's place among the runner's results of its season (best first).
  seasonal as (
    select r.runner, r.points, r.finished_at,
           row_number() over (partition by r.runner, r.season order by r.points desc, r.finished_at) as place
    from results r, params
    where (p_mode = 'season' and r.season = p_season)
       or (p_mode = 'annual' and r.season >= (extract(year from params.since at time zone 'UTC')::integer * 100
                                            + extract(month from params.since at time zone 'UTC')::integer))
  ),
  totals as (
    select s.runner, sum(s.points) as total
    from seasonal s, params
    where s.place <= params.best_count
      and (p_mode = 'season' or s.finished_at >= params.since)
    group by s.runner
    having sum(s.points) > 0
  ),
  players as (
    select t.runner,
           t.total,
           left(coalesce(c.game_state -> 'athlete' ->> 'name', ''), 16) as runner_name,
           c.game_state -> 'athlete' ->> 'country' as runner_country,
           c.game_state -> 'athlete' ->> 'sex' as runner_sex,
           case when jsonb_typeof(c.game_state -> 'athlete' -> 'xp') = 'number'
                then (c.game_state -> 'athlete' ->> 'xp')::integer else 0 end as runner_xp
    from totals t
    join public.careers c on c.user_id::text = t.runner
    union all
    select t.runner, t.total, n.name, n.country, n.sex, n.xp
    from totals t
    join active_npcs n on 'npc:' || n.id = t.runner
  ),
  ranked as (
    select rank() over (order by total desc) as position, *
    from players
    where (p_country is null or runner_country = p_country)
  )
  select position, runner_name, runner_country, runner_sex, runner_xp, total, coalesce(runner = auth.uid()::text, false)
  from ranked, params
  where position <= params.row_limit or runner = auth.uid()::text
  order by position, runner_name;
$$;

revoke all on function public.get_ranking(text, integer, text, text, integer, integer, integer) from public, anon;
grant execute on function public.get_ranking(text, integer, text, text, integer, integer, integer) to authenticated;
