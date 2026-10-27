# TRAILGAME — Trail Manager

Trail-running career management game (beta). Mobile-first, responsive React + TypeScript web app.
See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the product and technical specification.

**Current milestone:** M1 — playable local training loop (Dashboard and Training are functional;
Equipment, Races and Career are placeholders). Progress is saved in the browser's localStorage only.

## Requirements

- Node.js 24 LTS (see `.nvmrc`; Node ≥ 22.12 also works)
- npm 10+ (npm 11, bundled with Node 24, is recommended)

## Local setup

```bash
npm ci                 # install exact versions from package-lock.json
cp .env.example .env.local   # optional; no variables are used until M2
npm run dev            # http://localhost:5173
```

### Testing on a phone

Your phone and computer must be on the same network.

```bash
npm run dev:lan        # dev server, also listening on your LAN IP
# or, for the production build:
npm run build && npm run preview:lan   # http://<your-computer-ip>:4173
```

Vite prints the `Network:` URL to open on the phone.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run dev:lan` | Dev server reachable from other devices on your network |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict) project check |
| `npm test` | Unit/component tests (Vitest + React Testing Library) |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Lint, type-check, test and build in sequence |

## Project structure

```text
src/
├── app/          # app shell, routes, navigation config, game provider (React state + saving)
├── components/   # reusable UI components (Screen, Card, Meter, Icon)
├── domain/       # typed models and rules: athlete, levels, training sessions
├── game-engine/  # pure game state and daily progression (no React)
├── repositories/ # persistence (localStorage in M1), versioned and validated
├── features/     # route-level screens: dashboard, training, equipment, races, career
├── styles/       # theme tokens (CSS variables) and global styles
└── test/         # test setup and helpers
```

Further folders from `DEVELOPMENT.md` §4 (`services/`, `integrations/`, `supabase/`) are added in the
milestone that needs them.

## Game rules and saved data (M1)

- Training values (XP, fitness, fatigue per session) live only in `src/domain/training/sessions.ts`.
- Level thresholds live only in `src/domain/athlete/levels.ts`.
- The game is saved under the localStorage key `trailgame.save` with a `schemaVersion`. Missing,
  malformed or unsupported saves are discarded and a new demo game starts, with an on-screen notice.
- **Reset demo** (Dashboard) restores the starting athlete and plan and deletes the save.

## Manual test checklist (M1)

1. Fresh start (or after **Reset demo**): Week 1 · Day 1, Level 1, 0 XP, Fitness 50/100, Fatigue 10/100.
2. Training: change the day 1 session; the effects preview and plan update.
3. Complete the day: feedback appears, day 1 shows *Completed*, day 2 becomes *Today*.
4. Reload the page: progress and the edited plan are kept.
5. Complete all 7 days: Week 2 starts on day 1 with XP, fitness and fatigue kept.
6. Dashboard shows the same values as Training.
7. Reset demo → Confirm reset: everything returns to step 1.

## Deployment — Cloudflare Pages

Not yet connected. To deploy from GitHub:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the `TRAILGAME` repository and the production branch (`main`).
3. Build settings:
   - Framework preset: **React (Vite)** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `24` (Cloudflare also reads `.nvmrc`)
4. Save and deploy. Every push to `main` deploys to production; other branches get preview URLs.

`public/_redirects` sends all paths to `index.html`, so deep links such as `/races` work after deployment.
No environment variables are required for M0. From M2, add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the Pages project settings — never a service-role key.

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci`, lint, type-check, tests and build on pushes to `main` and on pull requests.
