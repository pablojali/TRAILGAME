-- World and country rankings (owner requests, 5 November 2026). Asynchronous: every player races in
-- their own career. The race results the server decides (Edge Function career-ops) carry
-- `rankingSeason` (year × 100 + calendar month, UTC), `rankingPoints` and `rankingAt` (when the
-- server finished the race). Two rankings:
--   season: each player's best results of one season (one calendar month);
--   annual: each season's best results, counted while they are less than 12 months old.

-- 1. The results, kept apart from the careers: append-only, written only by the trigger below (so
-- only by the server, the only writer of careers). A career that is restarted keeps its past
-- results here, for past seasons and a future hall of fame. Players cannot read or write it: the
-- ranking function below is the only way in.
create table public.ranking_results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_id text not null,
  race_id text not null,
  season integer not null check (season between 190001 and 999912 and season % 100 between 1 and 12),
  finished_at timestamptz not null,
  points integer not null check (points >= 0),
  recorded_at timestamptz not null default now(),
  primary key (user_id, finished_at, entry_id)
);

create index ranking_results_season on public.ranking_results (season, user_id);
create index ranking_results_finished on public.ranking_results (finished_at);

alter table public.ranking_results enable row level security;
revoke all on table public.ranking_results from public, anon, authenticated;

-- Copies the new ranked results of a career into ranking_results (never changes or removes one).
create or replace function public.record_ranking_results()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ranking_results (user_id, entry_id, race_id, season, finished_at, points)
  select new.user_id,
         e ->> 'id',
         coalesce(e ->> 'raceId', ''),
         (e -> 'result' ->> 'rankingSeason')::integer,
         to_timestamp((e -> 'result' ->> 'rankingAt')::double precision / 1000),
         (e -> 'result' ->> 'rankingPoints')::integer
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

create trigger careers_record_ranking_results
after insert or update of game_state on public.careers
for each row execute function public.record_ranking_results();

-- Results already in careers (none before launch; kept for safety).
insert into public.ranking_results (user_id, entry_id, race_id, season, finished_at, points)
select c.user_id, e ->> 'id', coalesce(e ->> 'raceId', ''), (e -> 'result' ->> 'rankingSeason')::integer,
       to_timestamp((e -> 'result' ->> 'rankingAt')::double precision / 1000), (e -> 'result' ->> 'rankingPoints')::integer
from public.careers c
cross join lateral jsonb_array_elements(coalesce(c.game_state -> 'raceEntries', '[]'::jsonb)) e
where e ->> 'status' = 'finished'
  and jsonb_typeof(e -> 'id') = 'string'
  and jsonb_typeof(e -> 'result' -> 'rankingSeason') = 'number'
  and jsonb_typeof(e -> 'result' -> 'rankingPoints') = 'number'
  and jsonb_typeof(e -> 'result' -> 'rankingAt') = 'number'
on conflict do nothing;

-- 2. The rankings. Only public fields (runner name, country, sex, XP for the level, points) of the
-- ranked players, plus the caller's own row; nothing of anyone's race history.
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
  -- Each result's place among the player's results of its season (best first).
  seasonal as (
    select r.user_id, r.points, r.finished_at,
           row_number() over (partition by r.user_id, r.season order by r.points desc, r.finished_at) as place
    from public.ranking_results r, params
    where (p_mode = 'season' and r.season = p_season)
       or (p_mode = 'annual' and r.season >= (extract(year from params.since at time zone 'UTC')::integer * 100
                                            + extract(month from params.since at time zone 'UTC')::integer))
  ),
  totals as (
    select s.user_id, sum(s.points) as total
    from seasonal s, params
    where s.place <= params.best_count
      and (p_mode = 'season' or s.finished_at >= params.since)
    group by s.user_id
    having sum(s.points) > 0
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
  from ranked, params
  where position <= params.row_limit or user_id = auth.uid()
  order by position, runner_name;
$$;

revoke all on function public.get_ranking(text, integer, text, text, integer, integer, integer) from public, anon;
grant execute on function public.get_ranking(text, integer, text, text, integer, integer, integer) to authenticated;
