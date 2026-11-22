# Brief B-6b — Race consequences of worn shoes: wear along the course, DNF and equipment lock

**Depends on:** B-6a merged. Do not start before the PM assigns it. Read `docs/pm/README.md`,
`docs/pm/CONTRACTS.md` and `docs/pm/briefs/B-6a-equipment-wear.md`. One branch
(`stream-b/race-wear-consequences`), one PR. Everything here is active only when `wear_speed > 0`.

## Owner decisions (22 November 2026; wear per aid station added at 09:28)

- The shoes' durability band changes the race: normal performance (100–40 %), slight penalty (39–20 %), heavy
  penalty (19–10 %).
- **Shoes keep wearing along the course.** A race has several aid stations (PA), so wear is applied **segment by
  segment**, not once at the start. When the shoes' durability runs out, they break and the runner **retires
  (DNF) at the aid station where that happens**. A runner who starts with little durability retires early; one
  who starts with a lot may finish. Starting a race at 9–1 % almost always ends in a DNF on anything but a short
  race, but it is the course that decides, not a fixed rule.
- DNF consequences: **no prize, no ranking points, reduced XP.**
- **The player cannot fix the problem during the race**: no buying, replacing or changing equipment while a race
  is in progress.

## What to build

1. **Wear along the course.** For each segment, the durability used is the segment's km x `wear_speed` / the
   shoes' `life`. The server evaluates the race segment by segment, in the same pass as the existing race
   simulation. The **band at the start of each segment** sets that segment's `effect_factor` (from
   `src/data/wear_bands.csv`, B-6a), so the penalty grows as the shoes wear during a long race. If the
   current engine cannot change the factor per segment, report it and propose the smallest change; do not
   rewrite the engine without the PM.
2. **DNF at the aid station.** If the durability reaches 0 during a segment, the runner reaches that segment's
   aid station and retires there (PM default; propose a better rule if you find one, for example if the final
   segment has no aid station after it: the runner then retires at the end of that segment). It must work in NPC
   races and in the live Sunday Majors (the runner leaves at that station in the live view). The shoes' wear
   for the km actually run is saved.
3. **DNF as a result.** A new outcome with where it happened (aid station and km). No prize, no ranking points,
   XP reduced (propose the share from simulation; proportional to the distance covered is a reasonable start),
   fatigue for the distance run. Rankings and results lists place DNFs after the finishers and exclude them from
   points. Older saves and results load unchanged. Server decides; add the migration path and tests.
4. **Entry preview data.** The race is deterministic given the shoes' durability and the course, so before the
   player confirms the server returns: the band, the durability and remaining effective km, and a **prediction**:
   "the shoes last the whole race" or "the shoes break at aid station N (about km X)". The screen warns from
   this (A-5), for any race the shoes will not finish, not only below 10 %.
5. **Equipment lock during a race.** There is already an `activeRace` state. While a race is in progress the
   server rejects equipping, unequipping, buying and replacing equipment with `race-in-progress`. Check the
   live Majors too.

## Out of scope

Screens (A-5); changing the band thresholds or prices; DNF causes other than worn shoes; random breaks.

## Acceptance criteria

- [ ] Wear is applied per segment; the band at the start of each segment changes that segment's result.
- [ ] A race with enough durability left is finished; one without it ends in a DNF at the aid station where the
      durability runs out, in NPC races and in Majors.
- [ ] The entry preview predicts exactly the aid station where the shoes will break, or that they will last.
- [ ] A DNF gives no prize or ranking points, reduced XP, and still costs fatigue and the wear of the km run.
- [ ] Rankings and results handle DNF; old saves load unchanged.
- [ ] Equipment actions are rejected while a race is in progress.
- [ ] `wear_speed = 0` leaves everything as before.
- [ ] The race result explanation mentions the shoes' effect.
- [ ] Tests for per-segment wear, bands, DNF position, DNF rewards, the prediction and the lock; `npm run check`,
      and `npm run db:test` if `supabase/` changed.
- [ ] Log in `docs/pm/log/B.md`: the segment rule, the aid-station rule, the DNF XP share and anything proposed.
