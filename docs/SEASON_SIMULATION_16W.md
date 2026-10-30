# 16-week season simulation (owner request, 30 October 2026)

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
