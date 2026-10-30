-- Trail Game — Phase 3B.1: clients can no longer write career snapshots (31 October 2026).
--
-- Applied together with the release of the client that saves through the `career-ops` Edge
-- Function (20261031090000 must be applied first). Until then, the released client still saves
-- with save_my_career.

-- ---------------------------------------------------------------------------------------------
-- Clients can no longer write snapshots directly: the Edge Function decides which fields a
-- client may change and commits through commit_career. The client-callable writers are removed.
-- ---------------------------------------------------------------------------------------------
drop function public.save_my_career(jsonb, integer, integer);
drop function public.create_my_career(jsonb, integer);
