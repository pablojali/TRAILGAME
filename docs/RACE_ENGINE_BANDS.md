# Race engine by distance (owner request, 10 November 2026)

One engine for every distance did not work: on Riverside Trail (8 km) a strategy changed a 17-minute
segment by seconds (Recovery 18:10, Easy 18:00, Target and Hard 17:40). Races now use one of three
bands by distance, set in `RACE_STRATEGY.distanceBands` (`src/domain/races/strategyConfig.ts`).

| Band | Recovery | Easy | Target | Hard | Fatigue above plan slows (×) | Below plan speeds up (share) | Fresh start |
|---|---|---|---|---|---|---|---|
| Under 30 km | 1.08 / 0.45 | 1.04 / 0.70 | 1 / 1 | 0.91 / 1.6 | 0.6 | all | — |
| 30–90 km | 1.06 / 0.45 | 1.03 / 0.70 | 1 / 1 | 0.95 / 2.0 | 1.5 | 0.3 | Fatigue ≤ 15: Hard fatigue 1.4 |
| Over 90 km | 1.05 / 0.45 | 1.025 / 0.70 | 1 / 1 | 0.95 / 1.9 | 1.2 | 0.2 | Fatigue ≤ 10: Hard fatigue 1.3 |

Each cell is pace multiplier / in-race fatigue multiplier. *Fresh start*: the runner's career Fatigue
when the race starts. Technical descents also take away part of Hard's gain in every band: share
lost = descent share × technicality / 5 × (1 − Technical / 100) × 1.6, at most all of it.

## Simulation

The typical runner of the race's recommended level (the field's 15th-place anchor), gel and bar,
Normal stops, no day form. Career Fatigue 25 (normal) and 8 (fresh). Field of 30. Synthetic races
over 90 km are Beyond the Skyline stretched to 100 and 160 km (none exist yet).

| Race | Segment 1 at Target | Hard vs Target, segment 1 | Target all the way (F25) | Hard all the way (F25) | Easy all the way (F25) | Target (F8) | Hard (F8) |
|---|---|---|---|---|---|---|---|
| Forest First Steps (5 km, tec. 0) | 13:35 | −1:11 | 23:24 · 18º | −1:57 · 8º | +0:51 · 23º | 22:15 · 12º | −1:51 · 3º |
| Riverside Trail (8 km, tec. 0) | 23:01 | −1:59 | 38:55 · 18º | −3:14 · 8º | +1:25 · 23º | 37:03 · 12º | −3:04 · 3º |
| Pine Loop Challenge (10 km, tec. 2) | 31:16 | −2:40 | 51:38 · 18º | −3:54 · 8º | +1:51 · 23º | 49:12 · 12º | −3:42 · 3º |
| Ridge Runner (12 km, tec. 2) | 42:31 | −3:35 | 1:07:39 · 18º | −4:52 · 8º | +2:23 · 23º | 1:04:32 · 12º | −4:37 · 3º |
| Stone Path Classic (15 km, tec. 3) | 32:25 | −2:28 | 1:28:20 · 18º | −5:27 · 9º | +3:02 · 23º | 1:24:24 · 11º | −5:10 · 4º |
| Wildwood Ascent (18 km, tec. 2) | 40:52 | −3:14 | 1:50:25 · 18º | −7:28 · 9º | +3:46 · 23º | 1:45:38 · 12º | −7:05 · 4º |
| Summit Quest (22 km, tec. 3) | 37:34 | −2:42 | 2:23:40 · 18º | −8:12 · 10º | +4:44 · 23º | 2:17:37 · 12º | −7:47 · 4º |
| Alpine Traverse (28 km, tec. 5) | 42:29 | −3:26 | 3:09:22 · 18º | −8:31 · 11º | +5:59 · 23º | 3:01:38 · 11º | −8:03 · 5º |
| Sky Ridge Ultra (35 km, tec. 3) | 41:52 | −1:01 | 3:55:50 · 18º | +6:02 · 23º | +5:21 · 23º | 3:46:27 · 5º | −2:42 · 1º |
| High Peaks Challenge (42 km, tec. 5) | 44:46 | −0:45 | 5:08:31 · 18º | +13:51 · 23º | +6:39 · 23º | 4:56:28 · 3º | +0:15 · 3º |
| Legends of the Crest (55 km, tec. 5) | 51:44 | −0:43 | 7:00:57 · 18º | +22:38 · 23º | +8:39 · 23º | 6:45:16 · 3º | +1:29 · 5º |
| Beyond the Skyline (70 km, tec. 5) | 1:03:04 | −0:31 | 9:35:50 · 18º | +33:33 · 23º | +11:34 · 23º | 9:15:14 · 4º | +2:35 · 6º |
| Synthetic 100 (100 km, tec. 5) | 1:36:19 | −1:11 | 14:49:08 · 18º | +52:42 · 23º | +15:40 · 22º | 14:17:08 · 4º | −1:29 · 3º |
| Synthetic 160 (160 km, tec. 5) | 2:18:08 | +0:30 | 22:12:44 · 18º | +2:20:20 · 23º | +19:26 · 22º | 21:24:15 · 4º | +17:33 · 10º |

Hard vs Target per segment on Alpine Traverse (28 km, technicality 5): −8.1% on the opening climb,
−3.1% to −3.7% on its technical descents.

## Known limits

- Races stay at 8 segments at most, so a 160 km race has 20 km segments: Hard is no longer faster
  even in the first one (the segment's own fatigue catches up within it). Races over 90 km want
  more segments.
- In-race fatigue goes over 100 in races over 90 km at Target pace (122 at 160 km).
- Under 30 km, Hard all the way is now the fastest plan; its cost is the career Fatigue it leaves
  (+7 to +16 over Target), which weighs on the next week's training.
