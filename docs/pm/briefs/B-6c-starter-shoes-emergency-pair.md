# Brief B-6c — Starter shoes at 20 coins (emergency pair removed by D11)

**Depends on:** B-6b merged. Do not start before the PM assigns it. Read `docs/pm/README.md`,
`docs/pm/CONTRACTS.md`, `docs/pm/briefs/B-6a-equipment-wear.md` and `docs/EQUIPMENT_WEAR_CALIBRATION.md`
(sections 6 and 7). One branch (`stream-b/starter-shoes-emergency-pair`), one PR.

## Owner decisions (22 November 2026)

- **D8:** the starter shoes cost **20 coins** (they cost 0). Buying them again, as a replacement, costs 20. The
  runner still starts owning them.
- **D11 (22 November 2026, supersedes the emergency pair):** the free emergency pair is **dropped**. The way out of
  having no shoes and no money is a rewarded ad (brief B-6d, a separate topic). **PR #130 must be reworked:** remove
  `withEmergencyPair`, `EMERGENCY_PAIR_ID`, the cooldown, `cheapestShoesPrice` and `hasRaceablePair` if nothing else
  uses them, the `emergencyPairWeek` save field, the `emergencyPair` result flag and their tests and docs. Keep the
  starter shoes at 20 and the tests for it. Update the log and `docs/EQUIPMENT_WEAR_CALIBRATION.md` section 7.
  Ignore item 2 below and the PM review comment about the guard.

## What to build

1. **Price:** set `starter-shoes` to price 20 in `src/data/equipment.csv`. The owner has authorised this value.
   Check that the shop and the tests treat the starter shoes sensibly (already owned, replaceable at 20). The
   price must not change anything while `wear_speed` is 0.
2. **Emergency pair, with the guard B proposed (section 7 of the calibration report):** when the last pair of
   shoes above the 9 % band drops to 9 % or less (the moment is after wear is applied: a training day, or a race
   finish), and the runner's coins are then below the cheapest pair for sale (now 20), the game gives one free
   starter pair (the starter shoes, new, equipped), **at most once every 8 game weeks**. Checking only at that
   moment is what stops the player spending coins on purpose to qualify. If B finds a hole in this guard while
   building it, propose a fix in the log before coding around it.
3. **Server and saves:** decided and recorded by the server like all wear. The save needs the week of the last
   emergency pair (an optional field; older saves load unchanged). The result of the training day or race finish
   says that an emergency pair was granted, so A-5 can tell the player.
4. Everything is active only when `wear_speed > 0`.

## Out of scope

Screens (A-5); changing other prices; the calibration values (D10).

## Acceptance criteria

- [ ] With `wear_speed = 0` nothing changes for the player.
- [ ] The starter shoes cost 20; replacing worn starter shoes costs 20.
- [ ] The emergency pair is granted exactly when the guard says, never more than once every 8 game weeks, and not
      when the player has the coins for the cheapest pair.
- [ ] The grant is part of the server's answer to the day or race that caused it.
- [ ] Older saves load unchanged; tests for the guard, the cooldown and the save; `npm run check` passes
      (and `npm run db:test` if `supabase/` changed).
- [ ] Log in `docs/pm/log/B.md`.
