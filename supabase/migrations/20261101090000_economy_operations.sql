-- Trail Game — Phase 3B.2: server-authoritative economy and equipment (1 November 2026).
--
-- Purchases, equipping and race entry now run in the Edge Function `career-ops` like training
-- and race days (Phase 3B.1), and are recorded in career_operations under their operation id so a
-- repeated request is never applied twice. The only database change: the operation kinds allowed
-- in career_operations. commit_career, RLS and privileges are unchanged (players still read
-- their own rows only and cannot write; only the service role commits).

alter table public.career_operations drop constraint career_operations_kind_check;
alter table public.career_operations
  add constraint career_operations_kind_check
  check (kind in ('train', 'race', 'allocate', 'buy', 'equip', 'enter-race', 'save', 'new-career'));
