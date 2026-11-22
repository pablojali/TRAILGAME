# Equipment wear: calibration report (brief B-6a, 22 November 2026)

This report is analysis only and changes no values. `wear_speed` ships at `0` (wear is off). Every value
below is a **proposal for the owner** to accept or change.

**How it was made:** `scripts/wear-simulation.ts` runs the real engine with the real tables on
`main`. Command: `npx vite-node scripts/wear-simulation.ts 32`.
- One game day per real day, so real-time Fitness decay applies.
- 16 and 32 game weeks.
- Wear speeds 0, 0.5, 0.75, 1 and 1.5.
- A race every second week ("biweekly") and every week ("weekly").

The real equipment table has no `life_km` yet. The owner supplies those values. The simulation
assumes these shoe lives (km):

| Shoes | Price (coins) | Assumed life (km) |
|---|---|---|
| Starter shoes | 0 | 150 |
| Trail shoes (Lvl 5) | 65 | 200 |
| Technical trail shoes (Lvl 9) | 120 | 250 |
| Light trail shoes (Lvl 12) | 145 | 200 |
| Mountain trail shoes (Lvl 20) | 190 | 300 |

Packs and poles were given no life, so they do not wear in the simulation.

## 1. The M4 balance finding (task B-1): closed

The M4 validation (29 October) found that a sensible player had no sustainable way to gain Fitness.
In daily play they ended at Fitness 0 by week 6 (`SEASON_SIMULATION_16W.md`, run A).

The current rules were re-run with the same sensible player:
- Default week.
- Rest the day before a race, and rest at Fatigue ≥ 60.
- Strength or Trail technique in place of a hard session at Fatigue ≥ 35.
- Points spent at once; gear bought when affordable.

Results, one game day per real day:

| Week | Race every 2nd week: Level / Fitness / Fatigue | Race every week: Level / Fitness / Fatigue |
|---|---|---|
| 4 | 3 / 27.5 / 39.6 | 3 / 25.8 / 36.3 |
| 8 | 4 / 33.5 / 42.1 | 5 / 30.0 / 41.4 |
| 16 | 6 / 44.0 / 40.7 | 7 / 38.0 / 38.5 |
| 24 | 8 / 55.0 / 42.1 | 8 / 46.3 / 43.0 |
| 32 | 10 / 65.5 / 36.1 | 12 / 54.5 / 37.5 |

- **Fitness:** rises steadily, by about +1.4 a week racing every second week and about +1.1 racing
  every week.
- **Fatigue:** stays around 40.
- **Injuries:** none in 32 weeks.

The finding is **closed** for a sensible player. The owner still decides whether to mark M4 complete.

## 2. How far a player runs

| | Race every 2nd week | Race every week |
|---|---|---|
| Training km in 32 weeks (from `wear_km.csv`) | 712 | 528 |
| Race km in 32 weeks | 137 | 295 |
| **Km per week** | **26.5** | **25.7** |

A sensible player covers about **26 km a week** either way. Racing more means resting more before
races and training less.

## 3. Proposal: `wear_speed` and shoe lives

The weeks a pair lasts = life_km ÷ (wear_speed × 26).

| Shoe life (km) | wear_speed 0.5 | 0.75 | **1** | 1.5 |
|---|---|---|---|---|
| 150 | 11.5 | 7.7 | **5.8** | 3.8 |
| 200 | 15.4 | 10.3 | **7.7** | 5.1 |
| 250 | 19.2 | 12.8 | **9.6** | 6.4 |
| 300 | 23.1 | 15.4 | **11.5** | 7.7 |

The target is a replacement roughly every 8 to 12 game weeks.

**Proposal:** `wear_speed = 1`, with the paid shoes at **200 to 300 km**:
- Trail shoes: 200 km
- Technical trail shoes: 250 km
- Light trail shoes: 200 km
- Mountain trail shoes: 300 km

Those pairs then last 7.7 to 11.5 weeks.

The starter shoes at 150 km last about 6 weeks. They are free; see section 6 about that.

### Share of income spent on replacements

A sensible player earns about 31 coins a week racing every second week and about 54 racing every
week (32-week runs: 1,005 and 1,725 coins). Income grows with level.

At `wear_speed 1`:

| Pair | Price | Weeks it lasts | Coins per week | Share of 31 / 54 coins a week |
|---|---|---|---|---|
| Trail shoes | 65 | 7.7 | 8.4 | 27 % / 16 % |
| Technical trail shoes | 120 | 9.6 | 12.5 | 40 % / 23 % |
| Mountain trail shoes | 190 | 11.5 | 16.5 | — (higher level, higher income) |

This is inside or close to the suggested 25 to 35 %. At `wear_speed 0.75`, the shares are about a
quarter lower.

### Cost per km of each shoe model

Cost per km = price × wear_speed ÷ life_km.

| Shoes | Price | Life (assumed) | Coins per km at speed 1 | At speed 0.75 |
|---|---|---|---|---|
| Starter shoes | 0 | 150 | 0 | 0 |
| Trail shoes | 65 | 200 | 0.33 | 0.24 |
| Technical trail shoes | 120 | 250 | 0.48 | 0.36 |
| Light trail shoes | 145 | 200 | 0.73 | 0.54 |
| Mountain trail shoes | 190 | 300 | 0.63 | 0.48 |

With these lives, the light shoes are the most expensive per km. The owner can make them last longer
to keep them attractive.

## 4. How much of a pair each race uses

A race uses its km × wear_speed ÷ life_km. At the proposed `wear_speed 1`:

| Category (races) | Distance | 200 km pair | 300 km pair |
|---|---|---|---|
| Open (RACE-001 to 003) | 4.7–9.8 km | 2–5 % | 2–3 % |
| Trail (RACE-005, 006) | 15.1–17.7 km | 8–9 % | 5–6 % |
| Mountain (RACE-004, 007–009) | 12.1–35 km | 6–18 % | 4–12 % |
| Elite (RACE-010 to 017) | 42–70 km | 21–35 % | 14–23 % |

The brief's example holds: a 150 km pair at speed 1 loses 47 % of its life in a 70 km race.

**Race km and training km:** I propose the **same multiplier** for both.
- Race km are real km. The training table already scales sessions down (a long run is 18 km).
- One multiplier keeps "km left" honest for the player.
- Elite races then cost a quarter to a third of a pair, which is the intended pressure before a long
  race (B-6b).

## 5. Bands: proposed numbers

The thresholds are the owner's. The numbers below are in `src/data/wear_bands.csv` as shipped. They
have no effect while `wear_speed` is 0.

| Durability left | effect_factor (bonus kept, B-6b) | injury_risk_pct (per training session) | race_start |
|---|---|---|---|
| 100–40 % | 1 | 0 | ok |
| 39–20 % | 0.75 | 0 | ok |
| 19–10 % | 0.4 | 0 | ok |
| 9–1 % | 0 | 10 | dnf (B-6b) |
| 0 % | 0 | 10 | blocked |

- **What the injury risk means in play:** a pair spends about 9 % of its life in the 9–1 % band. For
  a 200 km pair at speed 1 that is about 18 km, or about one training week.
- **Chance of an injury there:** with about 4 sessions in that week, the chance of at least one
  injury is about 1 − 0.9⁴ ≈ **34 %**. That is a real but avoidable risk.
- **Effect on a sensible player:** none. In the simulation they replace below 20 % and had no
  worn-shoe injuries.
- **Effect factors:** I keep the PM's 1 / 0.75 / 0.4 / 0 / 0. They only change races, in B-6b. Their
  effect on race times will be measured there.

## 6. The starter shoes (decided: D8, 22 November 2026)

When this report was written, the starter shoes cost 0, so a worn pair could be renewed for nothing.
The owner chose to give them a price: **20 coins** (B-6c). Runners still start owning them; a worn pair
is replaced for 20.

## 7. No free emergency pair (decided: D11, 22 November 2026)

This section first proposed a free emergency pair with an 8-week guard. The owner dropped it. A runner
who cannot race (no pair above 0 %) and has fewer coins than the cheapest pair can instead watch a
**rewarded ad for +20 coins**, at most 2 coin-granting ads per real day (B-6d; amount and limit in
`src/data/economy.csv`).

## 8. Proposal: Sunday Majors

**What happens now (with wear on):**
- Shoes are checked at **registration** (`no-shoes-equipped`, `shoes-worn-out`).
- At **READY**, the kit is copied into the Major snapshot, as before.
- When the Major's result is added to the career, the **items in that snapshot** wear by the race
  distance.

**The gap:** shoes are not checked again after registration. A player can register with good shoes,
train them down to 0 % during the week, confirm READY and race.

**Proposal:**
- Check the shoes again at **READY**, which already "takes everything again".
- At 0 %, refuse READY with `shoes-worn-out`. The player can replace the pair and confirm READY again
  while its window is open.
- A player not READY in time does not start, which is the existing rule.
- There is no other check at the start: the READY snapshot is what races.
- The band at READY sets the race effect (B-6b).

Not coded: it waits for the owner's approval.

## 9. Finding for B-6b: a race Sunday with worn-out shoes

**The problem:** if the shoes reach 0 % between entering a race and its Sunday, the start is refused
(`shoes-worn-out`). That Sunday cannot be completed with a training session either, because it is
race day. With option A (free starter shoes), the player renews the pair and races. With option B
and no coins, the day stays stuck until the emergency pair arrives.

**Proposal for B-6b:** let the player withdraw a pending entry on race day, or count a start refused
for worn-out shoes as "did not start". The day then becomes a Rest day.
