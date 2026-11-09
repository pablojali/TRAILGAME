# Trail Studio

The designer's editor for the game's tables (owner request, 9 November 2026). It is a separate site
built from this repository (`studio/index.html`, code in `src/studio`). Its interface is in Spanish.

- **Carreras:** every race in a table. The editor sets distance, elevation gain, technicality
  (0–5), recommended level, difficulty (I–V), internal category, name and terrain in five
  languages. It previews the race card and its profile, and shows the effort, segments, entry
  levels, reference time and aid-station stops computed by the game's engine.
- **Equipamiento:** every item as its shop card. The editor sets type, level, price, pack, shop
  picture, avatar layer, attribute bonuses, time changes in percent, and texts in five languages.
  It previews the card as the shop shows it in Spanish.
- **Fotos y vídeos** (owner request, 9 November 2026). Uploads are prepared in the browser the way
  the game expects them:
  - **Race photo:** `assets/ui/races/RACE-xxx.jpg`, JPEG, 1672 px wide. Another picture of the same
    race, such as a `.webp`, is removed so the two do not compete.
  - **Race clip, one per segment:** `assets/race/clips/RACE-xxx/segment-N.mp4`. It must be a real
    MP4 (the game's checks refuse anything else) of at most 50 MB; the editor warns above 8 MB and
    aims for 3 MB. A poster `segment-N.jpg` is taken from the video automatically.
  - **Shop picture:** `assets/ui/thumbnails/thumb_<item>.png`, 512 × 512 with transparency kept. The
    item's thumbnail column is updated to point at it. On main, CI crops it for the shop
    (`prepare_shop_art.py`).
  - Uploads go into the proposal like table changes, with what is already on main shown beside
    them. They are not kept as a draft, so the Studio warns before you leave the page.
- **Propuestas:** saving creates a pull request on a `studio/…` branch, with the changes listed in
  words.
  - CI checks it, and Cloudflare previews the game with it ("Probar en el juego").
  - "Publicar" merges it, and main then deploys the game and the Edge Function.
  - While a proposal is open, the server still uses the published data.

The editor checks every change with the game's own table readers (`parseRaces`, `parseEquipment`)
before it can be proposed. Only edited rows change in the CSV files.

When a race's recommended level or difficulty changes, or a race is added, the proposal also adds a
ranking migration (`src/studio/migration.ts`, the same SQL as
`scripts/ranking_tables_sql.py --points-only`). After publishing, apply that migration to Supabase.

Drafts are kept in the browser until they are proposed or discarded.

## Setting it up (once)

1. **Cloudflare Pages project.** Go to Workers & Pages → Create → Pages → Connect to Git, choose
   `pablojali/TRAILGAME`, and set:
   - Project name: `trailgame-studio` (the address becomes `trailgame-studio.pages.dev`).
   - Production branch: `main`. Framework preset: None.
   - Build command: `npm run build:studio`. Output directory: `dist-studio`.
   - Branch deployments: none. Only main matters, and this avoids a Studio build for every branch.
2. **Only the owner gets in (Cloudflare Access).** Go to Zero Trust → Access → Applications → Add →
   Self-hosted:
   - Domain: `trailgame-studio.pages.dev`. Add `*.trailgame-studio.pages.dev` as well, for the
     preview addresses.
   - Policy: Allow, Include → Emails → the owner's email. Login is a one-time code sent to that
     email.
3. **GitHub token.** In GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
   - Repository access: only `TRAILGAME`.
   - Permissions: Contents (read and write, also for uploading pictures and videos), Pull requests (read and write), Commit statuses
     (read), and Checks (read) if it is offered.
   - Paste the token into the Studio the first time. It stays in that browser only, and
     "Desconectar" removes it.

## Developing

- `npm run dev:studio`: the Studio on a local server.
- `npm run build:studio`: builds it into `dist-studio`. `npm run build` builds both sites, so CI
  checks the Studio too.
