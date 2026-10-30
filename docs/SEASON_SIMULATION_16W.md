# 16-week season simulation (owner request, 30 October 2026)

**Updates (same day):** after recovery Rest (+1) and decay on played days, see "After the fix";
after option b (recovery Rest 0) and the 24 h grace day, see "Final rules" at the end. The first
simulation below describes the rules before any fix.

Real engine (training, races, attribute points, shop, Fitness decay), values on `main` after the
merge of 30 October 2026. One race every 2 weeks (Sundays of weeks 2, 4, …, 16). Analysis only.

**Player rules used in every run**
- Race: on Monday of a race week, enter the lowest race that still gives full rewards
  (recommended level ≥ runner level) and that the runner can afford. In 16 weeks that is always
  Forest First Steps (Open, level 4, free).
- Attribute points: spent at once, in turn over the six attributes.
- Shop: buy as soon as affordable, in this order, and equip: Poles lvl 1 → Backpack lvl 1 → Trail
  shoes lvl 1 → Poles lvl 2 → Light shoes lvl 2 → Backpack lvl 2.
- **Sensible player (A, B):** keeps the default week, but rests the day before a race, rests when
  Fatigue ≥ 60, and swaps Intervals, Hills or Long run for Strength or Trail technique when
  Fatigue ≥ 35. Skips a race if Fatigue > 70 on Monday.
- **Default plan (C):** never changes the plan.
- **Daily play (A, C):** one game day per real day, so real-time Fitness decay applies (−1 per 24 h
  without a non-rest session). **Back to back (B):** no real-time decay.

## Findings

1. **Real-time decay punishes planned Rest days.** In daily play every Rest day is also 24 h without
   a non-rest session, so it costs Rest's −2 plus decay's −1, and more after two Rest days in a row.
   A sensible player ends at Fitness 0 by week 6 (A). Without decay the same player reaches 48 (B).
   Decay was meant for not playing, not for resting. Suggestion: a played Rest day keeps the decay
   reference (decay only counts days not played).
2. **The default week is not sustainable:** +47 Fatigue from training and −24 from the three Rest
   days, so +23 per week. Without changes (C), every profile is injured 9 times in 16 weeks and
   Fitness collapses to 0. A sensible player stays at Fatigue 40, injury-free.
3. **Progress is slow:** 652 XP and level 4 after 16 weeks (B). Races give only +3 XP and 10 coins
   (11th or lower), so the shop money is 25 + 80 = 105 coins in 16 weeks: Poles lvl 1, Backpack lvl 1
   and Trail shoes lvl 1. The runner never leaves Open races.
4. **Profiles behave as intended:** in the short, runnable Forest First Steps the Sprinter is best
   (#15–#19 late in B), All-rounder and Endurance are mid-pack (#17–#22) and the Climber is last
   of the four (#21–#25).

## A. Sensible player, daily play

### Climber — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 14 | 40 | 16/20/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #38, 0:51:11, +10 coins, +3 XP |
| 4 | 2 | 178 | 3 | 40 | 17/21/13/18/14/15 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #48, 0:55:50, +10 coins, +3 XP |
| 6 | 3 | 257 | 0 | 40 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #44, 0:54:11, +10 coins, +3 XP |
| 8 | 3 | 336 | 0 | 40 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #40, 0:52:09, +10 coins, +3 XP |
| 10 | 3 | 415 | 0 | 40 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #45, 0:54:25, +10 coins, +3 XP |
| 12 | 4 | 494 | 0 | 40 | 17/21/14/19/15/16 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #40, 0:52:18, +10 coins, +3 XP |
| 14 | 4 | 573 | 0 | 40 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #40, 0:52:07, +10 coins, +3 XP |
| 16 | 4 | 652 | 0 | 40 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #45, 0:54:29, +10 coins, +3 XP |

### Sprinter — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 14 | 40 | 13/12/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #32, 0:48:34, +10 coins, +3 XP |
| 4 | 2 | 178 | 3 | 40 | 14/13/20/17/16/18 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #41, 0:52:52, +10 coins, +3 XP |
| 6 | 3 | 257 | 0 | 40 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #38, 0:51:30, +10 coins, +3 XP |
| 8 | 3 | 336 | 0 | 40 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #34, 0:49:38, +10 coins, +3 XP |
| 10 | 3 | 415 | 0 | 40 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #39, 0:51:43, +10 coins, +3 XP |
| 12 | 4 | 494 | 0 | 40 | 14/13/21/18/17/19 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #34, 0:49:48, +10 coins, +3 XP |
| 14 | 4 | 573 | 0 | 40 | 14/13/21/18/17/19 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #34, 0:49:37, +10 coins, +3 XP |
| 16 | 4 | 652 | 0 | 40 | 14/13/21/18/17/19 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #39, 0:51:55, +10 coins, +3 XP |

### All-rounder — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 14 | 40 | 16/16/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #34, 0:49:34, +10 coins, +3 XP |
| 4 | 2 | 178 | 3 | 40 | 17/17/16/16/16/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #44, 0:54:03, +10 coins, +3 XP |
| 6 | 3 | 257 | 0 | 40 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #41, 0:52:34, +10 coins, +3 XP |
| 8 | 3 | 336 | 0 | 40 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #36, 0:50:38, +10 coins, +3 XP |
| 10 | 3 | 415 | 0 | 40 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #41, 0:52:48, +10 coins, +3 XP |
| 12 | 4 | 494 | 0 | 40 | 17/17/17/17/17/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #37, 0:50:47, +10 coins, +3 XP |
| 14 | 4 | 573 | 0 | 40 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #36, 0:50:36, +10 coins, +3 XP |
| 16 | 4 | 652 | 0 | 40 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #42, 0:52:57, +10 coins, +3 XP |

### Endurance — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 14 | 40 | 20/15/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #34, 0:49:47, +10 coins, +3 XP |
| 4 | 2 | 178 | 3 | 40 | 21/16/14/13/18/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #44, 0:54:17, +10 coins, +3 XP |
| 6 | 3 | 257 | 0 | 40 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #41, 0:52:47, +10 coins, +3 XP |
| 8 | 3 | 336 | 0 | 40 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #37, 0:50:50, +10 coins, +3 XP |
| 10 | 3 | 415 | 0 | 40 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #42, 0:53:02, +10 coins, +3 XP |
| 12 | 4 | 494 | 0 | 40 | 21/16/15/14/19/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #37, 0:51:00, +10 coins, +3 XP |
| 14 | 4 | 573 | 0 | 40 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #37, 0:50:49, +10 coins, +3 XP |
| 16 | 4 | 652 | 0 | 40 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #42, 0:53:10, +10 coins, +3 XP |

## B. Sensible player, days played back to back (no real-time decay)

### Climber — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 27 | 40 | 16/20/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #32, 0:48:52, +10 coins, +3 XP |
| 4 | 2 | 178 | 30 | 40 | 17/21/13/18/14/15 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #37, 0:50:45, +10 coins, +3 XP |
| 6 | 3 | 257 | 33 | 40 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #31, 0:48:14, +10 coins, +3 XP |
| 8 | 3 | 336 | 36 | 40 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #25, 0:45:53, +10 coins, +3 XP |
| 10 | 3 | 415 | 39 | 40 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #29, 0:47:20, +10 coins, +3 XP |
| 12 | 4 | 494 | 42 | 40 | 17/21/14/19/15/16 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #23, 0:44:58, +10 coins, +3 XP |
| 14 | 4 | 573 | 45 | 40 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #21, 0:44:18, +10 coins, +3 XP |
| 16 | 4 | 652 | 48 | 40 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #25, 0:45:46, +10 coins, +3 XP |

### Sprinter — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 27 | 40 | 13/12/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #26, 0:46:21, +10 coins, +3 XP |
| 4 | 2 | 178 | 30 | 40 | 14/13/20/17/16/18 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #30, 0:48:03, +10 coins, +3 XP |
| 6 | 3 | 257 | 33 | 40 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #25, 0:45:50, +10 coins, +3 XP |
| 8 | 3 | 336 | 36 | 40 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #19, 0:43:41, +10 coins, +3 XP |
| 10 | 3 | 415 | 39 | 40 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #23, 0:45:00, +10 coins, +3 XP |
| 12 | 4 | 494 | 42 | 40 | 14/13/21/18/17/19 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #17, 0:42:49, +10 coins, +3 XP |
| 14 | 4 | 573 | 45 | 40 | 14/13/21/18/17/19 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #15, 0:42:11, +10 coins, +3 XP |
| 16 | 4 | 652 | 48 | 40 | 14/13/21/18/17/19 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #19, 0:43:36, +10 coins, +3 XP |

### All-rounder — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 27 | 40 | 16/16/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:19, +10 coins, +3 XP |
| 4 | 2 | 178 | 30 | 40 | 17/17/16/16/16/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #33, 0:49:08, +10 coins, +3 XP |
| 6 | 3 | 257 | 33 | 40 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #27, 0:46:47, +10 coins, +3 XP |
| 8 | 3 | 336 | 36 | 40 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #21, 0:44:33, +10 coins, +3 XP |
| 10 | 3 | 415 | 39 | 40 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #25, 0:45:56, +10 coins, +3 XP |
| 12 | 4 | 494 | 42 | 40 | 17/17/17/17/17/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #19, 0:43:40, +10 coins, +3 XP |
| 14 | 4 | 573 | 45 | 40 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #17, 0:43:01, +10 coins, +3 XP |
| 16 | 4 | 652 | 48 | 40 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #21, 0:44:29, +10 coins, +3 XP |

### Endurance — injuries: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 27 | 40 | 20/15/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:31, +10 coins, +3 XP |
| 4 | 2 | 178 | 30 | 40 | 21/16/14/13/18/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #33, 0:49:21, +10 coins, +3 XP |
| 6 | 3 | 257 | 33 | 40 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #28, 0:46:58, +10 coins, +3 XP |
| 8 | 3 | 336 | 36 | 40 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #22, 0:44:44, +10 coins, +3 XP |
| 10 | 3 | 415 | 39 | 40 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #26, 0:46:08, +10 coins, +3 XP |
| 12 | 4 | 494 | 42 | 40 | 21/16/15/14/19/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #20, 0:43:52, +10 coins, +3 XP |
| 14 | 4 | 573 | 45 | 40 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #18, 0:43:12, +10 coins, +3 XP |
| 16 | 4 | 652 | 48 | 40 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #22, 0:44:40, +10 coins, +3 XP |

## C. Default plan never changed, daily play

### Climber — injuries: 9

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 19 | 64 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #43, 0:53:26, +10 coins, +3 XP |
| 4 | 2 | 183 | 0 | 60 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 2 | 86 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 1:01:18, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 1:01:20, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 1:00:05, +10 coins, +3 XP |
| 14 | 4 | 492 | 2 | 83 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:58:20, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:03:53, +10 coins, +0 XP, INJURED |

### Sprinter — injuries: 9

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 19 | 64 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #36, 0:50:30, +10 coins, +3 XP |
| 4 | 2 | 183 | 0 | 60 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 2 | 86 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:52, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:52, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:56:47, +10 coins, +3 XP |
| 14 | 4 | 492 | 2 | 83 | 14/13/21/18/17/19 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #46, 0:55:13, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 14/13/21/18/17/19 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:00:22, +10 coins, +0 XP, INJURED |

### All-rounder — injuries: 9

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 19 | 64 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #39, 0:51:42, +10 coins, +3 XP |
| 4 | 2 | 183 | 0 | 60 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 2 | 86 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:19, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:21, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:58:11, +10 coins, +3 XP |
| 14 | 4 | 492 | 2 | 83 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #49, 0:56:32, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:01:54, +10 coins, +0 XP, INJURED |

### Endurance — injuries: 9

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 19 | 64 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #39, 0:51:55, +10 coins, +3 XP |
| 4 | 2 | 183 | 0 | 60 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 2 | 86 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:33, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:37, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:58:26, +10 coins, +3 XP |
| 14 | 4 | 492 | 2 | 83 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:56:47, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:02:09, +10 coins, +0 XP, INJURED |


# After the fix: recovery Rest (+1 after an active day) and decay only for days not played

Same player rules. A: one game day every 23 h (a player who plays daily, a little earlier each
day). A2: exactly every 24 h, the worst case: each check finds one full 24 h period, so decay still
takes 1 Fitness a day. C: default plan never changed.

**Findings**
1. **Decay is fixed for daily play** (A: 0 Fitness lost to decay), but not at exactly 24 h (A2: 111
   lost in 16 weeks), because one full period has passed when the player returns at the same time.
   Possible fix: a 24 h grace, so decay only counts full days after the first one without playing.
2. **Fitness now grows fast:** a sensible player gains about +12 Fitness a week and reaches 96 by
   week 8, at level 3. That wins the level-4 Open race (#1 from week 8) and makes 100 coins per race.
   The typical runner of the field reaches Fitness 90 only at level 30, so Fitness now outruns
   levels. Options: smaller Fitness gains for sessions, recovery Rest +0 instead of +1, or a Fitness
   cap tied to the level.
3. **The default plan still leads to injuries** (C: 9 injuries); recovery Rest does not change
   Fatigue.

## A. Sensible player, one day per real day (played a little earlier each day)

### Climber — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 42 | 40 | 16/20/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #32, 0:48:58, +10 coins, +3 XP |
| 4 | 2 | 178 | 60 | 40 | 17/21/13/18/14/15 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #22, 0:44:41, +10 coins, +3 XP |
| 6 | 3 | 261 | 78 | 40 | 17/21/14/19/14/15 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #8, 0:40:14, +25 coins, +7 XP |
| 8 | 3 | 367 | 96 | 40 | 17/21/14/19/14/15 | 30 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:35:45, +100 coins, +30 XP |
| 10 | 4 | 473 | 98 | 40 | 17/21/14/19/15/16 | 60 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:35:36, +100 coins, +30 XP |
| 12 | 4 | 579 | 98 | 40 | 17/21/14/19/15/16 | 70 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:35:30, +100 coins, +30 XP |
| 14 | 4 | 685 | 98 | 40 | 17/21/14/19/15/16 | 170 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:58, +100 coins, +30 XP |
| 16 | 5 | 791 | 98 | 42 | 18/22/14/19/15/16 | 270 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:55:29, +100 coins, +30 XP |

### Sprinter — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 42 | 40 | 13/12/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #26, 0:46:21, +10 coins, +3 XP |
| 4 | 2 | 178 | 60 | 40 | 14/13/20/17/16/18 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #15, 0:42:19, +10 coins, +3 XP |
| 6 | 3 | 284 | 78 | 40 | 14/13/21/18/16/18 | 5 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:38:14, +100 coins, +30 XP |
| 8 | 3 | 390 | 96 | 40 | 14/13/21/18/16/18 | 35 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:33:23, +100 coins, +30 XP |
| 10 | 4 | 496 | 98 | 40 | 14/13/21/18/17/19 | 45 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:33:06, +100 coins, +30 XP |
| 12 | 4 | 602 | 98 | 40 | 14/13/21/18/17/19 | 145 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:33:47, +100 coins, +30 XP |
| 14 | 5 | 708 | 98 | 40 | 15/14/21/18/17/19 | 245 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:33:29, +100 coins, +30 XP |
| 16 | 5 | 814 | 98 | 42 | 15/14/21/18/17/19 | 345 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:53:38, +100 coins, +30 XP |

### All-rounder — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 42 | 40 | 16/16/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:23, +10 coins, +3 XP |
| 4 | 2 | 178 | 60 | 40 | 17/17/16/16/16/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #18, 0:43:16, +10 coins, +3 XP |
| 6 | 3 | 269 | 78 | 40 | 17/17/17/17/16/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #3, 0:39:02, +50 coins, +15 XP |
| 8 | 3 | 375 | 96 | 40 | 17/17/17/17/16/16 | 55 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:34:19, +100 coins, +30 XP |
| 10 | 4 | 481 | 98 | 40 | 17/17/17/17/17/17 | 85 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:34:32, +100 coins, +30 XP |
| 12 | 4 | 587 | 98 | 40 | 17/17/17/17/17/17 | 95 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:36, +100 coins, +30 XP |
| 14 | 4 | 693 | 98 | 40 | 17/17/17/17/17/17 | 195 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:06, +100 coins, +30 XP |
| 16 | 5 | 799 | 98 | 42 | 18/18/17/17/17/17 | 295 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:54:18, +100 coins, +30 XP |

### Endurance — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 42 | 40 | 20/15/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:35, +10 coins, +3 XP |
| 4 | 2 | 178 | 60 | 40 | 21/16/14/13/18/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #18, 0:43:27, +10 coins, +3 XP |
| 6 | 3 | 261 | 78 | 40 | 21/16/15/14/18/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #4, 0:39:11, +25 coins, +7 XP |
| 8 | 3 | 367 | 96 | 40 | 21/16/15/14/18/16 | 30 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:34:52, +100 coins, +30 XP |
| 10 | 4 | 473 | 98 | 40 | 21/16/15/14/19/17 | 60 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:34:45, +100 coins, +30 XP |
| 12 | 4 | 579 | 98 | 40 | 21/16/15/14/19/17 | 70 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:43, +100 coins, +30 XP |
| 14 | 4 | 685 | 98 | 40 | 21/16/15/14/19/17 | 170 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:14, +100 coins, +30 XP |
| 16 | 5 | 791 | 98 | 42 | 22/17/15/14/19/17 | 270 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:54:25, +100 coins, +30 XP |

## A2. Sensible player, exactly every 24 h (worst case for decay)

### Climber — injuries: 0, Fitness lost to decay: 111

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 29 | 40 | 16/20/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #31, 0:48:30, +10 coins, +3 XP |
| 4 | 2 | 178 | 33 | 40 | 17/21/13/18/14/15 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #35, 0:50:12, +10 coins, +3 XP |
| 6 | 3 | 257 | 37 | 40 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #29, 0:47:30, +10 coins, +3 XP |
| 8 | 3 | 336 | 41 | 40 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #23, 0:45:01, +10 coins, +3 XP |
| 10 | 3 | 415 | 45 | 40 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #26, 0:46:15, +10 coins, +3 XP |
| 12 | 4 | 494 | 49 | 40 | 17/21/14/19/15/16 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #19, 0:43:45, +10 coins, +3 XP |
| 14 | 4 | 573 | 53 | 40 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #17, 0:42:54, +10 coins, +3 XP |
| 16 | 4 | 652 | 57 | 40 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #20, 0:44:08, +10 coins, +3 XP |

### Sprinter — injuries: 0, Fitness lost to decay: 111

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 29 | 40 | 13/12/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #25, 0:46:01, +10 coins, +3 XP |
| 4 | 2 | 178 | 33 | 40 | 14/13/20/17/16/18 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:31, +10 coins, +3 XP |
| 6 | 3 | 257 | 37 | 40 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #23, 0:45:09, +10 coins, +3 XP |
| 8 | 3 | 336 | 41 | 40 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #17, 0:42:51, +10 coins, +3 XP |
| 10 | 3 | 415 | 45 | 40 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #20, 0:43:58, +10 coins, +3 XP |
| 12 | 4 | 494 | 49 | 40 | 14/13/21/18/17/19 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #13, 0:41:40, +10 coins, +3 XP |
| 14 | 4 | 577 | 53 | 40 | 14/13/21/18/17/19 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #10, 0:40:51, +25 coins, +7 XP |
| 16 | 4 | 656 | 57 | 40 | 14/13/21/18/17/19 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #14, 0:42:03, +10 coins, +3 XP |

### All-rounder — injuries: 0, Fitness lost to decay: 111

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 29 | 40 | 16/16/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #28, 0:46:58, +10 coins, +3 XP |
| 4 | 2 | 178 | 33 | 40 | 17/17/16/16/16/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #32, 0:48:35, +10 coins, +3 XP |
| 6 | 3 | 257 | 37 | 40 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #25, 0:46:05, +10 coins, +3 XP |
| 8 | 3 | 336 | 41 | 40 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #19, 0:43:43, +10 coins, +3 XP |
| 10 | 3 | 415 | 45 | 40 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #22, 0:44:53, +10 coins, +3 XP |
| 12 | 4 | 494 | 49 | 40 | 17/17/17/17/17/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #16, 0:42:29, +10 coins, +3 XP |
| 14 | 4 | 573 | 53 | 40 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #13, 0:41:40, +10 coins, +3 XP |
| 16 | 4 | 652 | 57 | 40 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #17, 0:42:54, +10 coins, +3 XP |

### Endurance — injuries: 0, Fitness lost to decay: 111

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 29 | 40 | 20/15/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #28, 0:47:10, +10 coins, +3 XP |
| 4 | 2 | 178 | 33 | 40 | 21/16/14/13/18/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #32, 0:48:48, +10 coins, +3 XP |
| 6 | 3 | 257 | 37 | 40 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #26, 0:46:16, +10 coins, +3 XP |
| 8 | 3 | 336 | 41 | 40 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #20, 0:43:54, +10 coins, +3 XP |
| 10 | 3 | 415 | 45 | 40 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #23, 0:45:04, +10 coins, +3 XP |
| 12 | 4 | 494 | 49 | 40 | 21/16/15/14/19/17 | 30 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #16, 0:42:40, +10 coins, +3 XP |
| 14 | 4 | 573 | 53 | 40 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #14, 0:41:51, +10 coins, +3 XP |
| 16 | 4 | 652 | 57 | 40 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #17, 0:43:04, +10 coins, +3 XP |

## C. Default plan never changed, one day per real day

### Climber — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 47 | 64 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #37, 0:51:01, +10 coins, +3 XP |
| 4 | 2 | 183 | 38 | 60 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 29 | 86 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #48, 0:55:56, +10 coins, +3 XP |
| 8 | 3 | 327 | 4 | 100 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:58:19, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:27, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:01:14, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:59:44, +10 coins, +0 XP, INJURED |

### Sprinter — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 47 | 64 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #30, 0:48:07, +10 coins, +3 XP |
| 4 | 2 | 183 | 38 | 60 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 29 | 86 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #41, 0:52:47, +10 coins, +3 XP |
| 8 | 3 | 327 | 4 | 100 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #46, 0:55:01, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #48, 0:56:12, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 14/13/21/18/17/19 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:57:51, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 14/13/21/18/17/19 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #49, 0:56:30, +10 coins, +0 XP, INJURED |

### All-rounder — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 47 | 64 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #33, 0:49:19, +10 coins, +3 XP |
| 4 | 2 | 183 | 38 | 60 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 29 | 86 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #44, 0:54:07, +10 coins, +3 XP |
| 8 | 3 | 327 | 4 | 100 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #49, 0:56:26, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:35, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:59:18, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:57:54, +10 coins, +0 XP, INJURED |

### Endurance — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 47 | 64 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #34, 0:49:32, +10 coins, +3 XP |
| 4 | 2 | 183 | 38 | 60 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 29 | 86 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #45, 0:54:20, +10 coins, +3 XP |
| 8 | 3 | 327 | 4 | 100 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #49, 0:56:41, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:50, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:59:33, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:58:08, +10 coins, +0 XP, INJURED |


# Final rules: recovery Rest keeps Fitness (option b) and a 24 h grace day

Played exactly every 24 h (the former worst case). **Decay: 0 lost in every run.** Fitness still
grows about +6.5 a week for a sensible player: 76 at week 8 (level 3), 98 at week 12 (level 4). The
runner wins the level-4 Open race from week 8. Option b halves the growth but does not stop Fitness
outrunning levels: the typical runner of a field reaches 90 only at level 30. Open point for the
owner: a Fitness cap tied to the level, or smaller session gains.

## A. Sensible player, one game day every 24 h (same time every day)

### Climber — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 37 | 40 | 16/20/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #28, 0:47:04, +10 coins, +3 XP |
| 4 | 2 | 178 | 50 | 40 | 17/21/13/18/14/15 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #28, 0:47:00, +10 coins, +3 XP |
| 6 | 3 | 257 | 63 | 40 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #17, 0:42:49, +10 coins, +3 XP |
| 8 | 3 | 348 | 76 | 40 | 17/21/14/19/14/15 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #3, 0:38:56, +50 coins, +15 XP |
| 10 | 4 | 454 | 89 | 40 | 17/21/14/19/15/16 | 65 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:37:46, +100 coins, +30 XP |
| 12 | 4 | 560 | 98 | 40 | 17/21/14/19/15/16 | 5 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:34:28, +100 coins, +30 XP |
| 14 | 4 | 666 | 98 | 40 | 17/21/14/19/15/16 | 105 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:33:13, +100 coins, +30 XP |
| 16 | 5 | 772 | 98 | 42 | 18/22/14/19/15/16 | 205 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:57:20, +100 coins, +30 XP |

### Sprinter — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 37 | 40 | 13/12/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #22, 0:44:40, +10 coins, +3 XP |
| 4 | 2 | 178 | 50 | 40 | 14/13/20/17/16/18 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #21, 0:44:30, +10 coins, +3 XP |
| 6 | 3 | 261 | 63 | 40 | 14/13/21/18/16/18 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #10, 0:40:41, +25 coins, +7 XP |
| 8 | 3 | 367 | 76 | 40 | 14/13/21/18/16/18 | 30 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:37:04, +100 coins, +30 XP |
| 10 | 4 | 473 | 89 | 40 | 14/13/21/18/17/19 | 60 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:35:42, +100 coins, +30 XP |
| 12 | 4 | 579 | 98 | 40 | 14/13/21/18/17/19 | 70 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:32:09, +100 coins, +30 XP |
| 14 | 4 | 685 | 98 | 40 | 14/13/21/18/17/19 | 170 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:31:52, +100 coins, +30 XP |
| 16 | 5 | 791 | 98 | 42 | 15/14/21/18/17/19 | 270 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:55:22, +100 coins, +30 XP |

### All-rounder — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 37 | 40 | 16/16/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #24, 0:45:35, +10 coins, +3 XP |
| 4 | 2 | 178 | 50 | 40 | 17/17/16/16/16/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #24, 0:45:30, +10 coins, +3 XP |
| 6 | 3 | 257 | 63 | 40 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #13, 0:41:32, +10 coins, +3 XP |
| 8 | 3 | 363 | 76 | 40 | 17/17/17/17/16/16 | 15 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:37:48, +100 coins, +30 XP |
| 10 | 4 | 469 | 89 | 40 | 17/17/17/17/17/17 | 45 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:36:25, +100 coins, +30 XP |
| 12 | 4 | 575 | 98 | 40 | 17/17/17/17/17/17 | 55 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:32:42, +100 coins, +30 XP |
| 14 | 4 | 681 | 98 | 40 | 17/17/17/17/17/17 | 155 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:32:24, +100 coins, +30 XP |
| 16 | 5 | 787 | 98 | 42 | 18/18/17/17/17/17 | 255 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:56:05, +100 coins, +30 XP |

### Endurance — injuries: 0, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 99 | 37 | 40 | 20/15/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #25, 0:45:47, +10 coins, +3 XP |
| 4 | 2 | 178 | 50 | 40 | 21/16/14/13/18/16 | 20 | Poles · Lvl 1 | Forest First Steps (L4): #24, 0:45:42, +10 coins, +3 XP |
| 6 | 3 | 257 | 63 | 40 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #13, 0:41:42, +10 coins, +3 XP |
| 8 | 3 | 363 | 76 | 40 | 21/16/15/14/18/16 | 15 | Hydration backpack · Lvl 1, Trail shoes · Lvl 1, Poles · Lvl 2 | Forest First Steps (L4): #1, 0:37:58, +100 coins, +30 XP |
| 10 | 4 | 469 | 89 | 40 | 21/16/15/14/19/17 | 45 | Hydration backpack · Lvl 1, Poles · Lvl 2, Light trail shoes · Lvl 2 | Forest First Steps (L4): #1, 0:36:33, +100 coins, +30 XP |
| 12 | 4 | 575 | 98 | 40 | 21/16/15/14/19/17 | 55 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:32:49, +100 coins, +30 XP |
| 14 | 4 | 681 | 98 | 40 | 21/16/15/14/19/17 | 155 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Forest First Steps (L4): #1, 0:32:31, +100 coins, +30 XP |
| 16 | 5 | 787 | 98 | 42 | 22/17/15/14/19/17 | 255 | Poles · Lvl 2, Light trail shoes · Lvl 2, Hydration backpack · Lvl 2 | Riverside Trail (L6): #1, 0:56:13, +100 coins, +30 XP |

## C. Default plan never changed, one game day every 24 h

### Climber — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 42 | 64 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #33, 0:49:04, +10 coins, +3 XP |
| 4 | 2 | 183 | 30 | 60 | 17/21/13/18/14/15 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 19 | 86 | 17/21/14/19/14/15 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:48, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:29, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/21/14/19/14/15 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/21/14/19/14/15 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:59:53, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 17/21/14/19/15/16 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:58:09, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/21/14/19/15/16 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:01:57, +10 coins, +0 XP, INJURED |

### Sprinter — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 42 | 64 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #26, 0:46:22, +10 coins, +3 XP |
| 4 | 2 | 183 | 30 | 60 | 14/13/20/17/16/18 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 19 | 86 | 14/13/21/18/16/18 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #45, 0:54:34, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #48, 0:56:07, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 14/13/21/18/16/18 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 14/13/21/18/16/18 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #49, 0:56:36, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 14/13/21/18/17/19 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #46, 0:55:02, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 14/13/21/18/17/19 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 0:58:33, +10 coins, +0 XP, INJURED |

### All-rounder — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 42 | 64 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:28, +10 coins, +3 XP |
| 4 | 2 | 183 | 30 | 60 | 17/17/16/16/16/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 19 | 86 | 17/17/17/17/16/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #48, 0:55:56, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:34, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 17/17/17/17/16/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 17/17/17/17/16/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:58:00, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 17/17/17/17/17/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #49, 0:56:21, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 17/17/17/17/17/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:00:02, +10 coins, +0 XP, INJURED |

### Endurance — injuries: 9, Fitness lost to decay: 0

| Week | Lvl | XP | Fit | Fat | End/Clm/Spd/Tec/Rec/Con | Coins | Gear | Race (Sunday) |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 117 | 42 | 64 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | Forest First Steps (L4): #29, 0:47:40, +10 coins, +3 XP |
| 4 | 2 | 183 | 30 | 60 | 21/16/14/13/18/16 | 10 | Poles · Lvl 1 | — |
| 6 | 3 | 261 | 19 | 86 | 21/16/15/14/18/16 | 0 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #48, 0:56:09, +10 coins, +3 XP |
| 8 | 3 | 327 | 0 | 100 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:57:49, +10 coins, +0 XP, INJURED |
| 10 | 3 | 384 | 0 | 91 | 21/16/15/14/18/16 | 10 | Poles · Lvl 1, Hydration backpack · Lvl 1 | — |
| 12 | 3 | 414 | 0 | 56 | 21/16/15/14/18/16 | 20 | Poles · Lvl 1, Hydration backpack · Lvl 1 | Forest First Steps (L4): #50, 0:58:14, +10 coins, +3 XP |
| 14 | 4 | 492 | 3 | 83 | 21/16/15/14/19/17 | 5 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #49, 0:56:35, +10 coins, +3 XP |
| 16 | 4 | 558 | 0 | 100 | 21/16/15/14/19/17 | 15 | Poles · Lvl 1, Hydration backpack · Lvl 1, Trail shoes · Lvl 1 | Forest First Steps (L4): #50, 1:00:17, +10 coins, +0 XP, INJURED |
