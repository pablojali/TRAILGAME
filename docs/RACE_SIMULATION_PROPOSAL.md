# M4.2 — Race Simulation Model (revision 2, approved)

**Status:** **Approved by the owner on 29 October 2026: D1–D10 as recommended** (B for D1, (b) for
D4, V1 for D9). Implemented as the pure simulation module of M4.2 (`src/game-engine/raceSimulation.ts`,
constants in `src/domain/races/simulationConfig.ts`). Race day, rewards and the result screen (B7,
B8) are M4.3 and not implemented yet.

**Approved values differ from the tables below.** With V1 (D9) now part of the formula, times and
positions change slightly. Example: case 6 of A1 becomes 2:25:12 and 40th instead of 2:22:57 and
39th. Part A records the review as it was. The **current reference values are in
[`results.md`](./race-simulation/results.md)**: §3 compares every test case with its pre-V1 value.
**Author:** Claude Code (developer). Revision 1: 29 October 2026. Revision 2: 29 October 2026, after
the PM review "M4.2 review — changes required before owner approval".

**Supporting calculations:**

- [`docs/race-simulation/prototype.mjs`](./race-simulation/prototype.mjs): a self-contained,
  dependency-free reference script implementing every formula below.
- [`docs/race-simulation/results.md`](./race-simulation/results.md): its full output. Every number in
  this document comes from there.

Reproduce with:

```bash
node docs/race-simulation/prototype.mjs --check > docs/race-simulation/results.md
```

`--check` exits with an error if any verification fails; it currently passes. Inside the repository
(Node 22.18+), the script also checks that its copy of the catalog, fees, prizes, multipliers,
profiles and level thresholds matches `src/`.

---

## Part A — Verified findings

### A1. Reproducibility (review item 1)

**Athletes used.** Starting attributes are exactly those of `src/domain/athlete/profiles.ts`:

| Profile | Endurance | Climbing | Speed | Technical | Recovery | Consistency |
|---|---:|---:|---:|---:|---:|---:|
| Climber | 16 | 20 | 13 | 18 | 14 | 15 |
| Sprinter | 13 | 12 | 20 | 17 | 16 | 18 |
| All-rounder | 16 | 16 | 16 | 16 | 16 | 16 |
| Endurance | 20 | 15 | 14 | 13 | 18 | 16 |

"Best possible today" means level 5 (8 attribute points), Fitness 95 and Fatigue 0:

- **Best Climber:** Climber + 8 Climbing (Climbing 28).
- **Best Endurance:** Endurance + 4 Endurance + 4 Recovery (Endurance 24, Recovery 22).
- **Best Sprinter:** Sprinter + 8 Speed (Speed 28).

**Test cases.** All 10 cases from revision 1 reproduce exactly (`results.md` §3): same time to the
second, same position.

**Discrepancies between revision 1 tables**, now resolved:

1. The test table (Fitness 60, Fatigue 20 and other fixed states) and the balance tables (new career
   F20/Fa0, F50/Fa30, best possible) use **different athletes**, so their positions differ by design.
   Revision 2 labels every athlete explicitly.
2. Revision 1 §9.1 merged two athletes into ranges ("10–12", "19–22") and first printed "9–12" for
   RACE-007, a transcription error. Revision 2 shows one column per athlete: RACE-007 is 10 (best
   Climber), 12 (best Endurance), 14 (best Sprinter).
3. Revision 1 §9.2 showed times for RACE-012 but positions for the other races. Revision 2 shows both.
4. Earlier chat messages quoted intermediate numbers (for example "Climber 3:53 vs Sprinter 4:09")
   from versions of the prototype before the constants were final. They are not part of any
   proposal and should be ignored.

**Prototype versus document.** Revision 1's prototype used fractional segment lengths, and the
document did not say how lengths are rounded. Revision 2 specifies whole metres (A2) and the
prototype implements that. Every formula in Part B maps one-to-one to a function in
`prototype.mjs` (table B9). The 10 test results did not change after rounding.

### A2. Course generation (review item 2)

All 12 courses were checked (`results.md` §2):

- The segment count is `3 × climbs + 1`.
- Every segment is longer than 0 m.
- Lengths sum exactly to the catalog distance, ascent sums exactly to the catalog elevation gain, and
  descent equals ascent.
- The steepest average segment gradient is 18.0 %.
- Effort-km equal `distance + gain / 100` exactly.

Rounding works in whole metres. Totals are split into parts that differ by at most 1 m, with the
remainder going to the first parts. For example, RACE-007 has climbs of 2,567 / 2,567 / 2,566 m with
434 / 433 / 433 m of gain.

Edge cases tested, all behaving as specified:

- 0 m gain gives one runnable segment.
- Exactly 600 m gives one climb; 601 m gives two.
- 1 m of gain over 1 km works.
- Fractional distances (5.5 km, 7.777 km) work.
- A course steeper than 40 % average is rejected as invalid data.
- Zero distance is rejected.

### A3. Balance and sensitivity (review item 3)

The baseline is an All-rounder with every attribute at 16, Fitness 50 and Fatigue 20. One input
changes at a time, in four races: short RACE-001, medium RACE-004, medium technical RACE-007 and
ultra RACE-012. Full table: `results.md` §5. Main points:

| Input change | RACE-001 | RACE-004 | RACE-007 | RACE-012 |
|---|---:|---:|---:|---:|
| Fitness 50 → 20 / 80 | +12.0 % / −12.0 % | same | same | same |
| Fatigue 20 → 0 / 80 | −5.7 % / +17.0 % | same | same | same |
| +8 Endurance | −4.5 % | −4.8 % | −5.6 % | −9.1 % |
| +8 Climbing | −2.3 % | −4.0 % | −4.8 % | −5.3 % |
| +8 Speed | −8.5 % | −6.3 % | −4.8 % | −3.5 % |
| +8 Technical | 0.0 % | −1.1 % | −2.2 % | −3.4 % |
| +8 Recovery | −0.2 % | −0.6 % | −1.4 % | −4.3 % |
| +8 Consistency | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| +10 Fitness | −4.0 % | −4.0 % | −4.0 % | −4.0 % |

Findings:

- **Fitness and Fatigue** act the same way in every race (they multiply the whole time). Fitness is
  the strongest single lever (±20 % over its range), as intended: it is what the player manages each
  week. Spent on the attribute that suits the race, the whole level-5 attribute budget (+8 points)
  is worth about 10–23 Fitness: +8 Climbing in RACE-004 equals +10 Fitness, and +8 Endurance in
  RACE-012 equals about +23.
- **No attribute dominates everywhere.** The weight of each attribute moves with the course
  (`results.md` §5.2):
  - Speed falls from 57 % (RACE-001) to 13 % (RACE-012).
  - Endurance rises from 28 % to 36 %.
  - Climbing ranges from 14 % to 27 %.
  - Technical ranges from 0 % on non-technical courses to 17 %.
  - Recovery ranges from 2 % to 17 %.

  Speed is the strongest attribute in short races (+8 Speed is −8.5 % in RACE-001), but it is
  bounded by the ability curve and weak in ultras.
- **Consistency has no effect** without day form (option A). Even with day form (option B) it only
  narrows the variance, with an average effect of zero. Its points are wasted. The Sprinter has the
  most of them (18), so it has 78 useful points against 80–81 for the other profiles. This is a real
  bias; see D9.
- **Extreme values stay monotonic and bounded.** For every race, profile and value from 1 to 100,
  more Fitness or any attribute never makes the runner slower, and more Fatigue never makes them
  faster (`results.md` §8).

**Why the profiles are nearly tied in RACE-004** (spread 1.0 %, positions 21–22). The course's
attribute weights are Endurance 28 %, Climbing 24 %, Speed 39 %, Technical 6 % and Recovery 4 %. This
mixed course weights the attributes the profiles trade off against each other almost evenly. Each
profile's weighted ability comes to about 16, because every profile has the same 96 points.

The ability curve `(20 / ability) ^ 0.35` is convex, so in a mixed course uneven attributes cost a
little more than they gain. That is why the All-rounder edges ahead there. This is the intended
identity of a mixed "Trail" course, not a defect: it is the course where profile matters least and
condition matters most.

**Profiles stay differentiated** (Fitness 60, Fatigue 20; `results.md` §4.2). Each profile is
fastest on its own terrain:

| Profile | Fastest in |
|---|---|
| Sprinter | RACE-001, RACE-002 (short and fast) |
| All-rounder | RACE-003, RACE-004 (mixed) |
| Climber | RACE-005, RACE-007, RACE-008, RACE-010 (steep, technical) |
| Endurance | RACE-006, RACE-009, RACE-011, RACE-012 (long) |

The gap between the fastest and slowest profile grows from 1.0 % (RACE-004) to 9.1 % (RACE-012).

**Progression check** (`results.md` §4.1):

- A new career finishes 19th/50 in the Open races.
- The best athletes reachable today win Open and Trail races, finish 9th–21st in Mountain races and
  18th–32nd in Elite races.
- Mountain and Elite remain long-term goals while levels stop at 5 and training does not raise
  attributes.

### A4. Race-day integration — existing code paths (review item 4)

| Concern | Where it happens today |
|---|---|
| Rejecting stale or repeated requests | `checkDay`, `src/game-engine/training.ts:90–95` (week and day must be the current ones) |
| Computing a day's effects | `previewSession`, `training.ts:61–78`: fatigue clamped to 0–100 at :64; injury check (Fatigue after > 95, non-rest) at :65–72 |
| Completing the day | `executeCurrentDay`, `training.ts:119–171`: applies XP, Fitness and Fatigue (:130–135) |
| Forced Rest bookkeeping | `training.ts:138` (a new injury sets 5 days; otherwise one is used up) and `forceRest` :81–88 |
| Advancing the calendar | `training.ts:140–152`: next day, or a new week via `createWeek` (`gameState.ts`) after day 7 |
| Resetting Fitness decay | `training.ts:156`: any non-rest day sets the decay reference to `now` |
| Level-up | Derived from XP: `getLevel` (`src/domain/athlete/levels.ts`), `training.ts:154–155`, :166 |
| Decay before any action | `currentState`, `src/app/game/GameProvider.tsx:64–75` (uses `applyFitnessDecay`, `fitnessDecay.ts:21–41`) |
| One state change, one save | `commit`, `GameProvider.tsx:54–61`; `executeDay`, :132–141 |
| Double-tap guard (UI) | `COMPLETE_COOLDOWN_MS = 700`, `src/features/training/TrainingScreen.tsx:32`, :53 |
| Save validation of days | `isOutcome` / `isTrainingDay`, `src/repositories/gameRepository.ts:79–92`; forced-rest check :174–175 |

**What a race must not do:** run the day's planned session as well. Today `executeCurrentDay`
always applies the planned session (`previewSession(state, day.session)`, :128). A race therefore
needs its own path; see B7.

### A5. Explanations (review item 5)

- The effects of single inputs do **not** add up, because the model multiplies factors. In the two
  worked examples (`results.md` §6), the single effects sum to −5:07 against a real gap of −4:33,
  and to +2:11 against a real gap of +2:37. B6 is designed around this.
- Attributes are shared between abilities: Endurance feeds runnable, climb and durability. Measuring
  per **input** (per attribute) instead of per ability avoids double counting.

### A6. Rewards and anti-farming (review item 6)

All 80 coin values and 80 XP values were computed and checked (`results.md` §7): every category,
band and multiplier.

**Rounding trap found and avoided.** With decimal factors, Elite 2nd place XP is
`Math.floor(180 × 0.7)` = 125 in JavaScript, because 180 × 0.7 = 125.99999999999999. The correct
value is 126. Revision 2 stores multipliers and band factors as **whole percentages** and rounds once,
with integers only.

Also verified:

- Band boundaries: 1, 2, 3, 4–10, 11+.
- Level-difference multipliers: ≤0 → 100 %, 1 → 75 %, 2 → 40 %, ≥3 → 0 %.
- Fee handling: the fee was paid once at entry; net = coins awarded − fee paid; never refunded.
  Worked examples include a negative net (−530 coins for 30th in Summit Quest after a 600-coin
  early entry).

**Level snapshot.** M4.1 stores `levelAtEntry` (used for the fee). Revision 2 adds `levelAtStart`,
taken when the race starts, before race XP is added. Anti-farming uses `levelAtStart`. A runner
who entered early and levelled up before racing pays the early fee they agreed to but has rewards
judged at their real level on race day.

**XP follows the existing rules.** Race XP is added to `athlete.xp` like training XP. Level and
attribute points stay derived from XP (`getLevel`, `getEarnedAttributePoints`), unchanged. Past
level 5, XP keeps accumulating, as it does today.

---

## Part B — Revised specification (pending approval)

### B1. Inputs

The inputs are taken when the race starts, after due Fitness decay:

- All six attributes, Fitness, Fatigue, and the level (for rewards only).
- The race's distance, elevation gain, category and technicality.

Level never makes the runner faster by itself. Equipment, strategy, weather, nutrition, cutoffs and
DNF are not inputs.

### B2. Course (`generateCourse`)

- Distance `D_m = round(km × 1000)` in whole metres. Gain `G` in whole metres.
- If `G = 0`: one runnable segment.
- Otherwise, use `n = ceil(G / 600)` climbs and a climb share `s` of 0.20 (Open), 0.30 (Trail),
  0.35 (Mountain) or 0.38 (Elite).
- Climb total = descent total = `round(s × D_m)`. Runnable total = `D_m − 2 × climb total`.
- Order: `runnable, (climb, descent, runnable) × n`.
- Splits are whole metres; remainders go to the first parts. Gains are split the same way, and each
  descent loses its climb's gain.
- Validity: every length is above 0 and no segment averages more than 40 %. Otherwise the race is
  invalid catalog data.
- Effort-km of a segment: `length_km + gain / 100`.
- Technicality (new catalog field, 0–3; D6):

| Race | 001 | 002 | 003 | 004 | 005 | 006 | 007 | 008 | 009 | 010 | 011 | 012 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Technicality | 0 | 0 | 1 | 1 | 2 | 1 | 2 | 3 | 2 | 3 | 3 | 3 |

### B3. Abilities (`abilities`, `segmentAbility`)

- Runnable: `R = 0.75 Speed + 0.25 Endurance`.
- Climb: `C = 0.70 Climbing + 0.30 Endurance`.
- Technical descent: `T = 0.70 Technical + 0.30 Speed`.
- Durability: `U = 0.60 Endurance + 0.40 Recovery`.
- Segment ability:
  - Runnable segment: `R`.
  - Climb: `w C + (1 − w) R`, with `w = min(1, gradient / 0.20)`.
  - Descent: `(t/3) T + (1 − t/3) R`.

### B4. Time (`raceSeconds`)

```
segmentMinutes = effortKm × 6.0 × (20 / ability)^0.35 × technicalFactor × slowdown
                 × fitnessFactor × fatigueFactor × (1 + dayForm)
technicalFactor = 1 + 0.12 × t × (1 − Technical / 100)            (descents; 1 elsewhere)
slowdown        = 1 + 0.25 × (effortKmBefore / 50) × (20 / U)
fitnessFactor   = 1 + 0.2 × (50 − Fitness) / 50
fatigueFactor   = 1 + 0.3 × Fatigue / 100                          (see D9 for variant V1)
```

The finishing time is the sum of the segment times, computed in double precision and rounded once to
whole seconds. The time is stored with the result, so it is never recomputed.

### B5. Field and position (`referenceAthlete`, `rivalSeconds`, `simulate`)

- **Reference athlete** for recommended level `L`: every attribute `16 + (L − 1)/3`, Fitness
  `min(90, 25 + 12(L − 1))`, Fatigue 20, no day form. It finishes **24th of 50** in every race: a
  mid-field runner.
- **Rivals:** 49, at `T_ref × (0.85 + 0.40 × ((i + 0.5)/49)^1.3)` for `i = 0…48`, rounded to whole
  seconds.
- **Position** = 1 + rivals strictly faster than the athlete. A tie goes to the athlete.

### B6. Explanation (`explain`)

- **Reference:** the field reference athlete (B5), shown to the player as "a typical runner in this
  field".
- **Factors:** one per input — Fitness, Fatigue, each of the six attributes, and day form (if
  approved). Abilities are never shown as factors, so a shared attribute is counted once, with all
  of its uses together.
- **Effect:** re-run the simulation with only that input set to the reference value. The effect is
  the actual time minus that time (negative = helped).
- **Shown:** the total gap to the typical runner, then the three largest effects by size, each at
  least 0.5 % of the time. Helping and hurting factors are both eligible. Wording:

  "**4:33 faster than a typical runner in this field.** Biggest influences, each measured on its own
  (they don't add up): Fitness 70 (typical 49) — 11:04 faster; Speed 13 (typical 17) — 4:14 slower;
  Fatigue 30 (typical 20) — 3:20 slower."

- Reference values are shown rounded (16.67 → 17); the calculation uses exact values.
- A factor with no effect is never shown: Technical on non-technical courses, and Consistency under
  option A. Equipment and other non-inputs never appear. No sum and no percentage breakdown is shown.

### B7. Race day — smallest safe integration (proposal only; D2–D4)

1. **Refactor without behaviour change.** Move the shared tail of `executeCurrentDay` (forced-rest
   count :138, calendar advance :140–152, decay reference :156) into a private helper
   `advanceDay(state, ref, outcome, resetsDecay, now)`. `executeCurrentDay` becomes
   `previewSession` + `advanceDay`. All existing training tests must pass unchanged, plus a new test
   that compares outputs before and after the refactor on a set of states.
2. **New `raceCurrentDay(state, ref, entryId, now)`** in `src/game-engine/races.ts`.
   - **Guards:** `checkDay(ref)`; forced Rest → `forced-rest`; the entry exists and is `pending`;
     the race exists.
   - **Then:**
     - Snapshot the inputs and `levelAtStart`.
     - Simulate the race and compute the rewards (B8).
     - Build the day outcome:
       - Fatigue: `clamp(Fatigue + race fatigue) − Fatigue`, with the injury check and threshold of
         `previewSession`.
       - Fitness: 0, or the injury loss.
       - XP: per D4.
       - `raceEntryId`: the entry raced.
     - Call `advanceDay(…, resetsDecay = true)`.
     - Add the awarded coins.
     - Mark the entry `finished` with its stored result.

     All of this happens in **one** returned state.
3. **The planned session never runs.** `raceCurrentDay` never calls `previewSession(day.session)`.
   The day keeps its planned `session` for history, but its outcome is the race outcome
   (`raceEntryId`), and the UI shows "Race: name". No `'race'` session type is added, which keeps
   `planSession`, the selector and the save validation unchanged.
4. **Provider:** `raceDay(ref, entryId)` mirrors `executeDay`: decay first (`currentState`), then the
   engine, then one `commit` (one save).
5. **Saves (still schema v2):**
   - A day outcome may carry `raceEntryId`, which must name a `finished` entry.
   - A finished entry must carry a complete, valid result.
   - Older saves have neither and load unchanged.
6. **Applying results and rewards only once:**
   - **Entry status:** only a `pending` entry can be raced, and the same state change makes it
     `finished`.
   - **Day guard:** a second request for the same day fails `checkDay` (`day-completed`).
   - **UI:** the start button gets the same 700 ms cooldown as Training.
   - **Reopening a result:** it reads the stored result and never re-simulates or re-awards.
   - **Multi-tab:** last-write-wins remains the documented limitation. Each saved state still
     contains the race applied at most once.

### B8. Rewards (`rewards`)

- **Coins:** `floor(grossPrize × multiplierPct / 100)`.
- **XP:** `floor(xpBase × bandPct × multiplierPct / 10000)`.
  - `xpBase` (D5): Open 30, Trail 60, Mountain 100, Elite 180.
  - `bandPct`: 100, 70, 50, 25, 10.
- **Multiplier** from `levelAtStart − recommendedLevel`.
- **Net:** `coinsAwarded − feePaid` (the fee was paid at entry, once).
- **Race Fatigue** (D3): `round(6 + 0.6 × effort-km)`, from +10 (RACE-001) to +77 (RACE-012).

### B9. Formula-to-code map (prototype)

| Section | Function in `prototype.mjs` |
|---|---|
| B2 Course and rounding | `split`, `generateCourse`, `effortKm` |
| B3 Abilities | `abilities`, `segmentAbility` |
| B4 Time | `raceSeconds` |
| B5 Field and position | `referenceAthlete`, `rivalSeconds`, `simulate` |
| B6 Explanation | `explain` |
| Day form (D1) | `fnv1a`, `mulberry32`, `dayForm` (production: `getDayForm`) |
| B8 Rewards | `getLevel`, `band`, `multiplierPct`, `rewards`, `raceFatigueGain` |
| D9 Variant V1 (approved) | inside `raceSeconds` (`C.consistencySoftensFatigue`) |

All constants are in the single object `C`. The production implementation would keep them in one
configuration module.

---

## Part C — Proposed changes since revision 1

1. Whole-metre course generation with an exact remainder rule, plus validity rules (B2).
2. Integer reward arithmetic in whole percentages (fixes the Elite 2nd place XP case) (B8).
3. `levelAtStart` snapshot for anti-farming (A6).
4. Per-input explanations against the field reference, labelled as non-additive (B6).
5. A concrete, minimal race-day integration plan (B7). Not implemented.
6. A variant V1 for Consistency (D9). Not in the baseline numbers.

## Part D — Unresolved questions

- **U1 — Consistency** (D9): with option A it does nothing, and with option B it only changes
  variance. Accept that, or adopt V1?
- **U2 — Injury on race day** (D4): the existing rule gives no XP for an injured session. Should a
  race follow it exactly, or keep the race XP?
- **U3 — Mountain and Elite reach:** unreachable at today's level cap and with no attribute growth
  from training. This depends on future progression decisions, not on M4.2.
- **U4 — Multi-tab play:** last-write-wins remains, as for training. Accept for M4, as today?

## Part E — Decision log (approved by the owner on 29 October 2026, as recommended)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Day form: A (none, fully deterministic) or B (seeded ±4 % × (1 − Consistency/100), saved with the result) | **B** — gives Consistency a role and makes repeat races feel alive while staying reproducible |
| D2 | A race takes the current training day (one per day; not during forced Rest) | **Approve** — the only built-in limit on repeating free Open races for coins |
| D3 | Race Fatigue `round(6 + 0.6 × effort-km)`; no Fitness change; counts as activity for decay | **Approve** |
| D4 | Injury after a race: (a) keep race XP, or (b) follow the existing rule (no XP, −15 Fitness, 5 forced Rest days). Result and prize coins stand in both | **(b)** — consistent with the approved injury rule |
| D5 | Race XP base: Open 30, Trail 60, Mountain 100, Elite 180 × band % × multiplier, rounded down | **Approve** |
| D6 | Technicality per race (B2 table) | **Approve** |
| D7 | Field of 50, rival spread, reference athlete (B5) | **Approve** |
| D8 | Formulas and constants of B2–B5, changed only with owner approval | **Approve** |
| D9 | Consistency: keep as day-form width only, or add variant V1 (Fatigue in the formula × (20/Consistency)^0.35) | **V1** — removes the Sprinter's 18 wasted points at a modest strength (+8 Consistency ≈ −0.8 % at Fatigue 20, −2.2 % at Fatigue 60) |
| D10 | Per-input explanations against the typical runner, top 3, non-additive wording (B6) | **Approve** |

If the owner approves, M4.2 implements the pure simulation module with these tests:

- `results.md` §3 (exact times and positions).
- The property checks of §8.
- The course checks of §2.

M4.3 then adds race day (B7), rewards and the result screen. Training formulas stay unchanged
throughout.

## Part F — Not included

Strategy and pacing choices, weather, nutrition, cutoffs and DNF, equipment effects, named rivals or
rankings, seasons, attribute gains from racing, any change to training formulas, and backend
persistence (M7).
