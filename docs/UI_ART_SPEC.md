# Screen backgrounds and race photos (owner request, 31 October 2026)

The screens have illustrated backgrounds and each race card has a picture, like the owner's
mockups. Until an image is uploaded the game draws a simple scene in code, so nothing is missing
in the meantime; as soon as a file with the right name is in the right folder, the game uses it
(no code change).

Format: **JPG** (or PNG/WebP), sRGB. Large files are converted to light WebP before release, so
upload the best quality you have.

**In the game (31 October 2026):** `dashboard.jpg`, `equipment.jpg`, `races.jpg` and
`career.jpg`. Still drawn in code: Training, Settings and the 12 race photos.

## Backgrounds: `assets/ui/backgrounds/`

Portrait, **1080 × 2340 px** (phone, about 9 : 19.5). The picture fills the whole screen behind
the top bar, the content and the tab bar; on wider screens the sides are cropped or extended, so
keep the important part in the middle 80 % of the width. The game darkens the top and the bottom
a little so text stays readable; avoid busy detail where cards sit (listed per screen).

| File | Screen | Scene (from the mockups) | Keep clear |
|---|---|---|---|
| `dashboard.jpg` | Dashboard (and Attributes) | Mountain range at sunset, sky in the top third, the runner stands on a rocky top | The runner area (centre-left) and the bottom 20 % (Today card) |
| `training.jpg` | Training | A trail at morning light | Most of the screen has the week and day cards: a calm picture |
| `equipment.jpg` | Equipment (and Change look) | Wooden cabin interior: window, gear on the walls, a bench | The middle (runner) and the bottom 45 % (equipment slots) |
| `races.jpg` | Races (list, race detail, results) | Dark topographic map with an orange route and checkpoints | Busy lines are fine; cards cover most of it |
| `career.jpg` | Career | Starry night, a lone runner on a summit with a flag | The summit should sit in the top third (between the title and the Season card); the rest is under cards |
| `settings.jpg` | Settings (optional) | Anything calm | Everything: it is a list screen |

## Race photos: `assets/ui/races/`

Square, **600 × 600 px**, one per race, named by the race id. Shown at about 76 px on the race
list (so: simple, clear landscapes read best).

| File | Race | Category | Course | Terrain |
|---|---|---|---|---|
| `RACE-001.jpg` | Forest First Steps | open | 5 km, 120 m D+ | Non-technical forest paths |
| `RACE-002.jpg` | Riverside Trail | open | 8 km, 220 m D+ | Packed dirt, rolling hills |
| `RACE-003.jpg` | Pine Loop Challenge | open | 10 km, 350 m D+ | Forest trail, short climbs |
| `RACE-004.jpg` | Ridge Runner | trail | 12 km, 550 m D+ | Rolling ridges, mixed trail |
| `RACE-005.jpg` | Stone Path Classic | trail | 15 km, 750 m D+ | Rocky sections, moderate technicality |
| `RACE-006.jpg` | Wildwood Ascent | trail | 18 km, 950 m D+ | Sustained climbs, forest terrain |
| `RACE-007.jpg` | Summit Quest | mountain | 22 km, 1300 m D+ | Steep climbs, rocky descents |
| `RACE-008.jpg` | Alpine Traverse | mountain | 28 km, 1700 m D+ | Alpine paths, technical descents |
| `RACE-009.jpg` | Sky Ridge Ultra | mountain | 35 km, 2200 m D+ | Exposed ridges, sustained elevation |
| `RACE-010.jpg` | High Peaks Challenge | elite | 42 km, 2800 m D+ | Highly technical mountain terrain |
| `RACE-011.jpg` | Legends of the Crest | elite | 55 km, 3600 m D+ | Long mountain ultra, technical sections |
| `RACE-012.jpg` | Beyond the Skyline | elite | 70 km, 4800 m D+ | Extreme ultra, long climbs and descents |

## How it works (for developers)

`src/components/backdrop/backdrops.ts` finds the images with `import.meta.glob`; `Backdrop.tsx`
draws the fallback scenes (sunset and morning mountains, cabin, topographic map, starry summit).
`src/features/races/RacePhoto.tsx` draws a landscape per category when a race has no photo.

## Base Camp: `assets/ui/basecamp/` (owner design, 15–16 November 2026)

Base Camp replaces Equipment in the main navigation (`/base-camp`). It is the player's cabin, in
two panoramic scenes the player swipes sideways (no avatar). Each scene is built from layers on the
same canvas (16 November 2026):

| Kind | What | File |
| --- | --- | --- |
| background | the whole scene behind | JPG or PNG, 3200 × 1600 outside, 2600 × 1600 inside |
| cabin | the cabin, over the background | PNG with transparency, on its scene's canvas |
| decor | objects placed in slots | cut-out PNG with transparency, up to 2400 px per side |

- The pieces are listed in `src/data/basecamp.csv` (edited in Trail Studio › Multimedia › Base
  Camp): scene, kind, player level that unlocks it, price, currency (coins or Premium Coins), the
  picture's name and an optional action with its spot (shares of the picture). Level 0 and price
  0 = everyone's from the start, shown until the player takes it out (a free cabin or decor) or
  replaces it (a background or cabin).
- Actions (owner request, 16 November 2026), any kind of piece: `enter` (go inside), `exit` (go
  outside), `gear` (Equipment), `look` (Appearance), `mailbox` (congratulations and visits; for now
  it says they are coming), `training`, `races`, `career`. Every shown piece with an action gets a
  button at its spot. The house is part of each background (owner, 16 November 2026: the house
  changes with the scene), so every exterior background carries `enter` (its door) and every
  interior background `gear`. Decor (mailbox, banners, flags…) goes over it, each its own row and
  picture on the same canvas, drawn in the table's order. The first free background in the table
  is the one a new player sees.
- The first exterior picture (`lvl0-exterior`) was replaced by the owner's five scenes (beach,
  desert, lake, mountain, river) on 16 November 2026; careers that had it chosen show the first
  free background.
- Sources live in `assets/ui/basecamp/source/{exterior|interior}/{art}.{png|jpg|webp}`;
  `scripts/prepare_basecamp_art.py` (run by CI, which commits the result on main) writes what the
  game loads, `assets/ui/basecamp/{exterior|interior}/{art}.webp` (transparency kept, at most 1600
  px tall). A piece whose WebP is not there yet is not drawn, and its shop card says the picture is
  on its way.
- The first pictures (`lvl0_exterior`, 1079 × 625, and `lvl0_interior`, a 1080 × 912 band of the
  owner's interior) predate the canvas; the scene takes the background's own shape, and the
  pieces are stretched over it, so new pieces should go with 3200 × 1600 backgrounds.
- The player buys pieces in Base Camp › Personalizar (server-decided, career-ops `camp-buy`), then
  puts them in the scene or takes them out (`camp-use`): one background and one cabin per scene,
  any decor, and one upgrade per background (drawn instead of the background's picture, with the
  background's button and slots; choosing it brings its background into the scene). Coins are exchanged for Premium Coins there (`premium-exchange`, one way, at
  `coins_per_premium` in `src/data/economy.csv`). Premium Coins for real money are not part of it
  yet.
- Visiting (17 November 2026): another runner's name in the rankings or a Major's standings
  opens their refuge outside (`/base-camp/visit/:name`), as they have it, with no buttons in it.
  Opening it records a visit for its owner and «Felicitar» a congratulation, each once a day;
  both reach the owner's Inbox and mailbox (database functions `camp_public`, `camp_visit` and
  `camp_mailbox`, migration `20261117090000_camp_visits.sql`). Only the pieces in use leave the
  database. A runner without pieces, or an NPC, shows one of the free exteriors (always the same
  for the same name), and visits to NPCs are not recorded. Every refuge can be visited.
- Friends (17 November 2026): from a runner's refuge, «Agregar amigo» sends a friend request;
  the other runner accepts or declines it (from their refuge or Base Camp › Amigos). Only
  accepted requests are friends, both ways. Base Camp › Amigos lists requests to answer (with a
  count on the button), friends (level, visit, remove) and requests sent (cancel). Requests and
  acceptances reach the Inbox. At most 200 friends and 50 requests waiting per runner (database
  functions `friend_request`, `friend_respond`, `friend_remove`, `friend_list`, migration
  `20261118090000_friends.sql`). Requests to NPCs answer like any request and record nothing.
- Friends inside (17 November 2026): a friend visiting a refuge finds the door open («Entrar») and
  can leave the owner a message from inside («Dejar mensaje», 1 to 140 characters, at most 5 a
  day per refuge). Messages reach the owner's Inbox and mailbox (`?mailbox=1` opens it from the
  Inbox), where the owner can delete them. Database functions `camp_message`,
  `camp_message_delete`, and `camp_public` now says `friend` (migration
  `20261118100000_friend_refuge.sql`).
- Each picture fills the screen's height and is wider than it; it scrolls horizontally
  (`overflow-x`, `touch-action: pan-x`) and opens centred on the spot. The page never scrolls
  vertically.
- Ambient animations are CSS only (fireflies, dust; the lvl0 sun and lanterns follow those
  pictures) and stop with `prefers-reduced-motion`.
- The view is kept in the URL (`/base-camp?view=interior`), so Equipment's "← Base Camp" link
  returns to the living room. Equipment (`/equipment`) and Look (`/appearance`) keep the Base Camp
  tab highlighted.
- A piece removed from the table disappears from the careers that bought it (saves drop unknown
  ids), so pieces should be retired by raising their level or price instead.
- Exclusive pieces (owner request, 16 November 2026: the admin's own refuge) are listed in
  `src/data/basecamp_exclusive.csv`, same columns, out of Trail Studio. They are never sold or
  shown in the shop to anyone without them; career-ops gives them to the admins (`major_admins`)
  when their career is created, saved or changed. Their pictures go in the same source folder.
- A new career chooses its refuge first (coach welcome, 16 November 2026): the free exterior
  backgrounds with a picture (and an admin's exclusive ones), shown behind the coach; the welcome
  then happens in the chosen refuge and ends in Base Camp. Skip leaves the default refuge and opens
  the Dashboard.
- Slots (owner request, 16 November 2026): each background has up to 4 places for objects
  (`slots`: `x:y:scale|…`, the point an object stands on and its size there), numbered 1 to 4 in
  every background of the scene. Decor is a cut-out object (PNG, transparent, any size up to 2400
  px per side) with a `size` (its height as a share of the picture's height at scale 1); the player
  chooses which slot it stands in (Base Camp › Personalizar), and an object with an action carries
  its button on itself. Free objects fill the empty slots in table order until the player takes
  them out. The placement is kept by slot number (`camp.slots`, "scene:n"), so changing background
  keeps each object in the same numbered place; a background with fewer slots hides the rest.
