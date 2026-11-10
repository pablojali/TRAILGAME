# Sunday Major — Phase 0 technical audit (10 November 2026)

Owner specification: "Trail Manager — Sunday Major Multiplayer". This report covers Phase 0 only:
what exists, what can be reused, what must change, the proposed data model, risks, the plan and the
decisions the Product Owner must take. **Nothing is implemented yet.**

---

## 1. Current race architecture

| Piece | Where | What it does |
|---|---|---|
| Course | `generateCourse(race)` in `src/game-engine/raceSimulation.ts` | Turns a catalog race (distance, D+, technicality) into blocks (runnable / climb / descent). |
| Segments | `getRaceSegments(race)` in `raceEngine.ts` | Cuts the course into 2–8 segments of about 6 km each (`RACE_STRATEGY.kmPerSegment`). Aid stations sit between them. |
| Field | `getRaceField(race)` / `getEditionField(race, seed)` | Builds the **29 rivals as finishing times**, not as simulated runners. They come from the typical runner of the race's level, anchored to the owner's pace table. Per-segment arrival times are interpolated, and each edition gets ±3% rival form. |
| One segment | `runSegment(ctx, progress, intensity)` | Runs one segment for **one runner**: pace from attributes, Fitness, Fatigue, gear, day form, nutrition and the distance band, plus in-race fatigue. Position = rank of the arrival time among the field's precomputed rival times. |
| One stop | `makeStop(ctx, progress, stop)` | Aid station: duration and fatigue recovered. |
| Strategy | `racePlan.ts` (`planRest`, styles) and `RACE_STRATEGY.distanceBands` | Automatic plan per style; three distance engines. |

**Key finding:** `runSegment` and `makeStop` are pure functions of `(context, progress, decision)`.
They do not depend on an authenticated player, on React or on storage. They can run 50 runners
server-side unchanged. The only player-specific part is the **position**: it compares against the
field's precomputed rival times. In a Major the rivals are the other 49 simulated participants, so
the position is computed afterwards, among the participants. This is a minimal adaptation; see §8.

## 2. `race-start` and `race-step`

- Both are actions of the Edge Function **`career-ops`** (`src/server/careerOps.ts`, bundled into
  `supabase/functions/career-ops/index.js`).
- Flow:
  1. The client sends `{ action, operationId (UUID), ... }` with the player's JWT.
  2. The server loads the player's career, runs `startRace` / `stepRace` (`src/game-engine/races.ts`)
     on it, and commits with `commit_career`. The commit is version-checked, idempotent by
     operationId and atomic.
- `startRace` checks:
  - the **game day** (`checkDay`);
  - **Sunday of the career's game week** (`RACE_DAY_INDEX`);
  - the scheduled entry, the level, the nutrition stock.
- It snapshots the runner into `activeRace` and runs segment 1.
- `stepRace` applies one stop and the next intensity. On the last segment, `finishRace` applies:
  - prizes (`getRaceRewards`), XP and Fatigue = the in-race fatigue at the finish;
  - injury above 95;
  - ranking fields (`rankingSeason`, `rankingPoints`, `rankingAt`);
  - and it completes the game day.

## 3. `activeRace` and its persistence

- `activeRace` (`src/game-engine/gameState.ts`) lives **inside the career JSON**
  (`careers.game_state`).
- It holds:
  - the snapshot (attributes, Fitness, Fatigue, equipment, day form, nutrition);
  - the running state (elapsed time, in-race fatigue, splits).
- It is written only by `career-ops` through `commit_career`. Clients cannot write careers since
  migration `20261031090100_revoke_client_writes`.
- **One active race per career.** A Major running at the same time as a solo race needs its own
  state outside `activeRace`.

## 4. Supabase architecture

- **Tables:**
  - `profiles` (only the id: runner name and country are inside `game_state`);
  - `careers` (one per user: `game_state` jsonb, `version`);
  - `race_entries`, `owned_equipment`, `coin_transactions` (mirrors of the snapshot);
  - `career_operations` (idempotency log);
  - `ranking_results`, `ranking_npcs`, `ranking_race_points`, `ranking_position_percent`.
- **RLS** on every table. Players only read their own rows. All writes go through
  `security definer` functions or the service role inside the Edge Function.
- **Auth:** anonymous sign-in first, then account linking (email, Google). Users are `auth.users`.
- **Edge Functions:**
  - only `career-ops`, a stateless request/response function with `verify_jwt = true`;
  - CI builds it and deploys it on every push to main.
- **Extensions available:** `pg_cron` 1.6.4 (supports schedules in seconds) and `pg_net`, both
  not installed yet; `supabase_vault`, installed.
- **Not used yet:** Supabase Realtime, and scheduled jobs.

## 5. Ranking and rewards today

- **Points** = difficulty base × position % × competition %, rounded.
  - `rankingPoints(raceId, position, competition)` in `src/domain/ranking/ranking.ts`.
  - The values are in `src/data/ranking_points.csv`, which **already has
    `competition,major,150`**: the +50% exists.
- **Where points go:** the trigger `careers_record_ranking_results` copies every finished
  `raceEntries[].result` that has ranking fields into `ranking_results`. That table is
  append-only and keyed by user, time and entry.
  - `get_ranking` builds the Season and Annual rankings from `ranking_results` plus NPC rows
    (`ranking_npcs`).
- **Rewards:**
  - coins and XP come from `getRaceRewards(race, position, levelAtStart)`;
  - prize bands by position;
  - an anti-farming multiplier when the runner's level is above the race's recommended level;
  - a minimum of 18 XP.
- Field size is 30 today; a Major has 50.

## 6. Users and runners

- One career per user. The runner's attributes, level (from XP), Fitness, Fatigue, gear and
  consumables are in `careers.game_state`.
- Ranking NPCs (`ranking_npcs`) already have names, countries, sexes and fixed points. Race NPCs
  are only times.

## 7. Existing administration

- **Trail Studio** (`trailgame-studio.pages.dev`, `src/studio`) is the existing admin panel.
- It edits the game's **CSV tables** and texts, and **publishes them as GitHub pull requests**
  with the owner's GitHub token, kept in the browser.
- It has **no Supabase login and no server-side admin role**.
- So it cannot meet the spec's "schedule without publishing code" and "admin authorized
  server-side" for Majors as it is. Section 9 proposes how to fill that gap without a second panel.

## 8. Conflicts with the current game (Product Owner decisions needed)

1. **Real time vs game time.**
   - The career runs on **game days**: a player can be on game Wednesday on a real Sunday. Solo
     races happen on the game Sunday and complete that game day.
   - A Major happens on a **real Sunday at a UTC hour**.
   - Decision: does the Major touch the career's calendar (fatigue added, injury, a game day used),
     or is it **outside the calendar**, giving XP, coins and ranking only?
   - Recommendation: outside the calendar for XP and coins. It still uses the player's **current**
     Fatigue as the starting state. The Fatigue at the finish is applied to the career, and an
     injury too, without using a game day. Otherwise players could race Majors for free.
2. **Rewards.** The current anti-farming multiplier would cut the rewards of a level-25 player who
   runs a Major course recommended for level 6.
   - Decision: rewards by **category** (bands) with their own table, or the course's normal table
     with no multiplier?
   - Recommendation: the course's prize table, **no level multiplier** (as the spec says for
     points), 50-runner prize bands.
3. **Category determined at registration or at close?** The spec says both "only the category of
   the level" and "determined at close".
   - Recommendation: the level is frozen **at registration**, which shows the category, and a
     player cannot change category afterwards.
4. **Waiting list vs NPCs.** If 50 registered players and 5 are absent, are the waiting list's
   READY players promoted before NPCs fill the places?
   - Recommendation: yes. The waiting list can mark READY too, and at the lock the 50 places are
     filled first with READY players by registration order, then with NPCs.
5. **Course.** The spec has the admin set distance, D+, profile and aid stations freely.
   - Recommendation for v1: the admin **picks a catalog race**, which has a calibrated field,
     difficulty, art, clips and a ranking difficulty. A custom course is phase 2.
   - The number of aid stations follows the course (2–8 segments). It is not free.
6. **Duration 15–30 min.** With 2–8 segments and 90 s windows, the decisions alone take 1.5–10.5
   minutes. To reach 15–30 minutes, each segment needs a **"running" phase** of fixed real
   duration (for example 2–3 min, configurable, with the segment's clip and a live gap ticker).
   The engine formulas do not change.
   - Decision: running phase per segment, or accept shorter events?
7. **Nutrition stock.** The gel and bar taken are deducted from the career at the lock, like a solo
   race start. Confirm.
8. **NPCs "follow the same simulation rules".** The NPCs become **simulated runners** (typical
   runner of a level in the band, with that level's gear and a plan), unlike the time-based rivals
   of solo races. This is a real behaviour change for that mode: the field's spread will differ
   from solo races.
9. **Major during an active solo race.** A player in the middle of a solo race can still be READY
   for a Major, because the Major state is separate. Confirm that both may coexist.

## 9. Proposed solution

### 9.1 Engine (minimal adaptation, no second engine)
- New pure module `src/game-engine/majorRace.ts`:
  - `majorRunner(snapshot)`, which builds a `StepContext` per participant;
  - `stepAll(participants, decisions)`, which runs `makeStop` and `runSegment` for each
    participant;
  - `rankParticipants`, which computes positions and gaps among the participants.
- `runSegment`'s own position is ignored there. The ctx field is an edition field, used only for
  segments, time scale, stops and weights.
- NPC generator: deterministic from `(event id, category, slot)` with a seeded RNG (the same
  `mulberry32`/`fnv1a` as editions). Each NPC gets a level spread across the band, the typical
  runner of that level, the gear of that level, a style plan and a name from `ranking_npcs`.
- Solo races, `activeRace`, `career-ops` and the training engine **stay unchanged**.

### 9.2 Server
- **New Edge Function `major-ops`** (player and admin requests):
  - player: list, register, unregister, save the PA plan, READY, submit a decision, state;
  - admin: create, edit DRAFT, publish, cancel, view participants and segments.
  - Admin rights are checked server-side against a `major_admins` table (user ids), inserted by
    SQL, never in the browser.
- **New Edge Function `major-tick`** (orchestrator):
  - called every **10 s** by `pg_cron` + `pg_net` with a secret kept in Vault;
  - stateless: each call advances whatever is due and returns;
  - it never runs for the whole race.
- **Concurrency:** every step is a compare-and-swap in a SQL function, which claims
  `(event, category, segment, phase)` with `update ... where phase = expected returning`. Two ticks
  can never run the same segment; a crash leaves the claim to be retried, and segment results are
  written in one transaction.
- **Lazy advance:** `major-ops state` may also advance a due event, which makes the system faster
  and robust if cron is late.
- **Realtime:** clients subscribe to a public `major_live` row per category (phase, segment, window
  end, standings version) through Supabase Realtime. On any notice or reconnect, they re-read the
  full state from `major-ops`. The server clock alone closes windows.

### 9.3 Results, rewards, ranking
- `major_results` is the immutable source of truth.
- **Ranking:**
  - one row per real player goes into `ranking_results`, with a new `competition` column
    (default `standard`) and points computed with `rankingPoints(raceId, position, 'major')`;
  - the primary key prevents duplicates.
- **Career rewards (XP, coins, Fatigue, injury):**
  - The orchestrator never writes careers, which would conflict with the player's own operations
    on the career version.
  - Instead, a `major_rewards` row waits per player. `career-ops` applies it **once**, by its id,
    at the player's next operation (a "pending rewards" step before any action), inside the same
    `commit_career`.
  - Idempotent: the row is marked claimed in the same transaction.

### 9.4 Admin panel
- Trail Studio gets a **"Majors" tab** that signs in with the game's Supabase auth (the owner's
  linked account) and calls `major-ops`.
- Majors live in the database, not in CSV files: no pull request, no code publish.
- Category bands are a global config row; each event stores a copy when it is published.

### 9.5 Player UI
- In Races:
  - a "Next Major" card;
  - event detail and registration;
  - preparation (the existing screen, adding a **per-PA plan: stop + pacing** to the Course tab);
  - READY / waiting room (countdown to the UTC start, shown in local time);
  - the live race: the aid-station screen reused, plus a window countdown and NPC/real/auto
    markers;
  - provisional standings (50 rows per category);
  - result and history.

## 10. Proposed data model (all with RLS; writes only through functions)

| Table | Key columns | Notes |
|---|---|---|
| `major_config` | singleton: default start time (UTC), window seconds, running seconds, bands jsonb | Validated bands: contiguous, no overlap, min ≥ 1, last open-ended. |
| `major_events` | id, name, description, race_id, scheduled_start_at timestamptz, registration_open_at, registration_close_at, ready_open_at, window_s, running_s, participant_limit (50), status, bands_snapshot jsonb, config_snapshot jsonb, cancel_reason, created/updated_at | `status` check: DRAFT → SCHEDULED → REGISTRATION_OPEN → LOCKED → RUNNING → FINISHED, CANCELLED from any state before FINISHED. Transitions enforced by a SQL function. |
| `major_categories` | id, event_id, index, name, min_level, max_level, phase, segment_index, phase_ends_at, claim_token, version | Live state per category (the orchestrator's unit). Phases: WAITING, RUNNING_SEGMENT, PA_DECISION, FINISHED. |
| `major_registrations` | id, event_id, user_id, category_id, level_frozen, status (REGISTERED / WAITLIST / READY / ABSENT / WITHDRAWN), registered_at, ready_at, plan jsonb (per-PA stop + pacing, first pacing, nutrition), runner_snapshot jsonb (at READY) | unique (event_id, user_id); the 50-place limit is checked inside the function. |
| `major_participants` | id, category_id, slot 1–50, kind (PLAYER / NPC), user_id null for NPC, npc_seed, display_name, country, level, runner_snapshot, plan, state jsonb (elapsed, in-race fatigue, splits), last_seen_at | Created at the lock; exactly 50 per category (unique (category_id, slot), check slot 1–50). |
| `major_decisions` | participant_id, segment_index, stop, pacing, source (PLAYER / AUTO), submitted_at, locked | unique (participant_id, segment_index); rejected after `phase_ends_at`, measured on the server clock. |
| `major_results` | participant_id, category_id, position, time_s, ranking_points, rewards jsonb, published_at | Insert-only; unique (participant_id). |
| `major_rewards` | id, user_id, result_id, payload, claimed_at | Applied once by `career-ops`. |
| `major_admins` | user_id | Admin rights; inserted with SQL by the owner. |
| `major_log` | event/category, at, kind, detail | Audit of transitions, ticks and errors. |

Indexes:
- events by `(status, scheduled_start_at)`;
- categories by `(phase, phase_ends_at)` for the tick;
- registrations by `(event_id, category_id, status)`.

Changes to existing objects:
- `ranking_results` gets `competition text not null default 'standard'`;
- `get_ranking` stays as it is (it sums points).

## 11. Risks

| Risk | Mitigation |
|---|---|
| Edge Functions cannot stay alive for a whole race | Stateless 10 s ticks with pg_cron, plus a lazy advance on reads. |
| pg_cron/pg_net late or down | Lazy advance on any player request; recovery is idempotent; the admin view shows the last tick. |
| Two ticks simulate the same segment | Compare-and-swap claim per category and phase; one transaction per segment commit. |
| Duplicate rewards | Unique result per participant; `ranking_results` primary key; `major_rewards.claimed_at` set in `commit_career`'s transaction. |
| Writing careers from the orchestrator conflicts with player operations | Deferred rewards claimed by `career-ops`. |
| Client clock | Every window end is a server timestamp; requests after it are rejected by the database. |
| NPC simulation changes how the field looks compared with solo races | The NPC generator is calibrated on the field's anchors (2 levels above: 2nd; band level: middle; …). Simulation report before launch. |
| Engine changes later alter Majors in progress | The event stores `config_snapshot` (the strategy version); runs started finish with the stored values. |
| Realtime limits (connections) | One row per category; payloads small; polling fallback every 10 s. |
| Studio has no server auth today | A new Supabase login in Studio, admin checked in `major-ops`; the GitHub token is never sent to Supabase and vice versa. |
| The admin secret for the cron call | Kept in Vault and as an Edge secret; never in the repository or the bundle. |

## 12. Plan by phases (each a PR, each with tests and owner approval)

| Phase | Content | Complexity |
|---|---|---|
| 1 Event manager | Migrations (config, events, categories, admins, log), state machine in SQL, `major-ops` admin actions, Studio "Majors" tab with Supabase login, band validation, UTC/local time display. | Medium-high (3–4 PRs) |
| 2 Registration | Register / waitlist / withdraw, level frozen, the PA plan in preparation, READY window, lock with grid of 50 and deterministic NPC generator. | Medium-high |
| 3 Orchestrator | `majorRace.ts` (engine on N runners), `major-tick`, pg_cron/pg_net + Vault secret, claims, running phases and PA windows, auto decisions, recovery. | High |
| 4 Live experience | Realtime + polling, live race screen, decisions, reconnection, provisional standings, NPC/auto/offline markers. | High |
| 5 Results | Final standings, `major_results`, ranking rows with `competition = major`, deferred rewards in `career-ops`, history. | Medium |
| 6 Pilot | A staged Major with test accounts and simulated disconnections, a tick stopped during a PA, and restarts. | Medium |

## 13. Tests

- **Unit (Vitest):**
  - band validation, state transitions;
  - NPC generator determinism and grid of exactly 50 (50/1/17/0 real players);
  - `stepAll` against solo `runSegment` (same runner, same decisions, same time);
  - auto decisions, ranking with ×1.5 and no level or gear factor;
  - reward idempotency.
- **Database (`supabase/tests`, pgTAP style like the existing ones):**
  - RLS (a player cannot read others' plans or write anything);
  - compare-and-swap claims under two concurrent ticks;
  - late decisions rejected, duplicate registration, limit and waitlist, results immutable.
- **Integration:** `major-tick` replayed from every phase after a simulated crash (no repeated
  segment, no double reward).
- **Regression:** the existing suite (solo races, training, progression, equipment, ranking), which
  runs unchanged on every PR.

## 14. Decisions (all approved by the Product Owner, 10 November 2026, as recommended)

1. Major and the career calendar (§8.1).
2. Rewards table and level multiplier (§8.2).
3. Category frozen at registration (§8.3).
4. Waiting list before NPCs (§8.4).
5. A catalog race as the course for v1 (§8.5).
6. Running phase per segment to reach 15–30 min, and its length (§8.6).
7. Nutrition deducted at the lock (§8.7).
8. Simulated NPCs (§8.8).
9. Major and a solo race at the same time (§8.9).
10. READY window: how long before the start does it open (proposal: 30 min), and the registration
    close (proposal: at the start of the READY window)?
