# Equipment balance review (PM request, 30 October 2026)

Analysis only: no production code was changed. Proposed adjustment under review:

| Item | Current | Proposed |
|---|---|---|
| Poles lvl 1 (25) | Climbing +2, Endurance +1, flats ×1.03 | Climbing +2, flats ×1.03 |
| Poles lvl 2 (50) | Climbing +3, Endurance +2, flats ×1.01 | Climbing +3, Endurance +1, flats ×1.01 |
| Backpack lvl 1 (30) | Endurance +2, wear ×0.90 | Endurance +1, wear ×0.90 |
| Backpack lvl 2 (90) | Endurance +3, wear ×0.85 | Endurance +2, wear ×0.85 |
| Shoes (all) and prices | — | unchanged |

The proposal does not mention the poles' flat-terrain penalty, so it is kept (×1.03 / ×1.01).

**Method.** Real engine (`raceSeconds`, `rivalTimes`), each race at its recommended level. Each
profile runner has its starting attributes plus the level's attribute points spread evenly
(+(L−1)/3 per attribute, the same rule as the reference runner), with the reference Fitness and
Fatigue for that level. No day form. The All-rounder is therefore the "typical runner" (#24 of
50). "Full Tech" = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; "Full Light" = the same
with Light shoes lvl 2. Dominance was checked over all 12 races × 4 profiles × Fitness −20/0/+10
× Fatigue 0/20/60.

## Findings

1. **Poles lvl 1 becomes too weak.** Without Endurance +1, the 3% flat penalty outweighs Climbing
   +2 in races 001–003 (up to +0.9% slower than no poles, one place lost) and it gains at most 0.6%
   anywhere else. Under the current values it is already slightly negative in 001–002. Suggestion:
   either keep Endurance +1 or reduce its flat penalty to ×1.01–1.02.
2. **Intended terrain holds.** Technical shoes peak on T2–T3 races (−2 to −3%) and do nothing on
   T0. Light shoes peak on short runnable races (−3.5 to −4.3%) and are slightly negative on T3. Poles
   help most on climbing races, packs most on ultras (Pack lvl 2: −1.4% at 5 km → −3.1% at 70 km,
   proposed). Both before and after the change.
3. **Full set.** Typical runner (All-rounder), race 012 (70 km): current −7.7% (#24 → #14),
   proposed −6.9% (#24 → #15). In ultras the full set is worth about 13–15 levels of attribute
   points, or Fitness +15. The proposal trims about 0.8 points from the full set and leaves the
   ultra edge mostly in place, because that edge comes from the multipliers (backpack wear ×0.85,
   technical shoes ×0.7). If the ultra edge should shrink further, those two multipliers are the
   lever.
4. **Dominance.**
   - Poles lvl 1 is never faster than Poles lvl 2, and Backpack lvl 1 is never faster than Backpack
     lvl 2. These are intended upgrade tiers; the cheaper tier is the price choice.
   - No shoe is dominated. Technical shoes lvl 2 lose to Trail shoes lvl 1 on T0 races, Light shoes lvl 2
     lose to both on T3, and Trail shoes lvl 1 lose to the lvl 2 models in their own terrain.
5. **Only while equipped.** Covered by `src/game-engine/equipmentRules.test.ts`:
   - bonuses are not attribute points and do not change base attributes or progression;
   - backpack and poles apply only while equipped;
   - swapping items swaps the bonus;
   - unequipped items stay in the inventory;
   - training gives the same outcome with any equipment.

   The engine adds the bonuses inside `raceSeconds` only. The changed values do not affect this.

## Avatar rendering of equipment

Confirmed bug: only the starter shoes have artwork (`assets/runner/avatar/footwear/starter-shoes.webp`).
The avatar draws a shoe layer only when that item has art, and it never draws the backpack or the
poles (`src/components/avatar/Avatar.tsx`, shoes-only filter). So with Trail shoes lvl 1,
Technical shoes lvl 2 or Light shoes lvl 2 equipped, the runner shows barefoot or in socks. Backpack and poles are
never visible. Proposed fix (awaiting approval):

- any equipped shoes without their own art fall back to the starter-shoes art, optionally tinted
  per model;
- backpack and poles need artwork on the 640 × 960 canvas (or simple placeholder layers) to be
  drawn.

## Detailed results

### Current catalog

#### Climber

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:49:17 #28 | −1.4% #26 | 0.0% #28 | −4.3% #22 | +0.3% #28 | −1.6% #26 | −1.4% #26 | −2.1% #25 | −3.6% #23 | −7.5% #18 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:17:29 #27 | −1.3% #26 | 0.0% #27 | −3.9% #22 | +0.2% #27 | −1.7% #25 | −1.5% #25 | −2.2% #24 | −3.7% #23 | −7.2% #18 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:36:54 #25 | −1.1% #24 | −0.8% #24 | −2.7% #22 | +0.0% #25 | −1.8% #23 | −1.4% #24 | −2.0% #23 | −4.4% #20 | −6.1% #18 |
| 004 Ridge Runner (L11, 12 km, T1) | 2:00:19 #25 | −1.0% #24 | −1.1% #23 | −2.3% #22 | −0.5% #24 | −2.0% #22 | −1.4% #23 | −2.0% #22 | −4.9% #19 | −5.9% #17 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:31:36 #24 | −0.9% #23 | −1.9% #22 | −1.3% #22 | −0.6% #23 | −2.0% #21 | −1.5% #22 | −2.1% #21 | −5.8% #17 | −5.1% #17 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:52:21 #24 | −0.8% #23 | −1.0% #23 | −1.8% #22 | −0.6% #23 | −2.1% #22 | −1.6% #22 | −2.3% #21 | −5.1% #18 | −5.8% #17 |
| 007 Summit Quest (L21, 22 km, T2) | 3:36:03 #23 | −0.7% #22 | −2.0% #21 | −0.9% #22 | −0.8% #22 | −2.1% #21 | −1.6% #21 | −2.4% #20 | −6.3% #15 | −5.1% #17 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:28:38 #23 | −0.7% #22 | −2.8% #19 | −0.1% #23 | −0.8% #22 | −2.0% #20 | −1.7% #21 | −2.5% #20 | −7.1% #14 | −4.3% #18 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:25:42 #23 | −0.6% #22 | −1.9% #21 | −0.6% #22 | −0.8% #22 | −2.1% #21 | −2.0% #21 | −2.9% #20 | −6.6% #15 | −5.4% #16 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:40:02 #23 | −0.7% #22 | −2.8% #19 | +0.1% #23 | −0.9% #22 | −2.1% #20 | −2.1% #20 | −3.1% #19 | −7.7% #13 | −4.8% #17 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:29:37 #23 | −0.6% #22 | −2.7% #20 | +0.2% #23 | −0.8% #22 | −2.0% #21 | −2.2% #20 | −3.3% #19 | −7.6% #13 | −4.8% #17 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:47:17 #23 | −0.5% #22 | −2.5% #20 | +0.2% #23 | −0.8% #22 | −1.9% #21 | −2.4% #20 | −3.6% #19 | −7.6% #13 | −5.0% #17 |

#### Sprinter

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:46:52 #22 | −1.1% #20 | 0.0% #22 | −3.6% #17 | +0.1% #22 | −1.7% #20 | −1.3% #20 | −2.0% #19 | −3.5% #17 | −6.7% #13 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:14:41 #23 | −1.0% #21 | 0.0% #23 | −3.2% #19 | −0.1% #23 | −1.9% #20 | −1.5% #21 | −2.1% #20 | −3.8% #18 | −6.8% #14 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:59 #24 | −0.8% #23 | −0.7% #23 | −2.1% #22 | −0.4% #24 | −2.3% #21 | −1.4% #23 | −2.1% #22 | −4.9% #18 | −6.1% #17 |
| 004 Ridge Runner (L11, 12 km, T1) | 2:00:13 #25 | −0.8% #24 | −1.0% #23 | −1.9% #22 | −0.9% #24 | −2.4% #22 | −1.4% #23 | −2.1% #22 | −5.2% #18 | −6.0% #17 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:33:33 #25 | −0.8% #24 | −1.8% #23 | −1.1% #24 | −1.0% #24 | −2.5% #22 | −1.6% #23 | −2.3% #23 | −6.3% #17 | −5.5% #19 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:54:55 #26 | −0.6% #25 | −0.8% #25 | −1.5% #24 | −1.0% #25 | −2.6% #23 | −1.7% #24 | −2.4% #23 | −5.6% #19 | −6.1% #18 |
| 007 Summit Quest (L21, 22 km, T2) | 3:40:51 #26 | −0.7% #25 | −1.9% #24 | −0.7% #25 | −1.2% #25 | −2.6% #23 | −1.8% #24 | −2.6% #23 | −6.7% #18 | −5.5% #19 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:36:01 #26 | −0.7% #25 | −2.7% #23 | +0.0% #26 | −1.1% #25 | −2.5% #23 | −1.8% #24 | −2.7% #23 | −7.5% #17 | −4.8% #20 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:34:43 #26 | −0.6% #26 | −1.7% #24 | −0.5% #26 | −1.2% #25 | −2.6% #23 | −2.1% #24 | −3.1% #23 | −7.2% #18 | −5.9% #19 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:52:58 #26 | −0.6% #26 | −2.7% #23 | +0.2% #27 | −1.3% #25 | −2.6% #23 | −2.3% #24 | −3.3% #22 | −8.2% #16 | −5.4% #20 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:43:58 #26 | −0.6% #26 | −2.6% #23 | +0.2% #26 | −1.1% #25 | −2.3% #23 | −2.4% #23 | −3.5% #22 | −8.0% #16 | −5.3% #20 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 11:06:31 #26 | −0.5% #26 | −2.4% #24 | +0.3% #27 | −1.0% #25 | −2.2% #24 | −2.6% #23 | −3.8% #22 | −8.0% #16 | −5.4% #20 |

#### All-rounder

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:47:47 #24 | −1.3% #23 | 0.0% #24 | −3.9% #19 | +0.2% #24 | −1.6% #22 | −1.4% #22 | −2.0% #22 | −3.5% #20 | −6.9% #15 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:15:33 #24 | −1.1% #23 | 0.0% #24 | −3.5% #20 | +0.1% #24 | −1.7% #22 | −1.4% #22 | −2.1% #22 | −3.6% #20 | −6.8% #15 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:47 #24 | −1.0% #23 | −0.8% #23 | −2.4% #21 | −0.1% #24 | −1.9% #22 | −1.3% #22 | −2.0% #22 | −4.5% #19 | −5.9% #17 |
| 004 Ridge Runner (L11, 12 km, T1) | 1:59:37 #24 | −0.9% #23 | −1.0% #23 | −2.1% #22 | −0.6% #23 | −2.1% #21 | −1.3% #22 | −2.0% #22 | −4.9% #18 | −5.8% #17 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:31:52 #24 | −0.8% #23 | −1.9% #22 | −1.2% #23 | −0.7% #23 | −2.2% #21 | −1.4% #22 | −2.1% #21 | −6.0% #17 | −5.1% #18 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:52:23 #24 | −0.7% #23 | −0.9% #23 | −1.6% #22 | −0.8% #23 | −2.3% #21 | −1.5% #22 | −2.3% #21 | −5.2% #18 | −5.8% #17 |
| 007 Summit Quest (L21, 22 km, T2) | 3:37:20 #24 | −0.7% #23 | −2.0% #22 | −0.8% #23 | −0.9% #23 | −2.2% #21 | −1.6% #22 | −2.4% #21 | −6.4% #16 | −5.1% #18 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:31:22 #24 | −0.7% #23 | −2.9% #21 | +0.0% #24 | −0.9% #23 | −2.1% #21 | −1.7% #22 | −2.5% #21 | −7.2% #15 | −4.3% #19 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:28:00 #24 | −0.6% #23 | −1.9% #22 | −0.6% #23 | −1.0% #23 | −2.3% #21 | −2.0% #22 | −2.9% #21 | −6.7% #16 | −5.4% #17 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:44:32 #24 | −0.6% #23 | −2.9% #21 | +0.2% #24 | −1.0% #23 | −2.2% #21 | −2.1% #22 | −3.0% #20 | −7.8% #14 | −4.8% #18 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:34:22 #24 | −0.6% #23 | −2.7% #21 | +0.2% #24 | −0.9% #23 | −2.0% #22 | −2.2% #21 | −3.3% #20 | −7.7% #14 | −4.8% #18 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:53:29 #24 | −0.5% #23 | −2.5% #21 | +0.3% #24 | −0.9% #23 | −2.0% #22 | −2.4% #21 | −3.5% #20 | −7.7% #14 | −5.0% #18 |

#### Endurance

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:47:59 #25 | −1.3% #23 | 0.0% #25 | −4.0% #20 | +0.2% #25 | −1.6% #23 | −1.3% #23 | −1.9% #22 | −3.4% #20 | −7.0% #16 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:15:41 #24 | −1.2% #23 | 0.0% #24 | −3.6% #20 | +0.1% #24 | −1.7% #22 | −1.3% #23 | −2.0% #22 | −3.5% #20 | −6.8% #16 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:59 #24 | −1.0% #23 | −0.8% #23 | −2.4% #21 | −0.1% #24 | −1.8% #22 | −1.3% #23 | −1.9% #22 | −4.4% #19 | −5.8% #17 |
| 004 Ridge Runner (L11, 12 km, T1) | 1:59:52 #24 | −0.9% #23 | −1.1% #23 | −2.1% #22 | −0.6% #24 | −2.1% #22 | −1.3% #23 | −1.9% #22 | −4.8% #18 | −5.7% #17 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:32:22 #24 | −0.9% #23 | −2.1% #22 | −1.2% #23 | −0.7% #24 | −2.1% #22 | −1.3% #23 | −2.0% #22 | −5.9% #17 | −4.9% #18 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:51:59 #24 | −0.7% #23 | −1.0% #23 | −1.6% #22 | −0.7% #23 | −2.2% #21 | −1.4% #22 | −2.1% #21 | −5.0% #18 | −5.6% #17 |
| 007 Summit Quest (L21, 22 km, T2) | 3:37:26 #24 | −0.8% #23 | −2.2% #21 | −0.8% #23 | −0.9% #23 | −2.1% #22 | −1.5% #22 | −2.2% #21 | −6.2% #16 | −4.8% #18 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:32:13 #24 | −0.8% #23 | −3.1% #21 | +0.0% #24 | −0.8% #23 | −2.0% #22 | −1.5% #23 | −2.2% #22 | −7.1% #15 | −4.0% #20 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:26:47 #24 | −0.6% #23 | −2.0% #21 | −0.6% #23 | −0.9% #23 | −2.2% #21 | −1.8% #21 | −2.6% #20 | −6.5% #15 | −5.1% #17 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:44:10 #24 | −0.7% #23 | −3.1% #20 | +0.3% #24 | −1.0% #23 | −2.1% #21 | −1.9% #22 | −2.8% #21 | −7.7% #14 | −4.4% #19 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:33:09 #24 | −0.6% #23 | −3.0% #20 | +0.3% #24 | −0.8% #23 | −1.9% #21 | −2.0% #21 | −3.0% #20 | −7.6% #14 | −4.4% #18 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:50:35 #24 | −0.6% #23 | −2.7% #20 | +0.3% #24 | −0.8% #23 | −1.9% #21 | −2.2% #21 | −3.2% #20 | −7.5% #14 | −4.6% #18 |

#### Dominance (same slot; all races × profiles × Fitness −20/0/+10 × Fatigue 0/20/60)

- Poles1 (25) is never faster than Poles2 (50).
- Pack1 (30) is never faster than Pack2 (90).
- ShoesLight2 is slower than nothing in some races: worst +0.3% (RACE-012 Endurance).
- Poles1 is slower than nothing in some races: worst +0.3% (RACE-001 Climber).

### Proposed adjustment

#### Climber

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:49:17 #28 | −1.4% #26 | 0.0% #28 | −4.3% #22 | +0.9% #29 | −1.0% #27 | −0.8% #27 | −1.5% #26 | −2.4% #25 | −6.5% #20 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:17:29 #27 | −1.3% #26 | 0.0% #27 | −3.9% #22 | +0.8% #28 | −1.1% #26 | −0.9% #26 | −1.6% #25 | −2.6% #24 | −6.3% #19 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:36:54 #25 | −1.1% #24 | −0.8% #24 | −2.7% #22 | +0.6% #26 | −1.2% #24 | −0.8% #24 | −1.5% #24 | −3.4% #21 | −5.2% #19 |
| 004 Ridge Runner (L11, 12 km, T1) | 2:00:19 #25 | −1.0% #24 | −1.1% #23 | −2.3% #22 | +0.0% #25 | −1.5% #23 | −0.8% #24 | −1.5% #23 | −3.9% #20 | −5.0% #19 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:31:36 #24 | −0.9% #23 | −1.9% #22 | −1.3% #22 | −0.1% #24 | −1.5% #22 | −1.0% #23 | −1.7% #22 | −5.0% #18 | −4.3% #19 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:52:21 #24 | −0.8% #23 | −1.0% #23 | −1.8% #22 | −0.1% #24 | −1.6% #22 | −1.0% #23 | −1.8% #22 | −4.2% #19 | −4.9% #18 |
| 007 Summit Quest (L21, 22 km, T2) | 3:36:03 #23 | −0.7% #22 | −2.0% #21 | −0.9% #22 | −0.3% #23 | −1.6% #21 | −1.1% #22 | −1.9% #21 | −5.4% #17 | −4.2% #18 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:28:38 #23 | −0.7% #22 | −2.8% #19 | −0.1% #23 | −0.3% #22 | −1.6% #21 | −1.2% #21 | −2.1% #20 | −6.3% #15 | −3.5% #18 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:25:42 #23 | −0.6% #22 | −1.9% #21 | −0.6% #22 | −0.3% #23 | −1.6% #21 | −1.5% #21 | −2.4% #20 | −5.8% #16 | −4.5% #18 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:40:02 #23 | −0.7% #22 | −2.8% #19 | +0.1% #23 | −0.4% #22 | −1.6% #21 | −1.6% #21 | −2.6% #19 | −6.9% #14 | −4.0% #18 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:29:37 #23 | −0.6% #22 | −2.7% #20 | +0.2% #23 | −0.3% #23 | −1.5% #21 | −1.8% #21 | −2.9% #19 | −6.8% #14 | −4.0% #18 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:47:17 #23 | −0.5% #22 | −2.5% #20 | +0.2% #23 | −0.3% #23 | −1.4% #21 | −2.0% #21 | −3.1% #19 | −6.9% #14 | −4.2% #18 |

#### Sprinter

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:46:52 #22 | −1.1% #20 | 0.0% #22 | −3.6% #17 | +0.7% #23 | −1.1% #20 | −0.7% #21 | −1.4% #20 | −2.5% #19 | −5.8% #14 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:14:41 #23 | −1.0% #21 | 0.0% #23 | −3.2% #19 | +0.5% #23 | −1.4% #21 | −0.8% #22 | −1.5% #21 | −2.8% #19 | −5.8% #15 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:59 #24 | −0.8% #23 | −0.7% #23 | −2.1% #22 | +0.2% #24 | −1.8% #22 | −0.9% #23 | −1.6% #22 | −3.9% #20 | −5.2% #18 |
| 004 Ridge Runner (L11, 12 km, T1) | 2:00:13 #25 | −0.8% #24 | −1.0% #23 | −1.9% #22 | −0.3% #24 | −1.9% #22 | −0.9% #24 | −1.6% #23 | −4.3% #19 | −5.1% #18 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:33:33 #25 | −0.8% #24 | −1.8% #23 | −1.1% #24 | −0.4% #25 | −2.0% #23 | −1.0% #24 | −1.8% #23 | −5.4% #19 | −4.6% #20 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:54:55 #26 | −0.6% #25 | −0.8% #25 | −1.5% #24 | −0.5% #25 | −2.1% #23 | −1.1% #24 | −1.9% #23 | −4.7% #20 | −5.2% #19 |
| 007 Summit Quest (L21, 22 km, T2) | 3:40:51 #26 | −0.7% #25 | −1.9% #24 | −0.7% #25 | −0.6% #25 | −2.1% #23 | −1.2% #24 | −2.1% #23 | −5.8% #19 | −4.6% #20 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:36:01 #26 | −0.7% #25 | −2.7% #23 | +0.0% #26 | −0.6% #25 | −2.0% #24 | −1.3% #24 | −2.2% #23 | −6.7% #18 | −4.0% #21 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:34:43 #26 | −0.6% #26 | −1.7% #24 | −0.5% #26 | −0.6% #26 | −2.1% #24 | −1.6% #25 | −2.6% #23 | −6.2% #19 | −5.0% #20 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:52:58 #26 | −0.6% #26 | −2.7% #23 | +0.2% #27 | −0.7% #26 | −2.0% #24 | −1.7% #24 | −2.8% #23 | −7.3% #17 | −4.5% #21 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:43:58 #26 | −0.6% #26 | −2.6% #23 | +0.2% #26 | −0.5% #26 | −1.8% #24 | −1.9% #24 | −3.0% #23 | −7.2% #17 | −4.4% #21 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 11:06:31 #26 | −0.5% #26 | −2.4% #24 | +0.3% #27 | −0.5% #26 | −1.7% #24 | −2.1% #24 | −3.3% #22 | −7.2% #17 | −4.6% #21 |

#### All-rounder

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:47:47 #24 | −1.3% #23 | 0.0% #24 | −3.9% #19 | +0.8% #25 | −1.0% #23 | −0.8% #23 | −1.4% #22 | −2.4% #21 | −6.0% #17 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:15:33 #24 | −1.1% #23 | 0.0% #24 | −3.5% #20 | +0.7% #25 | −1.2% #23 | −0.8% #23 | −1.5% #22 | −2.6% #21 | −5.9% #17 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:47 #24 | −1.0% #23 | −0.8% #23 | −2.4% #21 | +0.4% #25 | −1.4% #22 | −0.8% #23 | −1.5% #22 | −3.5% #20 | −5.0% #18 |
| 004 Ridge Runner (L11, 12 km, T1) | 1:59:37 #24 | −0.9% #23 | −1.0% #23 | −2.1% #22 | −0.1% #24 | −1.6% #22 | −0.8% #23 | −1.5% #22 | −4.0% #19 | −4.9% #18 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:31:52 #24 | −0.8% #23 | −1.9% #22 | −1.2% #23 | −0.2% #24 | −1.7% #22 | −0.9% #23 | −1.6% #22 | −5.1% #18 | −4.3% #19 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:52:23 #24 | −0.7% #23 | −0.9% #23 | −1.6% #22 | −0.2% #24 | −1.7% #22 | −1.0% #23 | −1.8% #22 | −4.3% #19 | −4.9% #18 |
| 007 Summit Quest (L21, 22 km, T2) | 3:37:20 #24 | −0.7% #23 | −2.0% #22 | −0.8% #23 | −0.4% #24 | −1.8% #22 | −1.1% #23 | −1.9% #22 | −5.5% #17 | −4.2% #19 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:31:22 #24 | −0.7% #23 | −2.9% #21 | +0.0% #24 | −0.4% #24 | −1.7% #22 | −1.2% #23 | −2.0% #22 | −6.4% #16 | −3.5% #20 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:28:00 #24 | −0.6% #23 | −1.9% #22 | −0.6% #23 | −0.4% #24 | −1.8% #22 | −1.4% #22 | −2.4% #21 | −5.9% #17 | −4.6% #18 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:44:32 #24 | −0.6% #23 | −2.9% #21 | +0.2% #24 | −0.5% #23 | −1.8% #22 | −1.6% #22 | −2.6% #21 | −7.0% #15 | −4.0% #19 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:34:22 #24 | −0.6% #23 | −2.7% #21 | +0.2% #24 | −0.4% #24 | −1.6% #22 | −1.7% #22 | −2.8% #21 | −6.9% #15 | −4.0% #19 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:53:29 #24 | −0.5% #23 | −2.5% #21 | +0.3% #24 | −0.4% #24 | −1.5% #22 | −1.9% #22 | −3.1% #20 | −6.9% #15 | −4.2% #19 |

#### Endurance

Time (position) with no equipment; then time change and position with each item and the full sets (Tech = Technical shoes lvl 2 + Poles lvl 2 + Backpack lvl 2; Light = same with Light shoes).

| Race | None | Shoes1 | ShoesTech2 | ShoesLight2 | Poles1 | Poles2 | Pack1 | Pack2 | Full Tech | Full Light |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 Forest First Steps (L1, 5 km, T0) | 0:47:59 #25 | −1.3% #23 | 0.0% #25 | −4.0% #20 | +0.8% #25 | −1.0% #23 | −0.7% #24 | −1.4% #23 | −2.3% #22 | −6.0% #17 |
| 002 Riverside Trail (L4, 8 km, T0) | 1:15:41 #24 | −1.2% #23 | 0.0% #24 | −3.6% #20 | +0.7% #25 | −1.1% #23 | −0.8% #23 | −1.4% #23 | −2.5% #21 | −5.8% #17 |
| 003 Pine Loop Challenge (L8, 10 km, T1) | 1:35:59 #24 | −1.0% #23 | −0.8% #23 | −2.4% #21 | +0.5% #25 | −1.3% #23 | −0.7% #23 | −1.4% #23 | −3.4% #20 | −5.0% #18 |
| 004 Ridge Runner (L11, 12 km, T1) | 1:59:52 #24 | −0.9% #23 | −1.1% #23 | −2.1% #22 | −0.1% #24 | −1.6% #22 | −0.8% #23 | −1.4% #23 | −3.9% #19 | −4.9% #18 |
| 005 Stone Path Classic (L14, 15 km, T2) | 2:32:22 #24 | −0.9% #23 | −2.1% #22 | −1.2% #23 | −0.2% #24 | −1.6% #22 | −0.9% #23 | −1.5% #23 | −5.1% #18 | −4.1% #19 |
| 006 Wildwood Ascent (L18, 18 km, T1) | 2:51:59 #24 | −0.7% #23 | −1.0% #23 | −1.6% #22 | −0.2% #24 | −1.7% #22 | −0.9% #23 | −1.6% #22 | −4.2% #19 | −4.7% #18 |
| 007 Summit Quest (L21, 22 km, T2) | 3:37:26 #24 | −0.8% #23 | −2.2% #21 | −0.8% #23 | −0.4% #24 | −1.7% #22 | −1.0% #23 | −1.7% #22 | −5.4% #17 | −4.0% #19 |
| 008 Alpine Traverse (L25, 28 km, T3) | 4:32:13 #24 | −0.8% #23 | −3.1% #21 | +0.0% #24 | −0.4% #24 | −1.6% #22 | −1.1% #23 | −1.8% #22 | −6.4% #16 | −3.3% #20 |
| 009 Sky Ridge Ultra (L28, 35 km, T2) | 5:26:47 #24 | −0.6% #23 | −2.0% #21 | −0.6% #23 | −0.4% #23 | −1.7% #22 | −1.3% #22 | −2.2% #21 | −5.7% #16 | −4.3% #18 |
| 010 High Peaks Challenge (L31, 42 km, T3) | 6:44:10 #24 | −0.7% #23 | −3.1% #20 | +0.3% #24 | −0.5% #23 | −1.7% #22 | −1.4% #22 | −2.3% #21 | −7.0% #15 | −3.6% #20 |
| 011 Legends of the Crest (L40, 55 km, T3) | 8:33:09 #24 | −0.6% #23 | −3.0% #20 | +0.3% #24 | −0.4% #23 | −1.5% #22 | −1.6% #22 | −2.6% #21 | −6.8% #15 | −3.7% #19 |
| 012 Beyond the Skyline (L50, 70 km, T3) | 10:50:35 #24 | −0.6% #23 | −2.7% #20 | +0.3% #24 | −0.4% #23 | −1.4% #22 | −1.8% #21 | −2.8% #20 | −6.8% #15 | −3.8% #19 |

#### Dominance (same slot; all races × profiles × Fitness −20/0/+10 × Fatigue 0/20/60)

- Poles1 (25) is never faster than Poles2 (50).
- Pack1 (30) is never faster than Pack2 (90).
- ShoesLight2 is slower than nothing in some races: worst +0.3% (RACE-012 Endurance).
- Poles1 is slower than nothing in some races: worst +0.9% (RACE-001 Climber).
