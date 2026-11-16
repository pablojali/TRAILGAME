-- Base Camp pieces and Premium Coins (owner design, 16 November 2026): career-ops records three new
-- operations. The pieces and the balance live in the career state, written only by career-ops.
alter table public.career_operations drop constraint career_operations_kind_check;
alter table public.career_operations
  add constraint career_operations_kind_check
  check (kind in ('train', 'race', 'race-start', 'race-step', 'allocate', 'buy', 'equip', 'enter-race', 'save', 'new-career', 'claim',
                  'camp-buy', 'camp-use', 'premium-exchange'));
