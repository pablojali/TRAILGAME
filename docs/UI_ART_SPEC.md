# Screen backgrounds and race photos (owner request, 31 October 2026)

The screens have illustrated backgrounds and each race card has a picture, like the owner's
mockups. Until an image is uploaded the game draws a simple scene in code, so nothing is missing
in the meantime; as soon as a file with the right name is in the right folder, the game uses it
(no code change).

Format: **JPG** (or PNG/WebP), sRGB. Large files are converted to light WebP before release, so
upload the best quality you have.

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
