# Trail Manager — Development Specification

**Document:** `DEVELOPMENT.md`  
**Version:** 0.3.0  
**Status:** Active — M0, M1 and M2 (Athlete Progression) accepted and merged into `main`; next milestone pending PM definition  
**Game design reference:** [`docs/GAME_DESIGN_BIBLE.md`](./docs/GAME_DESIGN_BIBLE.md)  
**Product type:** Cross-platform trail-running career management game  
**Working name:** Trail Manager  
**Product owner / PM:** ChatGPT  
**Developer / coder:** Claude Code  
**Tester and final feedback:** User

---

## 1. Product vision

Build a trail-running management game in which the player develops an athlete's career by planning training, managing fatigue, buying equipment, entering races, earning rewards and progressing through rankings.

The product should feel like a sports management game, not a spreadsheet or a fitness tracker.

### Core gameplay loop

1. Plan the athlete's training week.
2. Balance fitness gains against fatigue and recovery.
3. Unlock and purchase equipment.
4. Enter races appropriate to the athlete's current level.
5. Simulate the race and review the result.
6. Earn experience and currency, improve the athlete and progress to harder events.

### Product principles

- **Mobile-first:** design for touch and small screens first.
- **One product, shared codebase:** web, Android and iOS should share the same interface and game logic wherever practical.
- **Offline-tolerant:** the game should not lose a session because of a temporary connection issue. Full offline gameplay and conflict resolution are later milestones.
- **Deterministic core rules:** game calculations should be testable independently of the interface.
- **No pay-to-win assumptions:** monetization is not part of the MVP.
- **Real-world integrations later:** plan extension points for Strava and Vertical Trail Labs (VTL), but do not make the MVP depend on either.
- **Privacy by default:** import only data needed for a clearly explained feature; request permissions only when the integration is implemented.

---

## 2. Roles and workflow

### Responsibilities

| Role | Responsibility |
|---|---|
| ChatGPT — PM | Product requirements, scope, architecture decisions, task briefs, acceptance criteria, review of implementation and prioritization of feedback |
| Claude Code — Developer | Implement approved tasks, run checks, update documentation and report files changed, commands run, results and known issues |
| User — Tester / product owner | Test the running build, provide screenshots and reproducible feedback, decide product direction and approve major changes |

### Development cycle

1. PM defines one milestone and its acceptance criteria.
2. Claude Code inspects the repository before editing.
3. Claude Code implements only the agreed scope.
4. Claude Code runs lint, type-check, tests and production build as available.
5. Claude Code reports: summary, files changed, checks run, failures, manual test steps and next blockers.
6. User tests the deployed build and reports observations to the PM.
7. PM triages feedback into bug, usability issue, balancing issue or new feature.
8. Only then is the next task approved.

### Rules for Claude Code

- Read this file and `docs/GAME_DESIGN_BIBLE.md` before starting work.
- Do not silently change the stack, architecture, dependencies or product rules.
- Do not implement future integrations before their milestone.
- Avoid large rewrites; make small, reviewable changes.
- Do not commit secrets, tokens, service keys or `.env` files.
- Never expose Supabase service-role credentials in frontend code.
- Do not claim a feature works unless it has been tested or clearly label it unverified.
- Update this document when an approved technical decision changes.
- Ask the PM when a requirement is ambiguous or conflicts with this specification.

---

## 3. Technical baseline

Versions below are the intended starting baseline, not a reason to force an incompatible package. At project initialization, use stable releases compatible with one another, pin exact dependency versions in the lockfile and record any justified deviation here.

| Layer | Choice | Baseline / policy |
|---|---|---|
| Language | TypeScript | Strict mode enabled |
| UI | React | 19.x |
| Build tooling | Vite | 7.x, or compatible stable release if the current ecosystem requires it |
| Runtime | Node.js | 24 LTS; use the same major version locally and in CI |
| Package manager | npm | Commit `package-lock.json`; use `npm ci` in CI |
| Styling | CSS Modules or organized plain CSS + CSS variables | Avoid adding a large UI framework before there is a demonstrated need |
| Routing | React Router | Stable compatible release; use route-level screens |
| Backend | Supabase | Hosted PostgreSQL, Auth and later Edge Functions |
| Database | PostgreSQL via Supabase | Schema migrations committed to the repository |
| Hosting | Cloudflare Pages | Deploy web/PWA from GitHub |
| Repository | GitHub | Main branch protected where practical; feature branches for tasks |
| Mobile packaging | Capacitor | Later milestone; reuse the web app |
| Testing | Vitest + React Testing Library | Unit tests for game rules; component tests for critical flows |
| E2E testing | Playwright | Introduce once core flows exist |
| CI | GitHub Actions | Install, lint, type-check, test and build on pull requests/pushes |
| Integrations | Strava API / VTL data interface | Future milestones; no dependency in MVP |

### Resolved versions (M0)

Exact versions pinned in `package.json` / `package-lock.json` at project initialization:

| Package | Version | Note |
|---|---|---|
| react / react-dom | 19.3.1 | |
| react-router | 7.18.4 | v8 exists; 7.x kept as the established stable line with React 19 |
| vite / @vitejs/plugin-react | 7.3.7 / 5.2.0 | Per baseline (Vite 8 exists, not adopted) |
| typescript | 5.9.3 | TypeScript 7 exists but typescript-eslint supports `<6.1` |
| vitest | 4.1.12 | 3.x has open security advisories (tinypool, @vitest/mocker) |
| eslint / typescript-eslint | 9.39.5 / 8.72.0 | Flat config |
| @testing-library/react / jsdom | 16.3.3 / 26.1.0 | |

Deviations / notes:
- CI and `.nvmrc` use Node 24. `package.json` `engines` allows Node ≥ 22.12 (Vite 7 minimum); the M0 checks were run locally on Node 22.22.0.
- npm 10.9 fails to resolve Vitest 4's optional peer dependencies (`Cannot read properties of null (reading 'edgesOut')`) when *adding* packages. The lockfile was generated with npm 11 (bundled with Node 24). `npm ci` works with both npm 10 and 11.

### Dependency policy

- Do not use floating or wildcard dependency versions.
- Commit the lockfile.
- Keep dependencies minimal.
- Before installing or upgrading a major dependency, explain why and verify compatibility.
- Do not add analytics, advertising SDKs or crash-reporting services in the MVP without approval.

### Environment variables

Use `.env.local` for local development and Cloudflare/Supabase secret settings for deployment. Commit only `.env.example` with placeholder names.

Expected public frontend variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The Supabase anon/publishable key may be used in the client only with appropriate Row Level Security policies. Any service-role key or third-party secret must remain server-side.

---

## 4. Architecture

### High-level structure

```text
React UI (web / PWA / later Capacitor)
        |
        v
Application services and typed domain models
        |
        +--> Game engine (pure TypeScript, independently testable)
        |
        v
Repository / data-access layer
        |
        v
Supabase Auth + PostgreSQL
        |
        +--> Future server-side validation / Edge Functions
        +--> Future Strava integration
        +--> Future VTL data adapter
```

### Architecture rules

1. Game calculations must not live inside React components.
2. UI components must not issue ad-hoc SQL or contain game-balance formulas.
3. Access data through a repository/service layer so storage can evolve.
4. Keep static game definitions separate from player-owned state.
5. Validate important game actions on the server before introducing competitive or shared rankings.
6. Use database migrations; do not rely on manual-only schema changes.
7. Use Row Level Security (RLS) on all player-specific tables.
8. Store times in UTC where applicable and render local time in the interface.
9. Store units explicitly: distance in metres or kilometres consistently; elevation in metres; money as integer minor units or integer game currency; never use floating-point for currency.
10. Use stable IDs for game entities; do not depend on display names as identifiers.

### Suggested repository structure

```text
/
├── DEVELOPMENT.md
├── README.md
├── package.json
├── package-lock.json
├── .env.example
├── public/
├── src/
│   ├── app/                 # app shell, routes, providers
│   ├── components/          # reusable UI components
│   ├── features/
│   │   ├── dashboard/
│   │   ├── training/
│   │   ├── equipment/
│   │   ├── races/
│   │   ├── results/
│   │   └── rankings/
│   ├── domain/
│   │   ├── athlete/
│   │   ├── training/
│   │   ├── equipment/
│   │   ├── race/
│   │   └── economy/
│   ├── game-engine/         # pure rules and race simulation
│   ├── services/            # application-level operations
│   ├── repositories/        # persistence adapters
│   ├── integrations/        # future Strava and VTL adapters
│   ├── styles/
│   └── test/
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── e2e/                     # Playwright tests, when introduced
```

Claude Code may adjust the structure slightly if there is a clear technical reason, but must explain the change before a significant restructuring.

---

## 5. Interface and UX

### Design direction

- Dark-first interface.
- Palette: forest green, charcoal, off-white, orange and ochre accents.
- Sports-management aesthetic with strong terrain and race imagery.
- Cards for summaries and equipment; dedicated screens for training planning and race results.
- Clear status indicators for fitness, fatigue, money, XP and upcoming races.
- Touch-friendly controls; no essential action should require hover.
- Avoid spreadsheet-like layouts on mobile.

### Main navigation

1. **Dashboard** — athlete overview, weekly status, next race and key action.
2. **Training** — seven-day calendar, session selection and training feedback.
3. **Equipment** — owned gear, shop, stats and terrain-specific bonuses.
4. **Races** — event calendar, eligibility, course profile and race entry.
5. **Career** — results, ranking, season progression and achievements.

On mobile, use a persistent bottom navigation bar. On larger screens, adapt to a sidebar or wider layout while retaining the same information architecture and visual identity.

### Cross-platform requirements

- Start with a mobile viewport, then verify tablet and desktop.
- Use responsive layouts, not separate web and mobile implementations.
- PWA installation is a target for the web MVP.
- Capacitor packaging is a later target, not an MVP blocker.
- Do not assume that browser features, native integrations or app-store behavior are identical; verify them when packaging begins.
- Use accessible contrast, keyboard support on web and visible focus states.

---

## 6. MVP scope

> **Note:** §6–§8 are the original technical baseline. Game rules (profiles, attributes, starting
> values, training rewards, progression) are defined in `docs/GAME_DESIGN_BIBLE.md`; the profile and
> attribute lists below were updated to the M2 implementation. Where other parts differ, the Bible is
> the intended design and the code is the delivered state; see §15. Changes are implemented only
> through a milestone approved by the PM.

### Included in MVP

- Local development and deployable responsive web app.
- Dashboard for one player-controlled athlete.
- Four starting profiles (implemented in M2):
  - Climber
  - Sprinter
  - All-rounder
  - Endurance
- Six core attributes (implemented in M2):
  - Endurance
  - Climbing
  - Speed
  - Technical
  - Recovery
  - Consistency
- Weekly training planner.
- Session types: easy run, intervals, hill training, long run, strength, technical practice and rest.
- Separate fitness and fatigue values.
- Experience points and athlete progression.
- Equipment categories: shoes, hydration vest and poles.
- Equipment inventory and in-game shop.
- Twelve initial fictional races, from approximately 8 km / 250 m D+ to 100 km / 5,500 m D+.
- Race simulation using athlete attributes, fatigue, equipment, terrain and race strategy.
- Race results, rewards and basic season ranking against simulated rivals.
- Persistent player progress using Supabase.
- Seed/demo data so the app can be tested without waiting for a long career.
- Automated tests for critical game calculations.

### Explicitly out of MVP

- Strava connection.
- VTL live/API connection.
- Real athlete personal data.
- Multiplayer or live races.
- Payments, subscriptions, ads or premium currency.
- Native-only features.
- Fully playable offline mode with robust synchronization.
- Real-world official race names/logos unless licensing and data rights are confirmed.
- Medical advice or real training prescriptions.

---

## 7. Initial game rules — design baseline

These values are starting assumptions for a playable prototype and must be tuned through testing. Keep them in configuration/data, not hardcoded across UI components.

### Athlete attributes

Each attribute is an integer on a 1–100 scale. Starting values per profile live in
`src/domain/athlete/profiles.ts` (Bible §2.3); every profile totals 96 points.

| Attribute | Main influence (Bible §2.3) |
|---|---|
| Endurance | Capacity to maintain performance over long distances |
| Climbing | Performance on uphill terrain |
| Speed | Performance on fast and runnable terrain |
| Technical | Ability to handle technical trails and difficult descents |
| Recovery | Ability to recover from training and fatigue |
| Consistency | Ability to sustain training and perform reliably over time |

Profiles provide a starting distribution with strengths and weaknesses; they must not permanently block a play style.

### Training

Each session has:
- Type
- Duration or workload
- Attribute emphasis
- Fitness stimulus
- Fatigue cost
- Risk/penalty if overused, if implemented
- XP reward

Fitness and fatigue are separate values. A hard session may increase fatigue immediately while its fitness benefit accumulates through recovery. Rest must have a meaningful role.

### Race simulation

A race is represented as ordered segments. Each segment includes:
- Distance
- Elevation gain/loss
- Terrain type
- Technical difficulty
- Runnable/climbing/descending characteristics

Race outcome should consider:
- Athlete attributes
- Current fitness and fatigue
- Equipment bonuses
- Segment terrain
- Pacing strategy
- Controlled randomness

The simulator must return a reproducible result when supplied with the same state and random seed. This is essential for automated testing and balancing.

### Economy and progression

- Use one simple in-game currency in MVP.
- Race completion rewards currency and XP.
- Equipment has a price and clearly described effects.
- Unlock requirements must be visible before purchase.
- Do not allow negative currency or duplicate unique inventory entries.
- Persist race results and progression history rather than overwriting past results.

### Balance rule

Do not tune the game around realism alone. Prioritize choices that are understandable, meaningful and fun. All starting values must be adjustable without rewriting the engine.

---

## 8. Data model — conceptual baseline

Final SQL types and constraints are to be proposed by Claude Code and reviewed before implementation.

| Entity | Purpose |
|---|---|
| `profiles` | Auth-linked player profile and preferences |
| `athletes` | Player's career athlete, archetype, level and attributes |
| `training_sessions` | Catalog of available training session definitions |
| `training_days` | Planned/completed sessions by athlete and date |
| `training_state` | Current fitness, fatigue and other derived state |
| `equipment_catalog` | Static equipment definitions and effects |
| `inventory` | Items owned by each athlete |
| `races` | Race definitions and entry requirements |
| `race_segments` | Ordered course segments |
| `race_results` | Historical race outcomes and rewards |
| `seasons` | Season definitions and status |
| `rivals` | Simulated rival profiles |
| `leaderboard_entries` | Season ranking values |
| `game_events` | Optional audit/event history for key progression actions |

Use UUIDs or other stable IDs where appropriate, foreign keys, sensible indexes and database constraints. Static catalogs may be seeded from SQL migrations. Player-specific tables must enforce ownership through RLS.

Do not build every table in the first commit. Implement only the schema needed for the current milestone.

---

## 9. Security, persistence and integrity

- Supabase Auth is the planned identity provider.
- Enable RLS for player-specific tables before connecting the UI.
- A player must not be able to read or mutate another player's private state.
- Do not trust client-submitted race rewards, XP, currency or leaderboard scores once competitive ranking matters.
- In MVP, client-side simulation may be acceptable for rapid prototyping, but document the limitation.
- Before public/competitive launch, move reward calculation and other sensitive mutations to trusted server-side logic.
- Never place secret API tokens in frontend variables.
- Validate inputs and handle network errors, duplicate submissions and retries.
- Provide loading, empty, success and error states in the UI.

---

## 10. Future integrations

### Strava — later milestone

Potential features:
- OAuth connection.
- Import activities with explicit user consent.
- Map activity fields to game challenges.
- Idempotent import: the same activity must not grant rewards twice.
- Disconnect/revoke flow and deletion of imported data where required.
- Respect Strava API terms, scopes, quotas and current branding requirements.

Do not assume every desired metric is available. Verify the current API capabilities and access requirements before implementation.

### Vertical Trail Labs (VTL) — later milestone

Potential features:
- Import or consume approved race/course data.
- Build richer terrain profiles for race simulation.
- Use aggregate performance patterns for simulated rivals, only where data rights permit.
- Keep VTL integration behind an adapter so the game can work without it.
- Confirm available API/export formats and permitted use before coding the integration.

Neither integration may block core gameplay or app startup.

---

## 11. Milestones and acceptance criteria

### M0 — Repository foundation

**Status:** Delivered and accepted. Merged into `main` with merge commit `694bf6b`.

**Goal:** establish a clean, deployable application skeleton.

Acceptance criteria:
- React + TypeScript + Vite application runs locally.
- Strict TypeScript enabled.
- Responsive shell with dark theme and mobile navigation.
- Routes/placeholders for Dashboard, Training, Equipment, Races and Career.
- Lint, type-check, test and production build scripts exist and pass.
- `.env.example` exists; secrets are not committed.
- README explains local setup and deployment.
- GitHub deployment to Cloudflare Pages is documented or configured, depending on repository access.

### M1 — Dashboard and Training prototype

**Status:** Delivered, tested by the owner on the Cloudflare Pages preview (Android) and accepted.
Delivered in commit `dd61ee6`; merged into `main` with merge commit `e0d8822`.

**Goal:** a playable, persistent, single-player training-management prototype on the Dashboard and
Training screens, without authentication or a backend.

Delivered scope (as approved by the PM; this replaces the original M1 draft):
- Fixed All-rounder demo athlete: Level 1, 0 XP, Fitness 50, Fatigue 10, six attributes at 50
  (unchanged during M1).
- Deterministic seven-day plan (Easy run, Intervals, Strength, Rest, Hills, Long run, Rest), repeated
  every week.
- Seven sessions with XP / Fitness / Fatigue values in `src/domain/training/sessions.ts`; Fitness and
  Fatigue clamped to 0–100.
- Levels by cumulative XP in `src/domain/athlete/levels.ts` (1: 0–99, 2: 100–249, 3: 250–449, 4: 450+).
- Daily state machine: only the current day can be edited or executed, exactly once; after day 7 a new
  week starts and progression is kept.
- Versioned localStorage save (`trailgame.save`, `schemaVersion: 1`) behind a repository interface;
  invalid or unsupported saves recover to a new demo with a notice.
- Reset demo action; unit and integration tests for rules, engine, persistence and both screens.
- Equipment, Races and Career remain placeholders.

Moved out of M1 (not yet scheduled): equipment purchase, race entry and simulation, race rewards and
career progression. They will be assigned to milestones defined by the PM following the Bible (§15).

### M2 — Athlete Progression

**Status:** Delivered and formally accepted by the General PM on 28 October 2026, with documented
non-blocking limitations. Merged into `main` with merge commit `c1f22a0` (implementation commit
`2058f48`).

Validation:
- Owner-reported: tested by the owner on the Cloudflare Pages preview.
- Independently rerun technical validation at `c1f22a0`: 182 automated tests passed; lint, type-check
  and production build passed; GitHub Actions CI passed on `main`.
- Not independently verified by the developer: physical-device behaviour and the Cloudflare
  deployments.

Documented non-blocking limitations (from the final audit):
- Displayed Fitness and the Training preview can lag after more than 24 h in the foreground without
  any action or tab switch; decay is applied before every state change, so saved data is unaffected.
- Attribute 100 is not reachable in M2 (Level 5 grants 8 points in total); the cap is enforced and
  tested in the engine.
- With two tabs open on the same career, the last save wins (no cross-tab sync); rewards and points
  are never duplicated, but an update can be lost.
- A saved decay reference in the future (device clock moved back) causes no decay until the device
  clock passes it.

**Goal:** athlete creation with four profiles and long-term progression through levels, attribute
points and real-time Fitness decay, as specified in the PM brief and Bible §2–§6.

Delivered scope:
- Profile selection (Climber, Sprinter, All-rounder, Endurance) before a career exists; attributes from
  `src/domain/athlete/profiles.ts`. New careers: Level 1, 0 XP, Fitness 20, Fatigue 0, 0 points.
- Training rewards in `src/domain/training/sessions.ts`: XP / Fitness / Fatigue — Easy run 9/2/5,
  Intervals 16/3/14, Strength 11/2/8, Hills 14/3/12, Long run 18/3/16, Trail technique 11/2/6,
  Rest 0/0/−12. Weekly plan unchanged; Trail technique is selectable but not in the plan.
- Levels at 0 / 100 / 250 / 450 / 700 XP (`src/domain/athlete/levels.ts`). Each level gained grants
  2 attribute points. Level and earned points derive from XP; the save stores points spent, so
  points can be neither lost nor granted twice.
- Attribute screen (`/attributes`): +1 per action, capped at 100; stale or repeated requests are
  rejected by the engine (`src/game-engine/attributes.ts`). No automatic attribute growth.
- Fitness decay (`src/game-engine/fitnessDecay.ts`): −1 per complete 24 h since the reference, which
  is set at career creation and on each completed non-rest session (not Rest). Applied on load, when
  the tab becomes visible again and before each action; the reference advances by whole periods so
  partial time is kept and no period is applied twice. Invalid or future references reset to now.
  Independent of the simulated week.
- Save schema v2 (`src/repositories/gameRepository.ts`). Loading never writes or deletes. v1 saves,
  unknown versions and malformed data show a blocking screen (Restart Career / Exit); Restart needs an
  explicit acknowledgement and only overwrites the old save when a new profile is confirmed. Exit
  leaves the save untouched.
- Approved UX decisions (D1–D4): the blocking screen also covers malformed and unsupported saves;
  Exit shows a static "save left untouched" screen; every route shows the setup flow until a career
  exists; Reset demo deletes the career and returns to profile selection.
  (D3 was later superseded by UI Improvements v1: the navigation is now hidden in the setup flow.)

### UI Improvements v1 (in progress)

**Status:** UI/UX pass defined in `docs/UI_IMPROVEMENTS.md`; not a gameplay milestone. Implemented one
screen per commit on the working branch; not merged into `main`.

- **Runner creation — implemented.** Two steps with no page scroll at 360×640 and 412×915:
  (1) Female/Male toggle (Female preselected), a snapping profile carousel with dots, six attribute
  bars with ▲ strengths and ▼ weaknesses, and a fixed "Choose [profile]" button; (2) runner name
  (required, 1–16 characters, trimmed) with a preview. The bottom navigation is hidden on every
  screen shown before a career exists, including the incompatible-save warning.
- **Cosmetic identity:** `athlete.sex` (`female` | `male`) and the chosen name are saved; sex never
  affects gameplay values. Save schema stays v2: careers saved before the field existed load with
  `sex: 'male'` (owner decision), without being rewritten on load.
- **Creation artwork:** placeholders only (owner decision). Final images go in
  `assets/runner/creation/{sex}/{profile}.webp` (or `.png`) and are picked up without code changes.
  The reference photos in `assets/runner/` are style references, not used in the app.
- **Dashboard and Training — pending**, with open decisions (equipment layers, Mon–Sun labels,
  activity duration/intensity data, placement of existing actions).

> **Note:** the milestones below are the original plan. Their names, order and scope are to be
> confirmed by the PM. M3–M6 keep their original numbers. The original "Persistence and account"
> milestone, first planned as M2, was renumbered to M7 to avoid conflicting with the delivered M2;
> its number does not set its order.

### M7 — Persistence and account

**Status:** Future milestone; not started. Originally planned as M2; scope unchanged.

**Goal:** save player progress reliably.

Acceptance criteria:
- Supabase Auth works in the chosen development environment.
- Database migrations and seed data are committed.
- Player state persists after refresh and a new session.
- RLS prevents cross-player access.
- Loading, error and retry states are implemented.
- No service-role key is exposed to the client.

### M3 — Balance, UX and responsive testing

**Goal:** make the game understandable and enjoyable.

Acceptance criteria:
- Training choices have meaningful trade-offs.
- Equipment bonuses are visible and understandable.
- Race results explain major performance factors.
- Mobile, tablet and desktop layouts are tested.
- A repeatable test checklist is documented.
- Balance values are centralized and tunable.

### M4 — PWA release candidate

**Goal:** provide an installable web experience.

Acceptance criteria:
- Valid manifest, icons and install behavior.
- HTTPS deployment.
- Appropriate offline fallback and clear handling of unsaved actions.
- Tested on real Android browser/device where available.
- iOS Safari behavior documented and tested where available.

### M5 — Native packaging assessment

**Goal:** decide whether to package with Capacitor for app stores.

Acceptance criteria:
- Capacitor proof of concept builds for Android.
- iOS build path and signing requirements documented (requires Apple tooling/account as applicable).
- Native plugin needs identified.
- No commitment to app-store submission until installation, persistence, navigation and privacy behavior are validated.

### M6 — Strava / VTL integrations

Each integration receives a separate scope, permission review, technical spike and acceptance criteria. Do not start before core gameplay is stable.

---

## 12. Definition of Done

A task is done only when:
- It meets the acceptance criteria agreed for the task.
- Code is typed and reasonably separated by responsibility.
- Relevant tests pass.
- Lint, type-check and production build pass, or failures are explicitly documented.
- UI has loading/empty/error states where applicable.
- Mobile layout is checked for user-facing changes.
- No secrets or unintended data are committed.
- Documentation is updated if setup, behavior or architecture changed.
- Claude Code provides a concise implementation report and manual test steps.

---

## 13. Feedback and bug-report format

When reporting an issue, the tester should provide as much of the following as practical:

- **Screen / feature:**
- **Expected behavior:**
- **Actual behavior:**
- **Steps to reproduce:**
- **Device / browser:**
- **Screenshot or short recording:**

The PM will classify it as:
- **P0 — Blocker:** app cannot run or data/security is at risk.
- **P1 — Critical:** core gameplay flow is broken.
- **P2 — Normal:** important UX or balance issue.
- **P3 — Minor:** visual polish or low-impact improvement.
- **Feature request:** new behavior outside the agreed scope.

---

## 14. First instruction for Claude Code

> **Historical:** this was the instruction for M0, which is complete. Current work follows the
> milestone brief issued by the PM.

Start with **M0 only**.

1. Inspect the repository and current Git state before changing files.
2. Report any existing project files or configuration that would be overwritten.
3. Create or update the application skeleton according to this specification.
4. Do not implement the full game, Supabase persistence, Strava or VTL in M0.
5. Run all available checks and report exact commands and results.
6. Provide a concise summary of changed files, setup instructions, deployment status and manual test steps.
7. If the repository is empty, initialize the project cleanly. If it already contains a project, preserve useful work and ask before destructive changes.

**M0 is accepted only after the user can open the deployed or local application on a phone and navigate the placeholder screens.**

---

## 15. Design reconciliation — Bible v1.1 vs implementation

Reviewed against `main` at `c1f22a0` (M2 accepted on 28 October 2026). The Bible is the intended
design; the code is the delivered state.

| # | Topic | Bible v1.1 | Implementation | Status |
|---|---|---|---|---|
| 1 | Attributes | Endurance, Climbing, Speed, Technical, Recovery, Consistency; 1–100 | Same | Resolved in M2 |
| 2 | Profiles | Climber, Sprinter, All-rounder, Endurance; chosen at career start | Same | Resolved in M2 |
| 3 | Starting values | Attributes 12–20 (96 total); Fitness 20; Fatigue 0 | Same | Resolved in M2 |
| 4 | Training rewards | XP −10 %, positive Fitness −50 %; Fatigue unchanged | Same | Resolved in M2 |
| 5 | Trail technique | Not listed in the Bible tables | Kept: 11 XP, +2 Fitness, +6 Fatigue (PM brief); not in the weekly plan | Resolved by PM brief |
| 6 | Week days | Monday–Sunday | Day 1–7 (no real calendar) | Open |
| 7 | Fitness decay | −1 per full 24 h without a non-rest session | Implemented on real time, independent of the simulated week | Resolved in M2 |
| 8 | Levels and points | Level 5 at 700 XP; 2 points per level; manual allocation | Same; no refunds | Resolved in M2 |
| 9 | Money and equipment | 100 coins; basic shoes and vest | Not implemented | Open (economy / equipment milestone) |
| 10 | Save data | Migrations, timestamps | Schema v2 with decay timestamp; v1 is not migrated (explicit restart flow, per PM brief) | Resolved in M2 |
| 11 | Attribute adaptation from training | Mapping defined, amounts not balanced | Not implemented; attributes change only by points | Open |
| 12 | Profile change at season end | Requires a season system | Not implemented | Open |
