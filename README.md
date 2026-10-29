# TRAILGAME — Trail Manager

Trail-running career management game (beta). Mobile-first, responsive React + TypeScript web app.
See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the technical specification and
[`docs/GAME_DESIGN_BIBLE.md`](./docs/GAME_DESIGN_BIBLE.md) for the game design (v1.2) and
[`docs/UI_IMPROVEMENTS.md`](./docs/UI_IMPROVEMENTS.md) for the current UI pass and its decisions.

**Current state:** M2 — Athlete Progression is accepted. UI Improvements v1 (runner creation,
Dashboard, Training) and the post-M2 Rest and injury rules are on the working branch, pending review.
Dashboard, Training, Attributes and Races (catalog and entry, M4.1) are functional; Equipment and Career are placeholders.
Progress is saved in the browser's localStorage only.

## Requirements

- Node.js 24 LTS (see `.nvmrc`; Node ≥ 22.12 also works)
- npm 10+ (npm 11, bundled with Node 24, is recommended)

## Local setup

```bash
npm ci                 # install exact versions from package-lock.json
cp .env.example .env.local   # optional; no variables are used until M7
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
- Rest reduces Fatigue by 8 and Fitness by 2. Completing a session that leaves Fatigue above 95 injures the runner:
  no XP, −15 Fitness and 5 forced Rest days (`src/domain/training/injury.ts`).
- The runner's name, sex and appearance (hairstyle, skin tone, outfit) are cosmetic. Careers saved
  before the `sex` field existed load as `male`; careers saved before `appearance` existed load with
  the default appearance for their sex. Shoes are equipment, not appearance: the avatar has none until
  an equipment model exists. Creation artwork goes in `assets/runner/creation/{sex}/{profile}.webp` (or `.png`); profiles
  without an image show a labelled placeholder. Climber already has both images.

## Races (M4.1)

- Race configuration (no values in screens): `src/domain/races/categories.ts` (fees, prizes,
  anti-farming multipliers) and `src/domain/races/races.ts` (the 12 races). Starting coins:
  `src/domain/economy/coins.ts` (0).
- Entry: standard fee at or above the race's recommended level, early-entry fee below it, Open races
  free, no level locks. The fee is charged once, on confirmation, and the entry stays pending until
  race results exist (M4.2/M4.3, after the owner approves the simulation model).
- Coins and entries are saved in `trailgame.save` (`coins`, `raceEntries`); older careers load with
  0 coins and no entries.

## Adding runner creation artwork

1. Put the original illustration in `assets/runner/` (white or light plain background, runner facing
   right).
2. Run the preparation script (needs Python 3 and Pillow: `pip install pillow`):

   ```bash
   python3 scripts/prepare_creation_art.py assets/runner/Sprinter_women.jpg \
     assets/runner/creation/female/sprinter.webp
   ```

   It removes the background, crops the runner and places it on a transparent 640×960 canvas.
3. Check the result on a dark background, then build. No code changes are needed: the profile card
   uses the new image instead of the placeholder. Profile file names: `climber`, `sprinter`,
   `all-rounder`, `endurance`; sex folders: `female`, `male`.

## Manual test checklist (M2)

1. First visit: every tab shows **Choose your athlete**, with no bottom navigation and no page
   scroll. Switch Female/Male (all runner images change), swipe or use the dots to compare the
   profiles, then **Choose …**. Customize the avatar (a black silhouette placeholder) (Hair, Skin, Outfit tabs; the Female/Male
   choice is the same as on step 1), **Continue**, and enter a name (1–16 characters). Nothing is
   saved until **Start career**; the name then appears on the Dashboard.
2. Dashboard: the first screen shows "Name - Profile · Lv N" over the runner's avatar (as customized,
   no equipment, no shoes), attributes on the left and Level/XP/Fitness/Fatigue on the right, without scrolling;
   attribute points, Today, the week and Reset demo are below it.
3. Training: the Mon–Sun strip is on top and the selected day's full detail below it, without
   scrolling or popups. Tap a day's tab to see its detail; today's detail has the session selector,
   effects and the complete button. A double tap on complete only completes one day.
4. Injury: with Fatigue near 95, a session that would end above 95 shows an injury warning; training
   anyway gives no XP, −15 Fitness and 5 locked rest days (each Rest day also costs 2 Fitness).
5. New career: Level 1, 0 XP, Fitness 20/100, Fatigue 0/100, 0 unspent points, profile attributes.
6. Training: effects show the M2 values (e.g. Easy run +9 XP, +2 Fitness, +5 Fatigue). Trail
   technique can be selected but is not in the plan. Complete a day; reload; progress is kept.
7. Level up at 100 XP: feedback shows +2 attribute points; **Allocate points** opens Attributes.
   Each **+1** raises one attribute; buttons become inactive at 0 points.
8. Fitness decay: in the browser dev tools, set the saved `fitnessDecayReference` 3 days in the past
   and reload — Fitness drops by 3 once, with a notice; reloading again changes nothing.
9. Old save: put an M1 save in `trailgame.save` and reload — the blocking screen appears on every
   tab. **Exit** keeps the save. **Restart Career** → tick the box → choose a profile → new career.
10. **Reset demo** → **Confirm reset** returns to profile selection with no saved career.
11. Races: the **Races** tab (or **Race Hub** on the Dashboard) shows Level, coins (0) and 12 races in
    Open, Trail, Mountain and Elite; at level 1 Trail and above show "Early entry". Open
    **Forest First Steps** → **Enter race** → the confirmation shows fee, balance and balance after
    entry → **Confirm free entry** → "Result pending". Reload: still entered, the button is gone.
12. Paid entry (test only): in dev tools set the saved `state.coins` to 300 and `state.athlete.xp`
    to 250 (level 3), reload, open **Ridge Runner**: "Your fee" is the 100-coin standard fee. Enter
    and pay: the balance becomes 200, once, even with a double tap. With `state.coins` at 40 the
    button is inactive and shows "you need 60 coins more". **Cancel** charges nothing.

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
No environment variables are required for M0. From M7, add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the Pages project settings — never a service-role key.

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci`, lint, type-check, tests and build on pushes to `main` and on pull requests.
