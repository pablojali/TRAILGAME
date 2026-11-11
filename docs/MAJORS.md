# Sunday Majors (owner specification, 10 November 2026)

The weekly multiplayer competition. Design and decisions: `docs/MAJOR_PHASE0_AUDIT.md`. This page
says what is built, phase by phase.

## Phase 1: event manager (merged)

- Tables `major_config`, `major_events`, `major_categories`, `major_admins`, `major_log`, plus the
  Storage bucket `major-media`.
- Event states (forward only, enforced by the database):
  `DRAFT → SCHEDULED → REGISTRATION_OPEN → LOCKED → STARTING → RUNNING → FINISHED`. `CANCELLED`
  is possible from any state before `FINISHED`.
- Administration lives in Trail Studio → Majors (see `docs/STUDIO.md`) and goes through the Edge
  Function `major-ops`, which checks the admin rights.

## Phase 2: registration, plan, READY, grid

- **Clock:** `major_advance(now)` opens registration at `registration_open_at` and locks the grids
  at the start. It is idempotent. pg_cron runs it every 15 seconds, and `major-ops` runs it on
  every player request.
- **Registration** (`major_register`):
  - only while `REGISTRATION_OPEN` and before READY opens;
  - one per player;
  - the level is frozen at registration (from the server's career) and sets the category;
  - places on the main list up to `participant_limit`, then a waiting list;
  - withdrawing promotes the first of the waiting list; registering again queues at the back.
- **Plan** (`major_save_plan`):
  - a style, the gel and bar to take, and per segment an intensity and the stop after it;
  - validated by `validatePlan` against the course's segments;
  - it applies where the runner does not decide in time (phase 3).
- **READY** (`major_set_ready`):
  - between `ready_open_at` and the start;
  - stores the runner as the server has them then: level, attributes, Fitness, Fatigue,
    equipment, and the gel and bar actually in stock.
- **Grid** (`major_lock`, at the start):
  - READY players of the main list by registration order, then READY players of the waiting list,
    up to the limit;
  - every other registration becomes `ABSENT`: no race, no reward;
  - NPCs from the ranking's NPC runners fill the rest, drawn deterministically from the event and
    category, with levels spread over the band;
  - every category ends with exactly `participant_limit` runners.
- **Game:**
  - Races shows the next Major above the race list;
  - the Major screen (`/majors/:id`) has two tabs: Event (start in local time, course, categories
    and entrants, the player's state) and Plan;
  - its buttons are Register, Withdraw, I'm READY and Update READY.
  - Majors are online only: without Supabase they do not appear.
- **Access:**
  - players read their own registrations and the grid's public columns (name, country, level,
    NPC or player), never the snapshots or plans;
  - every write goes through the functions, as the service role.

## Phase 3: the orchestrator

- **Engine** (`src/game-engine/majorRace.ts`):
  - the solo races' own `runSegment` and `makeStop`, run for every runner of a category;
  - positions are the runners' own order by arrival (ties by grid slot), with gaps to the leader;
  - players race with their READY snapshot and plan; NPCs are the typical runner of their level
    (that level's gear, gel and bar) with a Balanced plan and Normal stops;
  - each runner's day form is drawn from the event and their slot;
  - a player who follows their plan gets exactly the solo engine's result (tested).
- **Phases per category** (`major_categories.phase`, `segment`, `phase_ends_at`, `version`):
  1. `RUNNING` (segment k) lasts the event's running phase (`running_s`);
  2. when it ends, segment k is simulated for all 50;
  3. then `PA` (the aid station after k) stays open for the decision window (`decision_window_s`);
  4. when it closes, each runner's decision applies: their own if sent, else their plan's, and
     the plan for NPCs. Then `RUNNING` (k + 1);
  5. after the last segment, `FINISHED`; when every category has finished, the event is
     `FINISHED`.
  - Each phase starts when the last one ended (the official schedule), so a late tick catches up.
- **Single, atomic steps:**
  - `major_commit_step` commits a step only from the version it was computed on;
  - an aid-station step is refused if a player's decision arrived after the decisions were read;
  - a refused step is read again.
  - Two calls never apply a step twice, and a call that dies changes nothing.
- **Decisions** (`major_decide`): the runner's own, only while their category's window for that
  aid station is open, by the database's clock. They can be changed until it closes.
- **Who runs it:**
  - `major-ops` action `tick`, called every 10 seconds by pg_cron through pg_net (phase 4 below);
  - every player request to `majors`, `race-state` or `decide` also runs what is due;
  - no browser decides when the race moves on.
- **Player actions:**
  - `race-state`: the category's phase and window end, the 50 runners' standings with gaps
    (players and NPCs marked), and the player's own runner (energy, fatigue, next intensity,
    splits);
  - `decide`: the aid-station decision.
- **Length:** with `running_s` 150 and windows of 90 s, a 4-segment race lasts about 14.5 min and
  an 8-segment one about 30 min. Change `running_s` in the Studio's configuration to tune it.
- **Not yet:** the gel and bar are not yet deducted from the career, and no rewards or ranking
  points are given (phase 5).

## Phase 4: the live race

- **Screen** (`src/features/majors/LiveRace.tsx`): a runner on the grid (registration `RACING`)
  sees the live race instead of the event and plan tabs.
  - Phase card:
    - the category's phase (segment running, aid-station decision, finish);
    - the server's countdown, corrected for the device clock's offset, with a progress bar;
    - position, time and energy.
  - **Race** tab:
    - the segment's clip while it runs (the event's own clip, else the course's);
    - the gaps to the runners just ahead and behind;
    - at an aid station, the decision: stop and next segment's pace, confirmed with one button
      and changeable until the window closes. Until then, the screen says what the plan will do.
    - At the finish, the place and time.
  - **Standings** tab: the 50 in order, NPCs marked, `auto` on players whose last aid station was
    decided by their plan, the player's row highlighted.
  - The screen asks for `race-state` every 4 seconds; a lost connection only means catching up.
- **`race-state` additions:** the decision source of each runner's last aid station, the player's
  plan (to show what applies without a decision), and the phase lengths.
- **The tick** (migration `20261114090000_major_tick.sql`):
  - a random secret generated inside Vault (`major_tick_secret`); nobody types or sees it;
  - pg_cron job `major-tick`, every 10 seconds, posts `{"action":"tick"}` to `major-ops` with the
    secret in the `x-major-tick` header;
  - `major-ops` checks it through `major_tick_check` (service role only);
  - `major-ops` is deployed with `verify_jwt = false`: it checks the player's or admin's session
    itself, and the tick carries no session.
  - The `major-advance` job (every 15 s) keeps starting LOCKED events and filling grids.

## Next

- Phase 5: results, rewards, ranking (×1.5) and history.
- Phase 6: the pilot.
