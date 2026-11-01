# Race Engine & Strategy V1 — findings and proposal (1 November 2026)

Step 1 of the "Race Engine & Strategy (V1)" specification: what exists today, the conflicts with
the specification, and a concrete proposal for every value the specification leaves open.

**Owner decisions (1 November 2026):** everything below accepted as proposed ("Acepto todo").
Gels and cereal bars are used up by a race and sold in packs of 3 for 10 coins each (no level).
Segments resolve instantly; overall position only; Energy = 100 − in-race fatigue. Implemented as
described in `DEVELOPMENT.md` ("Race Engine & Strategy V1").

## 1. What exists today

| Area | Current implementation |
|---|---|
| Race catalog | 12 races (`src/domain/races/races.ts`): distance, total D+, terrain text, recommended level, technicality 0–3. No aid stations, no D− (courses return to the start: D− = D+), no per-section data. |
| Course | `generateCourse` (`src/game-engine/raceSimulation.ts`) derives a course from the totals: runnable → climb → descent blocks (≤ 600 m D+ per climb, climb share by category), validated (positive lengths, gradient ≤ 40 %). Deterministic. |
| Simulation | One shot: `raceSeconds` sums each block's time from abilities (Speed, Climbing, Technical, Endurance, Recovery mixes), Fitness, pre-race Fatigue, equipment, a slowdown over distance (Endurance/Recovery) and a fixed day form. |
| Rivals | 49 NPC finishing times from a reference runner of the race's level (`rivalTimes`), spread by rank. Only final times: no splits. Not sexed (no category positions exist). |
| Fatigue | One career stat 0–100. Pre-race Fatigue slows the runner; the race adds `round(6 + 0.6 × effort-km)` at the end; above 95 → injury (−15 Fitness, 5 forced rest days). No in-race fatigue, no "energy". |
| Rewards | Prize/XP by position band × anti-farming multiplier; XP ≥ 18. Applied once by the server (`race` operation). |
| Server | `career-ops` Edge Function, operation ids, version check, `commit_career`. The race is one request on race Sunday. |
| Gels / bars | Items `energy-gel`, `cereal-bar` exist with price, level and effect **to be defined** (not for sale, so nobody owns one). Inventory is a set of owned ids (no quantities). |

## 2. Conflicts with the specification

1. **Nutrition quantities vs. the owner's rule.** The specification lets the player choose
   quantities with a cap; the owner set: *the runner carries at most 1 gel and 1 cereal bar, and
   that is enough for the whole race.* Proposal: a pre-race choice "take the gel / take the bar"
   (0 or 1 each), each giving a whole-race bonus. No quantities, no coverage-by-distance rule.
2. **Gels and bars cannot be owned yet** (no price). Nutrition is unusable until price — and
   whether it is consumed by a race — are decided (**Decision needed**, §4.3).
3. **"Energy / fitness" in the race.** There is no energy stat, and Fitness is a long-term career
   stat. Proposal: no new stat; the race uses an **in-race fatigue** that starts at the runner's
   Fatigue, rises per segment and drops at aid stations. "Energy" on screen = 100 − in-race fatigue.
4. **Category (sex) position.** Not supported: rivals have no sex. Proposal: show overall
   position only (the specification says "if supported").
5. **D− per segment.** The catalog has no D−; races are loops (D− = D+ in total). Segments get
   their D− from the generated course.
6. **Segment terrain/difficulty.** The catalog has one terrain text and technicality per race.
   Segment terrain is derived (runnable / climbing / descending share, the race's technicality on
   descents) — no invented data.
7. **Race fatigue and balance.** Today a race adds a fixed Fatigue. With intensities and aid
   stations it becomes the in-race fatigue at the finish. Calibrated so that *Target pace + Normal
   stops* gives about today's time and fatigue (rewards and balance preserved).
8. **Race day flow.** Today the race is instant on Sunday. A multi-step race needs a persisted
   "race in progress" (new field in the career, server-side). While it is in progress, Sunday
   cannot be trained and the week does not advance; it ends when the finish is reached.

## 3. Proposal

### 3.1 Segments and aid stations (derived from the existing course)

- Number of segments: `clamp(round(distance km / 6), 2, 8)` → aid stations per race (1 = Forest
  First Steps … 7 = Beyond the Skyline): 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 7.
- The generated course is cut at equal distances into those segments (a block can be split);
  each segment gets distance, D+, D−, terrain shares and technicality from its blocks. Totals equal
  the race's totals by construction; a validation rejects any mismatch, empty segment or a segment
  without length. No aid station after the finish.
- Data model: `Race.segments?` is optional, so a hand-made profile can replace the derived one
  later for any race.

### 3.2 Intensity (per segment, 4 options)

| Intensity | Pace (time ×) | In-race fatigue gained (×) |
|---|---|---|
| Recovery | 1.10 | 0.45 |
| Easy | 1.05 | 0.70 |
| Target pace | 1.00 | 1.00 |
| Hard | 0.95 | 1.60 |

- Segment time = existing `raceSeconds` model on the segment's blocks × pace factor, with the
  **current in-race fatigue** in the existing fatigue factor (so Hard early makes later segments
  slower: Hard is not always best).
- Fatigue gained in a segment = `0.6 × effort-km × intensity factor × (20 / Recovery)^0.35` (the
  existing per-effort-km race fatigue, reduced by the Recovery attribute with the existing curve).
- Attributes keep their existing roles per block (Climbing on climbs, Technical on technical
  descents, Speed on runnable, Endurance/Recovery on the slowdown and on fatigue).

### 3.3 Nutrition (owner rule: 1 gel and 1 bar at most)

- Before the start: take the gel (if owned) and/or the bar (if owned).
- Proposed bonus (configurable): gel −1.5 % race time, bar −1.5 % fatigue gained, both for the
  whole race; cap −3 % combined. No bonus without them.
- **Decision needed:** price of each, level (if any), and whether a race **consumes** them (then
  the inventory needs a quantity of 0/1 and they are bought again) or they are permanent.

### 3.4 Aid stations (between segments)

| Stop | Duration | Recovery of in-race fatigue gained so far |
|---|---|---|
| Quick | 30 s | 10 % |
| Normal | 2 min | 25 % |
| Slow | 5 min | 45 % |

- Recovery × `(Recovery attribute / 20)^0.35`, never below the runner's pre-race Fatigue (a stop
  cannot remove career fatigue) and never above 60 % of the race fatigue so far.
- Stop time adds to the race time and to positions.

### 3.5 NPC rivals (same structure)

- Each rival's existing final time is split over the segments in proportion to the reference
  runner's segment times, plus a deterministic stop at each aid station (by rank: front third
  Quick, middle Normal, back third Slow). Cumulative times per aid station; positions after each
  segment and stop are recomputed against them.

### 3.6 Finish

- Final time, overall position, existing prize/XP bands and multipliers, XP ≥ 18, Fatigue =
  in-race fatigue at the finish (clamped 0–100), existing injury rule (above 95), race history,
  day completed. Once.

### 3.7 Server and persistence

- `GameState.activeRace` (null or the race in progress: entry, segment index, decisions,
  elapsed time, in-race fatigue, nutrition taken).
- New operations in `career-ops`: `race-start` (intensity of segment 1, gel/bar) and
  `race-step` (stop option and intensity of the next segment; the last step finishes). Each
  simulates **one** segment on the server's state; the client sends only decisions. Operation ids,
  version check, `commit_career`, stored responses as today. Migration: allow the two new
  operation kinds. The old one-shot `race` is removed.
- **Decision needed:** segments resolve **instantly** when the player confirms (proposed), or
  after a real-time wait.

### 3.8 Screens

Race preparation (segment profile, equipment, gel/bar, first intensity, Start) → aid-station
report (position, elapsed time, gaps to the rivals just ahead/behind, energy, fatigue, nutrition
taken, segment result, next segment's km/D+/D−/terrain, stop and intensity, Continue) → the
existing result screen, extended with the splits.

## 4. Decisions needed before implementing

1. Accept the values in §3.1–§3.5 (or give others).
2. "Energy" = 100 − in-race fatigue (no new stat).
3. Gels/bars: price, level, consumed per race or permanent.
4. Segments resolve instantly (proposed) or after a wait.
5. Overall position only (no sex categories).
