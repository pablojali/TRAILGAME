# Race engine by distance (owner request, 10 November 2026)

One engine for every distance did not work: on Riverside Trail (8 km) a strategy changed a 17-minute
segment by seconds (Recovery 18:10, Easy 18:00, Target and Hard 17:40). Races now use one of three
bands by distance, set in `RACE_STRATEGY.distanceBands` (`src/domain/races/strategyConfig.ts`).

| Band | Recovery | Easy | Target | Hard | Fatigue above plan slows (×) | Below plan speeds up (share) | Fresh start |
|---|---|---|---|---|---|---|---|
| Under 30 km | 1.08 / 0.45 | 1.04 / 0.70 | 1 / 1 | 0.91 / 1.6 | 0.6 | all | — |
| 30–90 km | 1.06 / 0.45 | 1.03 / 0.70 | 1 / 1 | 0.95 / 2.0 | 1.5 | 0.3 | Fatigue under 30: Hard fatigue 1.4 |
| Over 90 km | 1.05 / 0.45 | 1.025 / 0.70 | 1 / 1 | 0.95 / 1.9 | 1.2 | 0.2 | Fatigue under 30: Hard fatigue 1.3 |

Each cell is pace multiplier / in-race fatigue multiplier. *Fresh start*: the runner's career Fatigue
when the race starts. Technical descents also take away part of Hard's gain in every band: share
lost = descent share × technicality / 5 × (1 − Technical / 100) × 1.6, at most all of it.

A segment never pays for its own effort (owner rule, 10 November 2026): its pace uses the in-race
fatigue gained before it, so Hard is always faster in the segment where it is chosen and the cost
comes in the segments after. A player can climb conservatively and push the next descent.

## Simulation

The typical runner of the race's recommended level, gel and bar, Normal stops, no day form. Career
Fatigue 35 (tired: the field's anchors place them 23rd at Target) and 20 (fresh). Field of 30.
Synthetic races over 90 km are Beyond the Skyline stretched to 100 and 160 km (none exist yet).

| Race | Segment 1 at Target | Hard vs Target, segment 1 | Target all the way (F35) | Hard all the way (F35) | Easy all the way (F35) | Target (F20) | Hard (F20) |
|---|---|---|---|---|---|---|---|
| Forest First Steps (5 km, tec. 0) | 14:02 | −1:16 | 24:09 · 23º | −2:06 · 11º | +0:55 · 23º | 23:08 · 15º | −2:00 · 6º |
| Riverside Trail (8 km, tec. 0) | 23:46 | −2:08 | 40:11 · 23º | −3:29 · 11º | +1:32 · 23º | 38:31 · 15º | −3:20 · 6º |
| Pine Loop Challenge (10 km, tec. 2) | 32:17 | −2:54 | 53:19 · 23º | −4:15 · 11º | +2:02 · 23º | 51:09 · 15º | −4:04 · 7º |
| Ridge Runner (12 km, tec. 2) | 43:55 | −3:57 | 1:09:51 · 23º | −5:21 · 11º | +2:39 · 23º | 1:07:06 · 15º | −5:08 · 7º |
| Stone Path Classic (15 km, tec. 3) | 33:26 | −2:42 | 1:31:02 · 23º | −5:58 · 12º | +3:19 · 23º | 1:27:33 · 15º | −5:43 · 8º |
| Wildwood Ascent (18 km, tec. 2) | 42:07 | −3:32 | 1:53:45 · 23º | −8:10 · 11º | +4:08 · 23º | 1:49:31 · 15º | −7:50 · 7º |
| Summit Quest (22 km, tec. 3) | 38:42 | −2:57 | 2:27:52 · 23º | −9:03 · 12º | +5:13 · 23º | 2:22:30 · 15º | −8:40 · 8º |
| Alpine Traverse (28 km, tec. 5) | 43:45 | −3:46 | 3:14:50 · 23º | −9:38 · 13º | +6:38 · 23º | 3:07:58 · 15º | −9:13 · 9º |
| Sky Ridge Ultra (35 km, tec. 3) | 45:03 | −2:05 | 4:13:07 · 23º | +1:34 · 23º | +6:14 · 23º | 4:04:25 · 15º | −4:54 · 11º |
| High Peaks Challenge (42 km, tec. 5) | 46:16 | −1:52 | 5:18:23 · 23º | +7:29 · 23º | +7:32 · 23º | 5:07:40 · 15º | −2:29 · 13º |
| Legends of the Crest (55 km, tec. 5) | 53:17 | −2:07 | 7:13:02 · 23º | +13:04 · 23º | +9:54 · 23º | 6:59:07 · 15º | −2:35 · 13º |
| Beyond the Skyline (70 km, tec. 5) | 1:04:53 | −2:11 | 9:51:50 · 23º | +19:09 · 23º | +13:23 · 23º | 9:33:32 · 15º | −3:28 · 13º |
| Synthetic 100 (100 km, tec. 5) | 1:39:36 | −3:48 | 15:18:31 · 23º | +30:28 · 23º | +17:56 · 23º | 14:49:57 · 15º | −9:29 · 12º |
| Synthetic 160 (160 km, tec. 5) | 2:27:51 | −5:08 | 23:44:32 · 23º | +1:34:51 · 23º | +24:46 · 23º | 22:59:43 · 15º | +0:36 · 16º |

Hard vs Target per segment on Alpine Traverse (28 km, technicality 5): −8.6% on the opening climb,
−3.4% to −4.2% on its technical descents.

## Known limits

- Races stay at 8 segments at most, so a 160 km race has 20 km segments; races over 90 km want
  more segments for the strategy to matter segment by segment.
- In-race fatigue goes over 100 in races over 90 km at Target pace (122 at 160 km).
- Under 30 km, Hard all the way is now the fastest plan; its cost is the career Fatigue it leaves
  (+7 to +16 over Target), which weighs on the next week's training.

## How often runners start fresh (season simulation, 10 November 2026)

100 simulated players × 30 weeks on the real engine (training, injuries, levels, attribute
points, races run with the Balanced strategy, Normal stops). Each player draws a weekly plan (light
30%, the default week 40%, heavy 30%), a taper before races (none 40%, Saturday rest 40%, Friday
and Saturday rest 20%), a Fatigue guard (rests instead of a hard session at Fatigue 60: 35%, at 75:
25%, never: 40%) and a race rhythm (every week 25%, every 2 weeks 50%, every 3 weeks 25%). Each
race is the hardest one the level allows.

| Share of races started with Fatigue under 30 | Beginners (level 1, short races) | Ultra-level players (level 30, 30–90 km) |
|---|---|---|
| All races | 19% (309 of 1636) | 64% (1086 of 1690) |
| Light plan / default week / heavy plan | 68% / 1% / 2% | 92% / 66% / 35% |
| No taper / Saturday rest / Friday and Saturday rest | 7% / 18% / 39% | 45% / 71% / 84% |
| Race every week / 2 weeks / 3 weeks | 12% / 14% / 49% | 63% / 59% / 83% |
| Fatigue at the start: 25th / 50th / 75th percentile | 42 / 57 / 68 | 1 / 19 / 48 |
| Injuries in races / in training | 267 / 445 | 121 / 262 |

Ultra-level players start fresh far more often because their Recovery makes every Rest day recover
more Fatigue. Beginners reach level 6 to 11 in 30 weeks and only run races under 30 km.
