# M4.2 — Race Simulation Model: Proposal

**Status:** Proposal for owner approval. **Nothing in this document is implemented.** Per Game Design
Bible §10.5 and §10.13, no simulation formula is coded until the owner approves this model.
**Author:** Claude Code (developer), 29 October 2026
**Specification it answers:** Game Design Bible §10 (v1.3); depends on M4.1 (race catalog and entry).

All numbers below were computed with a throwaway reference prototype of exactly these formulas, so
the examples and test cases are consistent with the model. Every constant is configurable and listed
in §5.6.

---

## 1. Summary

- Each race is split into **segments** (runnable, climb, descent) generated from the race's distance,
  elevation gain, category and terrain technicality.
- Each segment's time = its **effort-kilometres** × a base pace × the athlete's **ability** for that
  terrain × **Fitness** × **Fatigue** × a **slowdown** that grows with the distance already covered.
- The athlete races against a **field of 49 rivals** whose times are spread around a reference
  athlete for the race's recommended level. **Position** = 1 + rivals who were faster.
- Optional, small, seeded **day form** (±3–4 %, narrowed by Consistency) — owner decision.
- A race **takes the current training day**: it adds Fatigue, counts as activity, can trigger the
  existing injury rule, and grants race XP and coins (anti-farming applied).
- The result screen explains the **3 factors that changed the time most**, computed from the
  simulation itself; a factor that did not affect the calculation is never shown.

Uses all six attributes, Fitness and Fatigue. Does **not** use equipment (no equipment model),
strategy, weather, nutrition, cutoffs or DNF (out of scope, §10.14).

## 2. Inputs

Taken from the saved career at the moment the player starts the race (after any due Fitness decay):

| Input | Source | Used for |
|---|---|---|
| Speed, Endurance | athlete attributes | runnable ability |
| Climbing, Endurance | athlete attributes | climb ability |
| Technical, Speed | athlete attributes | technical-descent ability |
| Endurance, Recovery | athlete attributes | durability (slowdown over distance) |
| Consistency | athlete attribute | width of day form (only if day form is approved) |
| Fitness (0–100) | athlete | overall pace |
| Fatigue (0–100) | athlete | overall pace |
| Level | derived from XP | anti-farming (§7); nothing in the time model |
| Distance, elevation gain, category | race catalog (M4.1) | segments |
| Technicality 0–3 | **new race field** (§3.2) | descents |

Level does not make an athlete faster by itself (Bible §10.1: results must depend on more than level).

## 3. Course model

### 3.1 Segments

For a race of distance `D` km, elevation gain `G` m and category share `s`:

- Climbing distance = descending distance = `s × D`; runnable distance = `D − 2 s D`.
  Category share `s`: Open 0.20, Trail 0.30, Mountain 0.35, Elite 0.38.
- Number of climbs `n = ceil(G / 600)` (no single climb above 600 m D+).
- Segment order: `runnable, (climb, descent, runnable) × n`, with the runnable distance split evenly
  into `n + 1` parts and the gain split evenly across the `n` climbs. Total descent = total gain
  (courses start and finish at the same altitude).

Effort-kilometres (the ITRA-style "km-effort"): runnable and descent = km; climb = km + gain / 100.

### 3.2 Technicality (new catalog field, proposed values)

The catalog has terrain descriptions but no number. Proposed `technicality` (0 = none, 3 = high),
read from each description:

| Race | 001 | 002 | 003 | 004 | 005 | 006 | 007 | 008 | 009 | 010 | 011 | 012 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Technicality | 0 | 0 | 1 | 1 | 2 | 1 | 2 | 3 | 2 | 3 | 3 | 3 |

### 3.3 Resulting courses

| Race | Climbs | Climb km (each) | Avg. gradient | Runnable km | Effort-km |
|---|---:|---:|---:|---:|---:|
| RACE-001 Forest First Steps | 1 | 1.00 (1.00) | 12.0 % | 3.00 | 6.2 |
| RACE-002 Riverside Trail | 1 | 1.60 (1.60) | 13.8 % | 4.80 | 10.2 |
| RACE-003 Pine Loop Challenge | 1 | 2.00 (2.00) | 17.5 % | 6.00 | 13.5 |
| RACE-004 Ridge Runner | 1 | 3.60 (3.60) | 15.3 % | 4.80 | 17.5 |
| RACE-005 Stone Path Classic | 2 | 4.50 (2.25) | 16.7 % | 6.00 | 22.5 |
| RACE-006 Wildwood Ascent | 2 | 5.40 (2.70) | 17.6 % | 7.20 | 27.5 |
| RACE-007 Summit Quest | 3 | 7.70 (2.57) | 16.9 % | 6.60 | 35.0 |
| RACE-008 Alpine Traverse | 3 | 9.80 (3.27) | 17.3 % | 8.40 | 45.0 |
| RACE-009 Sky Ridge Ultra | 4 | 12.25 (3.06) | 18.0 % | 10.50 | 57.0 |
| RACE-010 High Peaks Challenge | 5 | 15.96 (3.19) | 17.5 % | 10.08 | 70.0 |
| RACE-011 Legends of the Crest | 6 | 20.90 (3.48) | 17.2 % | 13.20 | 91.0 |
| RACE-012 Beyond the Skyline | 8 | 26.60 (3.33) | 18.0 % | 16.80 | 118.0 |

Alternative: hand-authored segment lists per race (more character, 12 lists to maintain). The
generated model can be replaced by authored data later without changing the formulas.

## 4. Abilities

Terrain abilities are weighted averages of attributes (attribute scale 1–100):

- **Runnable** `R = 0.75 Speed + 0.25 Endurance`
- **Climb** `C = 0.70 Climbing + 0.30 Endurance`
- **Technical descent** `T = 0.70 Technical + 0.30 Speed`
- **Durability** `U = 0.60 Endurance + 0.40 Recovery`

Ability used on each segment:

- Runnable segment: `R`.
- Climb: `w C + (1 − w) R`, with `w = min(1, gradient / 0.20)` — gentle climbs are partly runnable.
- Descent: `(t / 3) T + (1 − t / 3) R`, with `t` = technicality — non-technical descents are run.

## 5. Time model

### 5.1 Segment time

```
segmentMinutes = effortKm × BASE_PACE × abilityFactor × technicalFactor × slowdown × fitnessFactor × fatigueFactor × (1 + dayForm)
```

- `BASE_PACE` = 6.0 min per effort-km (an athlete with ability 20, Fitness 50, Fatigue 0, fresh).
- `abilityFactor = (20 / ability) ^ 0.35` — diminishing returns: ability 12 → 1.20, 16 → 1.08,
  20 → 1.00, 28 → 0.89, 100 → 0.57. Fair in today's real range (12–28) and bounded up to 100.
- `technicalFactor` (descents only) `= 1 + 0.12 × t × (1 − Technical / 100)`; 1 elsewhere.
- `slowdown = 1 + 0.25 × (effortKmBefore / 50) × (20 / U)` — grows with the effort-km already
  covered before the segment; better durability slows down less. Matters most in ultras.
- `fitnessFactor = 1 + 0.2 × (50 − Fitness) / 50` — Fitness 20 → 1.12, 50 → 1.00, 95 → 0.82.
- `fatigueFactor = 1 + 0.3 × Fatigue / 100` — Fatigue 0 → 1.00, 50 → 1.15, 100 → 1.30.

Finishing time = sum of segment times, rounded to the nearest second.

### 5.2 Why these shapes

- Fitness and Fatigue are the values the player manages week to week, so they move results the most
  (Fitness 20 → 95 is about 27 % faster).
- Attributes are small today (12–20 at start, at most +8 points by level 5), so the ability curve is
  steep in that range: profiles get distinct terrain (§9.2) without making 100-point attributes absurd.
- Fatigue matters: in Ridge Runner, Fatigue 80 instead of 0 drops an All-rounder from 13th to 39th.

### 5.3 Field and position

- **Field size 50**: the athlete and 49 rivals (configurable).
- **Reference athlete** for a race with recommended level `L`: every attribute `16 + (L − 1) / 3`,
  Fitness `min(90, 25 + 12 (L − 1))`, Fatigue 20, no day form. Its time is `T_ref`.
- Rival `i` (0–48): `T_ref × (0.85 + 0.40 × ((i + 0.5) / 49) ^ 1.3)` — winner 15 % faster than the
  reference, a slower tail up to +25 %.
- **Position** = 1 + number of rivals strictly faster than the athlete (a tie goes to the athlete).
- Rivals are fixed per race: no names or rankings (Bible §11 is out of scope).

### 5.4 Day form (owner decision — see §11, D1)

- **Option A — fully deterministic.** No day form; Consistency is not used yet.
- **Option B — seeded day form (recommended).** `dayForm = (2u − 1) × 0.04 × (1 − Consistency / 100)`
  where `u` in [0, 1) comes from a seeded generator (mulberry32) whose seed is a hash of
  `raceId | entryId | enteredAt`. Consistency 16 → ±3.4 %. The value is saved with the result and
  shown on the result screen, so the same saved entry always gives the same result and a reload
  cannot re-roll it.

### 5.5 Explanation of the result

For each factor below, the simulation is re-run with only that input set to the race's reference
athlete value; the difference in time is the factor's effect:

Fitness · Fatigue · runnable ability (Speed/Endurance) · climb ability (Climbing/Endurance) ·
descent ability (Technical/Speed) · durability (Endurance/Recovery) · day form (if approved).

The result screen lists the three largest effects (ignoring any under 0.5 % of the time), signed, for
example "Fitness 72 (field 49): 9:12 faster". Equipment, strategy, weather and nutrition never appear
because they are not in the calculation.

### 5.6 Configuration (all values in one module, none in screens)

| Constant | Value | | Constant | Value |
|---|---:|---|---|---:|
| Category share Open / Trail / Mountain / Elite | 0.20 / 0.30 / 0.35 / 0.38 | | Base pace | 6.0 min/effort-km |
| Max gain per climb | 600 m | | Ability reference / exponent | 20 / 0.35 |
| Climb weight full at gradient | 20 % | | Technical penalty per level | 0.12 |
| Slowdown rate / reference | 0.25 / 50 effort-km | | Fitness slope | 0.2 |
| Fatigue slope | 0.3 | | Field size | 50 |
| Rival spread | 0.85 + 0.40 q^1.3 | | Day form max (option B) | 4 % |
| Reference Fitness | min(90, 25 + 12 (L − 1)) | | Reference attributes | 16 + (L − 1) / 3 |

## 6. Race day (owner decision — see §11, D2–D4)

A race needs a cost in time, otherwise free Open races could be repeated without limit for coins.
Proposal:

- **The race takes the current training day** (one race per day). It replaces that day's planned
  session; the day is then completed and the week moves on as usual. A race cannot start during
  forced Rest. The pending entry from M4.1 can be raced on any later day.
- **Fatigue:** `+ round(6 + 0.6 × effortKm)`, capped at 100: Open 10–14, Trail 17–23,
  Mountain 27–40, Elite 48–77.
- **Injury:** the existing rule (Bible §4.7) applies after the race: if Fatigue ends above 95, the
  athlete is injured (−15 Fitness, 5 forced Rest days). The result still counts. The screen warns
  before the start, as Training does.
- **Fitness:** no change from the race itself. It counts as activity: it resets the Fitness decay
  reference, like any non-rest session.
- **No training XP or attribute change**; race XP only (§7).

Training formulas are not changed. Integration does need the training engine to accept a raced day
(a day outcome linked to the race entry). Per §10.5 this is reported here for approval.

## 7. Rewards (M4.3)

- **Coins:** gross prize for the position band (Bible §10.8) × coin multiplier (Bible §10.9),
  rounded down. Net coin change = coins awarded − entry fee (already paid at entry).
- **XP — base values proposed (Bible §10.10 requires approval):** category base × band factor,
  × XP multiplier, rounded down.
  - Category base: Open 30, Trail 60, Mountain 100, Elite 180.
  - Band factor (same ratios as the coin prizes): 1st 1.00, 2nd 0.70, 3rd 0.50, 4th–10th 0.25,
    11th or lower 0.10.

| XP | 1st | 2nd | 3rd | 4th–10th | 11th+ |
|---|---:|---:|---:|---:|---:|
| Open | 30 | 21 | 15 | 7 | 3 |
| Trail | 60 | 42 | 30 | 15 | 6 |
| Mountain | 100 | 70 | 50 | 25 | 10 |
| Elite | 180 | 126 | 90 | 45 | 18 |

  For scale: the default training week gives 68 XP, and a Long run day gives 18 XP.
- **Anti-farming** uses the athlete's level when the race starts; 3 or more levels above the
  recommendation gives 0 XP and 0 prize coins, and the screen says the race was too easy.
- The race XP goes through the existing XP field, so levels and attribute points follow the
  existing progression rules unchanged.

## 8. Persistence and integrity

- Starting a race turns the `pending` entry into `finished` and stores the whole result:
  - Time, position and field size, band.
  - Gross prize, multipliers, coins and XP awarded, net coin change.
  - Day form (if approved), the explanation factors.
  - A snapshot of the inputs: attributes, Fitness, Fatigue, level.
- Rewards are applied in the same state change, once. Reopening or reloading reads the stored result;
  it never re-simulates or re-awards. Still schema v2 (additive fields).

## 9. Balance check (prototype results, no day form)

### 9.1 Positions out of 50

| Race | New career (All-rounder, F20, Fa0) | F50, Fa30 | Best possible today (level 5, F95, Fa0, +8 points) |
|---|---:|---:|---:|
| RACE-001 | 19 | 16 | 1 |
| RACE-004 | 32 | 29 | 1 |
| RACE-006 | 39 | 35 | 1 |
| RACE-007 | 50 | 50 | 10–12 |
| RACE-009 | 50 | 50 | 15 |
| RACE-012 | 50 | 50 | 19–22 |

A new runner finishes mid-field in Open races. A well-managed athlete wins Open and Trail races.
Mountain and Elite fields stay out of reach at today's level cap (5) and with no attribute growth from
training: those races are long-term goals until progression and equipment grow.

### 9.2 Profiles (Fitness 60, Fatigue 20)

| Race | Climber | Sprinter | All-rounder | Endurance |
|---|---:|---:|---:|---:|
| RACE-001 (flat-ish 5 km) | 11 | **3** | 6 | 7 |
| RACE-004 (12 km, 550 m) | 21 | 22 | **21** | 21 |
| RACE-007 (22 km, 1,300 m, technical) | **41** | 45 | 42 | 42 |
| RACE-009 (35 km ultra) | 45 | 50 | 46 | **45** |
| RACE-012 (70 km, 4,800 m) | 18:31:01 | 19:52:39 | 18:43:05 | **18:13:40** |

Each profile has terrain where it is best. The Sprinter wins fast short races, the Climber steep
technical ones, and Endurance the long ultras. The All-rounder is never far behind.

## 10. Test cases (to become automated tests, no day form)

| # | Athlete | Race | Expected time | Expected position |
|---|---|---|---:|---:|
| 1 | All-rounder, F20, Fa0 (new career) | RACE-001 | 0:45:41 | 19 |
| 2 | All-rounder, F80, Fa10 | RACE-001 | 0:36:58 | 1 |
| 3 | Sprinter, F60, Fa20 | RACE-001 | 0:40:49 | 3 |
| 4 | Climber, F60, Fa20 | RACE-001 | 0:42:46 | 11 |
| 5 | All-rounder, F60, Fa0 | RACE-004 | 1:55:17 | 13 |
| 6 | All-rounder, F60, Fa80 | RACE-004 | 2:22:57 | 39 |
| 7 | Climber, F60, Fa20 | RACE-007 | 4:22:26 | 41 |
| 8 | Sprinter, F60, Fa20 | RACE-007 | 4:32:16 | 45 |
| 9 | Endurance, F60, Fa20 | RACE-012 | 18:13:40 | 50 |
| 10 | Climber, F60, Fa20 | RACE-012 | 18:31:01 | 50 |

Plus property tests:

- Same inputs give the same result.
- More Fitness never gives a slower time; more Fatigue never gives a faster one.
- Raising any attribute never gives a slower time.
- Every position band and level difference (≤0, 1, 2, ≥3) maps to the right rewards, rounded down.
- A reload or reopened result changes nothing.
- Training values and behaviour are unchanged (existing tests).
- With option B: the same entry gives the same day form, and day form stays within ±4 % × (1 − Consistency/100).

## 11. Decisions requested from the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Day form: A (fully deterministic) or B (seeded, ±3–4 %, narrowed by Consistency) | **B** |
| D2 | A race takes the current training day (one race per day) | **Yes** |
| D3 | Race Fatigue `round(6 + 0.6 × effortKm)`, Fitness change 0, counts as activity for decay | **Yes** |
| D4 | The injury rule (Fatigue above 95) applies after a race; the result still counts | **Yes** |
| D5 | Race XP base values (§7 table) | **Yes** |
| D6 | Technicality values per race (§3.2) | **Yes** |
| D7 | Field size 50 and rival spread (§5.3) | **Yes** |
| D8 | The formulas and constants of §4–§5 | **Yes**, tuned only with owner approval |

After approval, M4.2 implements the simulation as a pure, tested module. M4.3 then adds race day,
results, rewards and the result screen.

## 12. Not included

Strategy and pacing choices, weather, nutrition, cutoffs and DNF, equipment effects, named rivals or
rankings, seasons, attribute gains from racing, any change to training formulas, and backend
persistence (M7).
