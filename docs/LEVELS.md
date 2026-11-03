> **Source of truth (3 November 2026):** the game reads levels from `src/data/levels.csv`. This page
> documents them; edit the CSV to change the game.

# Levels and what each one brings (1 November 2026)

Generated from the game's rules (`src/domain/athlete/levels.ts`, `shirts.ts`, `heads.ts`,
`src/domain/races/`). Regenerate it when those change.

## Rules

- **50 levels.** Level N needs 100·(N−1) + 25·(N−1)·(N−2) XP in total: each level costs 50 XP more
  than the one before (Level 2 at 100 XP, 10 at 2,700, 20 at 10,450, 30 at 23,200, 50 at 63,700).
- **Every level gives 2 attribute points** (98 in total at Level 50), spent on any attribute.
- **Looks** (shirts and hairstyles) unlock at the level in their art's file name. Hairstyles are per
  sex and skin tone (a hairstyle is offered only in the tones it is drawn in).
- **Races** open 2 levels below their recommended level, and entry is free. Above the recommended
  level, rewards fall: +1 level 75 %, +2 40 %, +3 or more 0 % of prizes (XP: at least 18).
- **Equipment** is not locked by level: everything in the shop can be bought with coins ("lvl" in an
  item's name is its tier).
- **Training XP** per session: Easy run 9, Intervals 16, Hills 14, Long run 18, Strength 11, Trail
  technique 11, Rest 0. A default week gives about 70 XP.
- **Race XP** at full rewards (1st / 2nd / 3rd / 4th–10th / 11th+): Open 300 / 210 / 150 / 75 / 30,
  Trail 600 / 420 / 300 / 150 / 60, Mountain 1,000 / 700 / 500 / 250 / 100, Elite 1,800 / 1,260 /
  900 / 450 / 180; never below 18.

## Table

| Level | Total XP | XP to next | Attribute points (total) | Unlocks | Recommended level of |
|---|---|---|---|---|---|
| 1 | 0 | 100 | 0 | Men: Charcoal T-shirt<br>Women: Blue tank top<br>Men: Hairstyle 1 (tones 1, 2, 3, 4)<br>Women: Hairstyle 1 (tones 1, 2, 3)<br>Women: Hairstyle 2 (tones 1, 2) |  |
| 2 | 100 | 150 | 2 | Men: Navy T-shirt<br>Women: Coral tank top<br>Races open: Forest First Steps (Open) |  |
| 3 | 250 | 200 | 4 | Men: Burgundy T-shirt, Green T-shirt<br>Women: Green tank top |  |
| 4 | 450 | 250 | 6 | Races open: Riverside Trail (Open) | Forest First Steps |
| 5 | 700 | 300 | 8 | Women: Hairstyle 3 (tones 3) |  |
| 6 | 1,000 | 350 | 10 | Races open: Pine Loop Challenge (Open) | Riverside Trail |
| 7 | 1,350 | 400 | 12 |  |  |
| 8 | 1,750 | 450 | 14 |  | Pine Loop Challenge |
| 9 | 2,200 | 500 | 16 | Races open: Ridge Runner (Trail) |  |
| 10 | 2,700 | 550 | 18 |  |  |
| 11 | 3,250 | 600 | 20 |  | Ridge Runner |
| 12 | 3,850 | 650 | 22 | Races open: Stone Path Classic (Trail) |  |
| 13 | 4,500 | 700 | 24 |  |  |
| 14 | 5,200 | 750 | 26 |  | Stone Path Classic |
| 15 | 5,950 | 800 | 28 |  |  |
| 16 | 6,750 | 850 | 30 | Races open: Wildwood Ascent (Trail) |  |
| 17 | 7,600 | 900 | 32 |  |  |
| 18 | 8,500 | 950 | 34 |  | Wildwood Ascent |
| 19 | 9,450 | 1,000 | 36 | Races open: Summit Quest (Mountain) |  |
| 20 | 10,450 | 1,050 | 38 |  |  |
| 21 | 11,500 | 1,100 | 40 |  | Summit Quest |
| 22 | 12,600 | 1,150 | 42 |  |  |
| 23 | 13,750 | 1,200 | 44 | Races open: Alpine Traverse (Mountain) |  |
| 24 | 14,950 | 1,250 | 46 |  |  |
| 25 | 16,200 | 1,300 | 48 |  | Alpine Traverse |
| 26 | 17,500 | 1,350 | 50 | Races open: Sky Ridge Ultra (Mountain) |  |
| 27 | 18,850 | 1,400 | 52 |  |  |
| 28 | 20,250 | 1,450 | 54 |  | Sky Ridge Ultra |
| 29 | 21,700 | 1,500 | 56 | Races open: High Peaks Challenge (Elite) |  |
| 30 | 23,200 | 1,550 | 58 |  |  |
| 31 | 24,750 | 1,600 | 60 |  | High Peaks Challenge |
| 32 | 26,350 | 1,650 | 62 |  |  |
| 33 | 28,000 | 1,700 | 64 |  |  |
| 34 | 29,700 | 1,750 | 66 |  |  |
| 35 | 31,450 | 1,800 | 68 |  |  |
| 36 | 33,250 | 1,850 | 70 |  |  |
| 37 | 35,100 | 1,900 | 72 |  |  |
| 38 | 37,000 | 1,950 | 74 | Races open: Legends of the Crest (Elite) |  |
| 39 | 38,950 | 2,000 | 76 |  |  |
| 40 | 40,950 | 2,050 | 78 |  | Legends of the Crest |
| 41 | 43,000 | 2,100 | 80 |  |  |
| 42 | 45,100 | 2,150 | 82 |  |  |
| 43 | 47,250 | 2,200 | 84 |  |  |
| 44 | 49,450 | 2,250 | 86 |  |  |
| 45 | 51,700 | 2,300 | 88 |  |  |
| 46 | 54,000 | 2,350 | 90 |  |  |
| 47 | 56,350 | 2,400 | 92 |  |  |
| 48 | 58,750 | 2,450 | 94 | Races open: Beyond the Skyline (Elite) |  |
| 49 | 61,200 | 2,500 | 96 |  |  |
| 50 | 63,700 | — | 98 |  | Beyond the Skyline |
