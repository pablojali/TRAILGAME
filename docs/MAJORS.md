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

## Next

- Phase 3: the orchestrator (start, segments, aid-station windows, automatic decisions, recovery).
- Phase 4: the live race screens.
- Phase 5: results, rewards, ranking (×1.5) and history.
- Phase 6: the pilot.
