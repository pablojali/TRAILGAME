# M4 Race System — Validation report (M4.4)

**Date:** 29 October 2026 · **Branch:** `ccr-4899c2c5-ikxanb` (not merged into `main`) ·
**Specification:** Game Design Bible §10 (v1.3) and the approved simulation model
([`RACE_SIMULATION_PROPOSAL.md`](./RACE_SIMULATION_PROPOSAL.md), D1–D10)
**Status:** M4.1–M4.3 implemented and validated below. **M4 is not marked complete**: that needs owner
approval (Bible §10.16), and Part D reports a balance finding the owner should decide on first.

**Checks at the time of this report:** `npm run check` passes: lint, typecheck, **382 tests in 23
files**, build. `node docs/race-simulation/prototype.mjs --check` passes.

---

## Part A — M4.4 test list (Bible §10.13)

| # | Required test | Result | Evidence |
|---|---|---|---|
| 1 | Free Open entry | Pass | `races.test.ts` "enters a free Open race…"; `Races.test.tsx` free entry flow, reload |
| 2 | Standard paid entry at or above the recommended level | Pass | `races.test.ts` "charges the standard fee exactly once"; `Races.test.tsx` 300 → 200 coins with a double click |
| 3 | Early entry below the recommended level | Pass | `races.test.ts` RACE-006 at level 3 (250); `Races.test.tsx` Elite RACE-010 early entry (1,400); access rules in `races.test.ts` (domain) |
| 4 | Insufficient coin balance | Pass | Engine refuses (`insufficient-coins`); UI shows the inactive button and "you need 60 coins more"; balance unchanged |
| 5 | Every finishing-position reward band | Pass | "reward tables — every band and level difference": 4 categories × 5 bands (positions 1, 2, 3, 4, 10, 11, 50) checked against values written out from the spec |
| 6 | Level differences ≤0, 1, 2, ≥3 | Pass | Same table test, with differences −2, 0, 1, 2, 3, 5 for coins and XP; UI explains 40 % and the 0 % "too easy" case |
| 7 | Fractional reward rounding | Pass | Rounded down once, in integer arithmetic. Covered by the table: 210 × 75 % = 157, 70 × 75 % = 52, Elite 2nd XP = 126 (a decimal formula would give 125) |
| 8 | Refreshing or reopening completed results | Pass | Engine: a repeated request fails (`wrong-week`, `already-finished`); UI: reload and reopen leave the save identical; browser: a double tap races once |
| 9 | Different profiles, Fitness/Fatigue states and terrain | Pass | `raceSimulation.test.ts`: 10 reference cases, each profile fastest on its own terrain, monotonic in Fitness, Fatigue and every attribute across all 12 races |
| 10 | Layouts at 360×640 and 412×915, plus other sizes | Pass | Browser QA at 360×640, 412×915, 820×1180 and 1280×800 across 11 screens or states (Part C): no horizontal overflow, no tap target under 44 px, no console or network errors |
| 11 | Training behaviour and formulas unchanged | Pass, with notes | Part B |

## Part B — Training regression

- **Unchanged since before M4** (`git diff f2c7898`): `src/domain/training/*` (sessions, injury,
  weekdays), `src/domain/athlete/levels.ts`, `src/domain/athlete/profiles.ts` and
  `src/game-engine/fitnessDecay.ts`. All pre-M4 training tests pass unchanged.
- **`src/game-engine/training.ts` changed in three ways:**
  1. **State preserved:** completing a day keeps the other state fields (coins, entries,
     equipment). Before, it rebuilt the state from its own fields.
  2. **Shared helper:** the end of `executeCurrentDay` moved into `completeCurrentDay`, which race
     days also use. A one-off comparison of the old and new code over 9,408 executions found no
     difference.
  3. **Race Sunday guard:** on a race Sunday the day cannot be trained or re-planned (`race-day`).
     This is the owner's "races on Sundays only" decision. It only applies in weeks with a race.

## Part C — Acceptance criteria (Bible §10.15)

| Criterion | Status | Where |
|---|---|---|
| Race Hub displays all 12 initial races | Met | `/races`, grouped Open / Trail / Mountain / Elite |
| Race data is separate from presentation code | Met | `src/domain/races/races.ts`, `categories.ts`, `simulationConfig.ts`; screens hold no values |
| Race details show distance, elevation, terrain, recommended level, applicable fee and potential prizes | Met | `/races/:id`, with "Your fee" and the prize table |
| Open entry is free | Met | Free at every level, including below the recommendation (RACE-003) |
| At or above the recommended level: standard fee | Met | Tested |
| Under-level athletes can enter by paying the early fee, including Elite | Met | Tested (RACE-010, RACE-012) |
| Insufficient balance prevents entry with a clear explanation | Met | Shortfall message; the engine refuses too |
| The player confirms before the fee is deducted | Met | Confirmation with fee, balance and balance after; the fee is charged once on confirm |
| Simulation formulas have a written proposal and owner approval before implementation | Met | Proposal revision 2; D1–D10 approved on 29 October 2026 before M4.2 was coded |
| Results show position, time, fee, prize, multiplier, XP and net coin change | Met | Result screen, plus full standings of all 50 runners (owner request) |
| Anti-farming multipliers applied exactly as specified | Met | Table test (Part A, 5–7) |
| 3 or more levels above: 0 XP and 0 prize coins | Met | Tested; the screen says the race is too easy |
| Reopening results does not duplicate charges or rewards | Met | Part A, 8 |
| Explanations only reference factors that affected the calculation | Met | Effects are measured by re-running the simulation; zero effects are never listed (tested); equipment, weather and strategy are not inputs |
| Training formulas and behaviour unchanged | Met, with the notes in Part B | Part B |
| Configuration centralized and documented | Met | Part E |
| Checks and build pass; owner receives a summary and manual test checklist | Met | This report; `README.md` checklist items 11–14 |

Browser QA screens and states:
- Dashboard.
- Race Hub.
- Race Detail with a shortfall.
- The confirmation.
- Entered on Monday.
- A second race blocked.
- Training with the Sunday preview.
- Training on race day.
- The result.
- The result with the full standings.
- Equipment.

## Part D — Balance findings (Bible §10.8: "These values must be tested for balance")

Method: a one-off simulation with the real game code, not committed, over 12–16 weeks. A new
All-rounder enters a race every week and races on Sunday.

**Finding 1 — training values give no sustainable way to gain Fitness.** This predates M4 and is not
caused by races:

| Weekly plan (no races) | Week 1 → week 12 |
|---|---|
| Light: Easy, Rest, Intervals, Rest, Easy, Rest, Rest | Fitness 19 → 8, Fatigue stays 0: each Rest costs 2 Fitness |
| Medium: Easy, Intervals, Rest, Hills, Rest, Long, Rest | Fitness 25 → 35 by week 3, then the injury cycle (Fatigue above 95), Fitness 0–5 from week 7 |
| Default plan | Injured on Tuesday of week 3 (known since the post-M2 changes) |

Rest recovers 8 Fatigue, while a normal training week adds 20–40, and nothing else recovers Fatigue.
Only Fatigue-heavy plans gain Fitness, and those end in injury.

**Finding 2 — races amplify it.** A race adds 10–77 Fatigue and takes the Sunday that is usually a
Rest day:

| Season (16 weeks) | Result |
|---|---|
| Default plan + a race every Sunday | 11 injuries; Fitness 31 → 3; positions 27th → 50th |
| Careful player (rests whenever Fatigue would pass 75) + a race every Sunday | No injuries, but Fitness 31 → 3 and positions 27th → 50th |
| Light plan + a race every Sunday | Fitness slowly rises to 29 while Fatigue climbs 10 a week, until an injury in week 10 |

**Finding 3 — the economy is slow.** With 0 starting coins and mid-to-back-of-field Open finishes,
income is 7–10 coins a week. The first Trail entry (100 coins) takes about 12 weeks.

**Options for the owner and PM** (not implemented; none is in M4 scope without approval):

1. **Training balance** (training change, owner approval needed): stronger Rest recovery (for
   example −15 to −20 Fatigue), a small daily Fatigue recovery scaled by the Recovery attribute, or
   Rest without the −2 Fitness. Any of these would make a "train, rest, race" week sustainable.
2. **Race Fatigue** (M4 value, D3): lower the race Fatigue, for example `round(4 + 0.4 × effort-km)`
   (Open 6–9 instead of 10–14), or let Sunday's race count as the rest it replaces.
3. **Economy:** a small starting balance (the Bible §9.1 proposal was 100) or participation coins.
   This is not allowed as a new currency source without approval (§10.8).

Recommendation: decide option 1 first, because it fixes the root cause in training; then re-run this
check before adjusting races or prizes.

**Owner decision (29 October 2026):** keep the values ("in real life you balance training and
recovery; be smart"), merge M4, and add a Recovery bonus on Rest: −2 more Fatigue for every 3
Recovery points above the profile's start. See `DEVELOPMENT.md`.

## Part E — Configuration (all values in one place each)

| What | File | Values |
|---|---|---|
| Category fees | `src/domain/races/categories.ts` | Open 0/0; Trail 100/250; Mountain 250/600; Elite 600/1,400 (standard/early) |
| Gross prizes | same | Open 100/70/50/25/10; Trail 300/210/150/75/30; Mountain 700/490/350/175/70; Elite 1,500/1,050/750/375/150 |
| Anti-farming multipliers | same | ≤0: 100 %, 1: 75 %, 2: 40 %, ≥3: 0 % (XP and coins) |
| Race XP | same | Base Open 30, Trail 60, Mountain 100, Elite 180 × band 100/70/50/25/10 % |
| Race catalog and technicality | `src/domain/races/races.ts` | 12 races, ids RACE-001…012 |
| Simulation, race Fatigue, explanations | `src/domain/races/simulationConfig.ts` | Approved constants (proposal §B5–B8) |
| Starting coins | `src/domain/economy/coins.ts` | 0 |
| Race day | `src/game-engine/raceSchedule.ts` | Sunday (day 7), one race per week |

## Part F — Assumptions and limitations

- **Sundays only, one race per week** (owner decision). When Sunday is a forced Rest day, the race
  moves to the next Sunday and the entry and fee are kept. That rule is a developer assumption, not
  specified by the owner.
- **Level cap 5** (owner decision): Mountain (recommended 6–7) and Elite (10–12) always use the
  early fee, and their anti-farming reduction never applies.
- **Rivals are unnamed** ("Rival 1–49"): named rivals and rankings are Bible §11, not specified.
- **Equipment** (starter shoes) is cosmetic and does not affect races.
- **Multi-tab play is last-write-wins**, as for training: one tab can overwrite another's progress,
  but a race is never applied twice within a saved state.
- **Results saved before rival times were stored** rebuild the standings from the same
  deterministic formula.

## Part G — Manual test steps for the owner

The `README.md` checklist has the exact steps:

- **Item 11:** Race Hub and free entry.
- **Item 12:** Paid entry and shortfall.
- **Item 13:** Sunday race day, the result, full results, and reloading.
- **Item 14:** Race injury and reduced rewards.
