# Trail Studio

The designer's editor for the game's tables (owner request, 9 November 2026). It is a separate site
built from this repository (`studio/index.html`, code in `src/studio`). Its interface is in Spanish.

- **Carreras:** every race in a table. The editor sets distance, elevation gain, technicality
  (0–5), recommended level, difficulty (I–V), internal category, name and terrain in five
  languages. It previews the race card and its profile, and shows the effort, segments, entry
  levels, reference time and aid-station stops computed by the game's engine.
  - **Segments and aid stations** (12 November 2026): automatic (the profile generated from the
    totals, cut every ~6 km), or set by hand ("Definir tramos a mano", starting from the automatic
    ones). Each segment has its km, ascent, descent and descent technicality; its gradient per km
    is shown. Adding or removing a segment adds or removes an aid station (2 to 20 segments). The
    race's distance, ascent and technicality become the segments' sums (and maximum).
  - **Entry levels and stops**: minimum and maximum level, and the seconds of the quick, normal and
    slow stops. Empty means automatic (5 levels below and 2 above the recommended one; stops from
    the race's effort), shown in each field's hint.
  - Stored in `races.csv`: `min_level`, `max_level`, `stop_quick_s`, `stop_normal_s`,
    `stop_slow_s` and `segments` (`km:ascent:descent:technicality`, `|` between segments).
  - A race in progress keeps the course it started on; a change applies to races started after
    it is published. Do not change a race while a Sunday Major on it is running.
- **Avatares** (13 November 2026): upload new bodies and heads as PNG (transparent, on the runner's
  1024 × 1536 canvas), several at once. They go into the proposal and, once published, to
  `assets/runner/incoming/{bodies,heads}/`, which the game and the art script never read. The tab
  also shows what waits there and what the game uses today. Then ask Claude to prepare the batch:
  naming, moving to `assets/runner/bodies` or `heads`, catalogs (see `assets/runner/incoming/README.md`).
- **Corredores** (14 November 2026): every runner in the game, the players' careers and the
  ranking NPCs, read live from the database through `major-ops` (action `runners`, admins only,
  same sign-in as Majors). Totals and average level, bars by level band, country and sex (players
  and NPCs apart), player names used more than once, and a table filtered by type, country and
  name, sorted by level, name, country or last activity. No email or account id reaches the browser.
- **Equipamiento:** every item as its shop card. The editor sets type, level, price, pack, shop
  picture, avatar layer, attribute bonuses, time changes in percent, and texts in five languages.
  It previews the card as the shop shows it in Spanish.
- **Coach** (owner request, 9 November 2026): the Trail Coach's moments, read from
  `src/data/coach_moments.csv`.
  - The moments are listed in the order the coach checks them; the first one not yet seen that
    fits is shown. Each one can be moved earlier or later.
  - When a moment appears is set by a trigger chosen from the game's list
    (`src/features/coach/triggers.ts`), plus "only after" and "cancelled if" other moments.
  - Each step sets what it points at (from the list of marked screen elements), whether it waits
    for a tap, and the title and text in five languages. A preview shows the step in Spanish.
  - A moment that needs a trigger or a screen element the game does not have yet is saved with the
    trigger "pending" and never appears. Ask Claude to program it: a new trigger goes into
    `COACH_TRIGGERS`, and a new element gets a `data-coach` mark on its screen plus an entry in
    `COACH_TARGETS`.
- **Notificaciones** (owner request, 9 November 2026):
  - **Avisos a todos:** messages to every player, in `src/data/announcements.csv`.
    - Each has a start date (now by default, or later to schedule it), an optional end date, an
      optional link to a screen, and its title and text in five languages. English is required,
      because empty languages show it.
    - They appear in every player's Inbox (📣) between those dates.
    - The game's build also publishes the table as `/announcements.csv`, which an open game reads
      every 10 minutes. Players with the game open therefore receive a new announcement within
      minutes of the proposal being published, without reloading.
    - "Terminarlo" ends one, and announcements that are already published cannot be deleted. Never
      reuse an id: players' Inboxes remember it as read.
  - **Notificaciones automáticas:** the texts of the Inbox's own notifications (`inbox.*` in
    `common.json`), with when each appears. Their rules are code: ask Claude for a new kind.
- **Textos:** every game text (`src/i18n/locales/{lang}/{screen}.json`) in the five languages side
  by side, by screen or by search, with a "Solo con problemas" filter.
  - Only the wording can change. New keys need code.
  - Placeholders such as `{name}` must stay as they are in English, and empty texts are refused.
- **Balance:** levels, challenges, ranking points (difficulty bases, points per position, settings),
  the rivals' field by category and the 200 NPC runners of the ranking.
  - Each is an editable grid, with the table's own notes under "Qué es cada columna".
  - Rows can be added or removed where the game allows it.
  - Changes to ranking points or NPC runners add the ranking migration to the proposal (NPCs
    included).
- **Fotos y vídeos** (owner request, 9 November 2026). Uploads are prepared in the browser the way
  the game expects them:
  - **Race photo:** `assets/ui/races/RACE-xxx.jpg`, JPEG, 1672 px wide. Another picture of the same
    race, such as a `.webp`, is removed so the two do not compete.
  - **Race clip, one per segment:** `assets/race/clips/RACE-xxx/segment-N.mp4`. It must be a real
    MP4 (the game's checks refuse anything else) of at most 24 MB (Cloudflare Pages refuses files over 25 MiB); the editor warns above 8 MB and
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

The proposal also adds a ranking migration (`src/studio/migration.ts`, the same SQL as
`scripts/ranking_tables_sql.py`) when any of these change:

- a race's recommended level or difficulty, or a race is added;
- the difficulty base points or the points per position;
- the NPC runners.

After publishing, apply that migration to Supabase.

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

## Majors (Sunday Major, phase 1, 10 November 2026)

The **Majors** tab manages the Sunday Majors in the database (not in the repository): no pull
request, no code publish.

- **Sign-in:** the owner's game account (the email linked in the game's Settings). Studio sends a
  magic link that comes back to the Studio. The Edge Function `major-ops` checks that the account
  is in `major_admins`; a non-admin sees their user id to pass on to Claude.
- **Events:**
  - create and edit drafts: name, description, a race of the catalog, any date and a time in UTC,
    also shown in local time;
  - publish: the event copies the configuration and the level bands, and registration opens per the
    configuration;
  - cancel, with a reason;
  - **banner and videos** ("Banner y vídeos"): a banner image (saved as a JPEG up to 1672 px
    wide) and a clip per segment (MP4 up to 24 MB, uploaded as it is, with its poster picture).
    A segment without its own clip plays the course race's clip.
    - The files go to the Supabase Storage bucket `major-media` (public to read) through one-time
      uploads signed by `major-ops`; nothing goes through GitHub.
    - They can change until the race is run.
  - A published event can no longer be edited (its media aside). The database refuses every invalid transition.
  - **Report** ("Informe", events running or finished; phase 5): how many players and NPCs raced
    each category, and the standings with who was an NPC, the level, the time and whether the
    player's result is already in their career. Players never see who is an NPC (in the game, only
    a name ending with a full stop hints at it).
- **Configuration:** default start time (UTC), when registration and READY open, the aid-station
  decision window, the running phase per segment, participants per category, and the level bands.
  The bands are contiguous from level 1, with the last one open-ended. The configuration applies to
  Majors published from then on.
- **One-time setup:**
  - The Studio's address must be in Supabase → Authentication → URL Configuration → Redirect URLs
    (`https://trailgame-studio.pages.dev/**`).
  - The owner's user id goes into `major_admins` (Claude adds it).
