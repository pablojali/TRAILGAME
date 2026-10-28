# TRAILGAME — Trail Manager

Trail-running career management game (beta). Mobile-first, responsive React + TypeScript web app.
See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the technical specification and
[`docs/GAME_DESIGN_BIBLE.md`](./docs/GAME_DESIGN_BIBLE.md) for the game design.

**Current milestone:** M2 — Athlete Progression (four starting profiles, levels with attribute
points, real-time Fitness decay). Dashboard, Training and Attributes are functional; Equipment, Races
and Career are placeholders. Progress is saved in the browser's localStorage only.

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
├── app/          # app shell, routes, navigation config, game provider (phases, saving, decay)
├── components/   # reusable UI components (Screen, Card, Meter, Icon)
├── domain/       # typed models and rules: athlete, profiles, levels, training sessions
├── game-engine/  # pure rules: daily progression, attribute points, Fitness decay (no React)
├── repositories/ # persistence (localStorage), versioned and validated
├── features/     # route-level screens: career setup, dashboard, training, attributes and placeholders
├── styles/       # theme tokens (CSS variables) and global styles
└── test/         # test setup and helpers
```

Further folders from `DEVELOPMENT.md` §4 (`services/`, `integrations/`, `supabase/`) are added in the
milestone that needs them.

## Game rules and saved data (M2)

- Starting profiles and attributes: `src/domain/athlete/profiles.ts`.
- Training values (XP, Fitness, Fatigue per session): `src/domain/training/sessions.ts`.
- Level thresholds and attribute points per level: `src/domain/athlete/levels.ts`.
- Fitness decay: `src/game-engine/fitnessDecay.ts` (−1 per full 24 h without a non-rest session).
- The career is saved under the localStorage key `trailgame.save` with `schemaVersion: 2`. Loading
  never deletes data: M1 (v1) saves, unknown versions and damaged data show a blocking screen with
  **Restart Career** and **Exit**.
- **Reset demo** (Dashboard) deletes the career and returns to profile selection.

## Manual test checklist (M2)

1. First visit: every tab shows **Choose your athlete**. Pick each profile and check its six
   attributes and the 96-point total; nothing starts until **Start career as …** is pressed.
2. New career: Level 1, 0 XP, Fitness 20/100, Fatigue 0/100, 0 unspent points, profile attributes.
3. Training: effects show the M2 values (e.g. Easy run +9 XP, +2 Fitness, +5 Fatigue). Trail
   technique can be selected but is not in the plan. Complete a day; reload; progress is kept.
4. Level up at 100 XP: feedback shows +2 attribute points; **Allocate points** opens Attributes.
   Each **+1** raises one attribute; buttons become inactive at 0 points.
5. Fitness decay: in the browser dev tools, set the saved `fitnessDecayReference` 3 days in the past
   and reload — Fitness drops by 3 once, with a notice; reloading again changes nothing.
6. Old save: put an M1 save in `trailgame.save` and reload — the blocking screen appears on every
   tab. **Exit** keeps the save. **Restart Career** → tick the box → choose a profile → new career.
7. **Reset demo** → **Confirm reset** returns to profile selection with no saved career.

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
