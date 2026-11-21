# Project status

**Verified on `main` at `916c544` (21 November 2026) by the PM.** Where something could not be confirmed
from the code or the docs it says "unconfirmed". Update this file only through the PM.

## What the game contains

- **Client:** React 19 + TypeScript + Vite, mobile-first, five languages. Screens in `src/features`:
  career setup, appearance (avatar), dashboard, training, attributes, equipment (shop), races, Sunday
  Majors, career (ranking), Base Camp, coach, settings; inbox in the top bar.
- **Backend (Supabase):** 26 migrations; Edge Functions `career-ops` and `major-ops`; anonymous
  sign-in, account linking, cloud saves; progression, economy, equipment and NPC races are
  **server-authoritative** (Phases 2A to 3B of `DEVELOPMENT.md`). `npm run db:test` exists.
- **Trail Studio:** the owner's editor for races, GPX courses, Base Camp pieces and art. It opens
  PRs from `studio/*` branches.
- **CI:** lint, type-check, 96 test files, production build; on `main` it also deploys the Edge
  Functions and commits the rebuilt bundles and prepared art.

## Not present yet

- **PWA:** no web manifest and no service worker in `public/` or `index.html` (M5).
- **Native packaging:** no Capacitor, Expo or Flutter in the repository (M6). The owner's goal is Google
  Play and the App Store, with the web build as the development and validation environment.
- **Strava / VTL:** not started (M8, on hold until the core is stable).

## Documentation drift (to fix, task PM-1)

These documents describe an earlier state and contradict `main`:

| Where | Says | Reality |
|---|---|---|
| `README.md`, "Current state" | M2 accepted, Career is a placeholder, localStorage only | Career has a ranking screen, saves are in the cloud, Majors exist |
| `DEVELOPMENT.md`, header and section 11 M4 | M4 on the working branch, not merged | The race system is in `main` and in use |
| `DEVELOPMENT.md`, M7 | "Phase 1 done. Tables, auth and remote saves not started" | Phases 2A to 3B are implemented (sections further down the same file) |
| `DEVELOPMENT.md`, section 2 | Product owner / PM: ChatGPT | Pending decision D1 |
| `docs/M4_VALIDATION.md` | Branch not merged | Merged |

## Open from the owner's earlier decisions

- **M4 is not marked complete by the owner.** Its validation (29 Oct) reported a balance finding: under
  the training values of that date there was no sustainable way to gain Fitness. `SEASON_SIMULATION_16W.md`
  (30 Oct) records later fixes; whether the finding is closed is **unconfirmed**.
- `DEVELOPMENT.md` section 15 rows still open: attribute adaptation from training (row 11) and profile
  change at season end (row 12). Row 9 (money and equipment) looks implemented; unconfirmed.
- `EQUIPMENT_BALANCE_REVIEW.md` states that some of its numbers are out of date.
