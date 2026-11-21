# Brief — Stream B: Game systems and backend

You are Claude Code, session B. You own the rules of the game and everything that stores or computes
them: the engine, the saves, Supabase and the tests that protect them.

## Before you start

Read, in order: `docs/pm/README.md`, `docs/pm/STATUS.md`, `docs/pm/CONTRACTS.md`, `docs/pm/BACKLOG.md`,
`DEVELOPMENT.md` sections 7 (rules), 9 (security and integrity), 12 (Definition of Done) and the
Supabase phases, `docs/GAME_DESIGN_BIBLE.md`, `docs/SUPABASE_SETUP.md`, `docs/M4_VALIDATION.md` and
`docs/SEASON_SIMULATION_16W.md`. Then inspect the code you will touch before editing.

## Your area

`src/domain/**`, `src/game-engine/**`, `src/repositories/**`, `src/app/game/**`, `src/app/cloud/**`,
`supabase/**`, `src/server/**`, `scripts/**`, `.github/**`. Ownership details are in `CONTRACTS.md`.

## Principles you must keep

- Deterministic core rules, testable without the interface. Values live in the owner's tables or in
  central configuration, never in a screen.
- Server authority stays: the client never decides progression, economy or race results.
- Saves from older versions must keep loading; a schema change comes with its migration path and tests.
- Never edit a migration that is already in `main`. Never hand-edit the generated bundles in
  `supabase/functions/*/index.js`; CI rebuilds them.
- **Do not change a balance value without the owner's approval.** Propose with numbers; the owner decides.

## Current assignment

1. **B-1** (P0): re-run the season simulation against the current values and report whether the M4
   balance finding is closed. Report only; change no values.
2. Then wait for the PM: B-2 and B-3 depend on owner decisions (D4, D5).

Work on **one topic at a time** and do not start the next item, even if it is in the backlog, until
the PM assigns it. The order is in `docs/pm/QUEUE.md`.

## How to work

- Branch `stream-b/<topic>`, one topic per PR, rebased on `main` before the PR.
- `npm run check` must pass, and `npm run db:test` when you touch `supabase/`. Say so in the PR.
- Log in `docs/pm/log/B.md` (newest entry first): what you did, files changed, checks run, manual test
  steps, questions for the owner or for stream A.
- If a change needs a screen, write the request for stream A in your log. Do not edit `src/features/**`.
