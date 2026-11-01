-- Trail Game — Race Engine & Strategy V1 (1 November 2026).
--
-- A race is now run segment by segment in the Edge Function `career-ops`: `race-start` runs the
-- first segment and `race-step` each following one (the last step finishes the race). The race in
-- progress lives inside the career's game_state (`activeRace`), committed through commit_career
-- like every other change. The only database change: the operation kinds allowed in
-- career_operations. 'race' stays allowed because operations recorded before this change keep
-- their kind; the Edge Function no longer accepts it. commit_career, RLS and privileges are
-- unchanged.

alter table public.career_operations drop constraint career_operations_kind_check;
alter table public.career_operations
  add constraint career_operations_kind_check
  check (kind in ('train', 'race', 'race-start', 'race-step', 'allocate', 'buy', 'equip', 'enter-race', 'save', 'new-career'));
