# Brief B-6b — Race consequences of worn shoes: penalties, DNF and equipment lock

**Depends on:** B-6a merged. Do not start before the PM assigns it. Read `docs/pm/README.md`,
`docs/pm/CONTRACTS.md` and `docs/pm/briefs/B-6a-equipment-wear.md`. One branch
(`stream-b/race-wear-consequences`), one PR. Everything here is active only when `wear_speed > 0`.

## Owner decisions (22 November 2026)

- The shoes' durability band changes the race: normal performance (100–40 %), slight penalty (39–20 %), heavy
  penalty (19–10 %).
- **Starting a race with shoes at 9–1 %: the shoes break at an aid station and the result is a guaranteed DNF.**
- DNF consequences: **no prize, no ranking points, reduced XP.**
- **The player cannot fix the problem during the race**: no buying, replacing or changing equipment while a race
  is in progress.

## What to build

1. **Performance penalty.** The race simulation scales the shoes' race effect by the band's `effect_factor` from
   `src/data/wear_bands.csv` (B-6a). If scaling the bonus is not enough to make the penalty felt, propose an
   extra time malus with numbers; do not apply it without the owner's approval.
2. **Guaranteed DNF at 9–1 %.** The runner may start. The shoes break at an aid station and the runner leaves
   the race there. PM default: the **first** aid station. Every race has at least one segment boundary; if a race
   has no aid station, or a different rule would play better, **propose** it in your log. It must work in NPC
   races and in the live Sunday Majors (the runner leaves at that station in the live view).
3. **DNF as a result.** A new outcome with where it happened. No prize, no ranking points, XP reduced (propose
   the share from simulation; proportional to the distance covered is a reasonable start), fatigue and shoe wear
   for the distance actually run. Rankings and results lists place DNFs after the finishers and exclude them from
   points. Older saves and results load unchanged. Server decides; add migration path and tests.
4. **Entry preview data.** The entry response tells the client the band, the durability left and, in the DNF
   band, that a DNF is guaranteed, so the screen can warn before the player confirms (A-5 shows it).
5. **Equipment lock during a race.** There is already an `activeRace` state. While a race is in progress the
   server rejects equipping, unequipping, buying and replacing equipment with `race-in-progress`. Check the
   live Majors too.

## Out of scope

Screens (A-5); changing the band thresholds or prices; DNF causes other than worn shoes.

## Acceptance criteria

- [ ] Each band changes the race result as the table says; the explanation of the race result mentions the shoes.
- [ ] Starting at 9–1 % ends in a DNF at the chosen aid station, in NPC races and in Majors.
- [ ] A DNF gives no prize or ranking points, reduced XP, and still costs fatigue and wear for the distance run.
- [ ] Rankings and results handle DNF; old saves load unchanged.
- [ ] Equipment actions are rejected while a race is in progress.
- [ ] `wear_speed = 0` leaves everything as before.
- [ ] Tests for bands, DNF, DNF rewards and the lock; `npm run check`, and `npm run db:test` if `supabase/` changed.
- [ ] Log in `docs/pm/log/B.md`: the aid-station rule, the DNF XP share and anything proposed.
