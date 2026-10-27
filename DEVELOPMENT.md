# Trail Manager — Development Specification

**Document:** `DEVELOPMENT.md`  
**Version:** 0.1.0  
**Status:** Initial baseline — ready for implementation planning  
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

- Read this file before starting work.
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

### Included in MVP

- Local development and deployable responsive web app.
- Dashboard for one player-controlled athlete.
- Five athlete archetypes:
  - Climber
  - Sprinter
  - Ultrarunner
  - Technical specialist
  - All-rounder
- Six core attributes:
  - Endurance
  - Speed
  - Power
  - Technique
  - Strength
  - Recovery
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

Each attribute uses a 0–100 scale at the game layer. Initial values and archetype bonuses should be defined in a single balance configuration.

| Attribute | Main influence |
|---|---|
| Endurance | Sustaining performance over time and distance |
| Speed | Pace on runnable and flatter sections |
| Power | Short steep climbs and accelerations |
| Technique | Technical descents and difficult terrain |
| Strength | Climbing durability and late-race resilience |
| Recovery | Fatigue reduction and adaptation between sessions |

Archetypes provide a starting profile and modest strengths/weaknesses; they must not permanently block a play style.

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

### M1 — Playable local career loop

**Goal:** test the game without requiring authentication or a live backend for every action.

Acceptance criteria:
- Demo athlete and seed content load.
- Player can plan a week and complete a training session.
- Fitness, fatigue, XP and attributes update through the game engine.
- Player can view available equipment and purchase an affordable item.
- Player can enter and simulate an eligible race.
- Results, rewards and career progression are visible.
- Core engine calculations have automated tests.
- Demo/reset mechanism is available for repeatable testing.

### M2 — Persistence and account

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

Start with **M0 only**.

1. Inspect the repository and current Git state before changing files.
2. Report any existing project files or configuration that would be overwritten.
3. Create or update the application skeleton according to this specification.
4. Do not implement the full game, Supabase persistence, Strava or VTL in M0.
5. Run all available checks and report exact commands and results.
6. Provide a concise summary of changed files, setup instructions, deployment status and manual test steps.
7. If the repository is empty, initialize the project cleanly. If it already contains a project, preserve useful work and ask before destructive changes.

**M0 is accepted only after the user can open the deployed or local application on a phone and navigate the placeholder screens.**
