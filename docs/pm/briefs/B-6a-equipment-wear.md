# Brief B-6a — Equipment wear: rules, server and saves

**Topic owner:** Claude Code (game systems). **Depends on:** nothing. **Followed by:** A-5 (screens).
Read `docs/pm/README.md` and `docs/pm/CONTRACTS.md` first. One topic, one branch (`stream-b/equipment-wear`),
one PR. Do not start A-5 or anything else.

## Goal

Make coins leave the player's hands regularly. Gear wears out faster than in real life and has to be
replaced. Today nothing wears: shoes, packs and poles are bought once and kept for ever in
`ownedEquipment`; only gels and bars are used up.

## Owner decisions (22 November 2026)

1. **Shoes wear by distance.** Real-life life: **500 km**. **Packs wear by time.** Real-life life:
   **2 years = 104 game weeks** (a career year is 52 weeks). Poles: the owner has not given a life yet,
   so poles do not wear until the owner fills it in. Do not invent one.
2. **One global knob, `wear_speed`**, multiplies the wear so gear wears faster than real life
   (real life = 1). `0` means wear is **off**.
3. **What counts as distance.** Races count their real `distance_km`. Training sessions have no
   distance today, so a new owner table gives each session type a km equivalent (starting proposal
   below; the owner tunes it). Gear wears **only while it is equipped**.
4. **Worn-out shoes (100%): the runner cannot enter a race.** There is **no DNF in this version.**
   (The owner first wrote "DNF", then chose "cannot enter". If DNF is wanted later it is a separate topic;
   the owner's answer for it: no prize, no ranking points, reduced XP.)
5. **No soft-lock.** The game starts with 0 coins and free starter shoes. If every pair of shoes the
   runner owns is worn out and the runner cannot afford the cheapest pair for sale, the game gives a
   **free emergency pair**. The exact guard is part of this task (see below).

## What to build

### Data (the owner's tables, read like the other tables)

- `src/data/equipment.csv`: two new optional columns, `wear_unit` (`km` or `weeks`; empty = never wears) and
  `life` (real-life units). Fill: all shoes `km` / `500`; all packs `weeks` / `104`; everything else empty.
- `src/data/economy.csv`: a new row `wear_speed`.
- A new table for training km (suggested name `src/data/wear_km.csv`, `session,km`). **Starting proposal,
  for the owner to change:** easy-run 8, intervals 6, hills 6, long-run 18, trail-technique 4,
  strength 0, rest 0.
- Update the Trail Studio tables only if it already edits these files generically; otherwise leave Studio
  alone and say so in your log.

### Rules (`src/domain`, `src/game-engine`)

- **Accrual:** shoes gain wear when a training session is completed (its km from the table) and when a race
  result is committed (the race's `distance_km`); packs gain wear when a game week passes. Each amount is
  multiplied by `wear_speed` and divided by the item's `life`. Only equipped items wear.
- **Worn out at 100%:** the item stops giving its race effect and is unequipped. It stays owned and shows as
  worn out until replaced.
- **Replace:** buying an owned item again (same price) is a replacement and resets its wear. Today an owned
  item cannot be bought twice; change that only for items that wear and have wear above zero.
- **Entry rule:** `enterRace` refuses with a new reason (for example `no-usable-shoes`) when every pair of
  shoes the runner owns is worn out. A runner who owns an unworn pair but equips nothing can still enter,
  as today. Do not add a "must equip shoes" rule.
- **Majors:** report how a Sunday Major behaves when the runner's last shoes wear out between registering and
  starting, and **propose** a rule in your log (the PM suggests: checked at registration and at start; if
  every pair is worn at the start, the runner does not start and gets no result, prize or points).
  Do not code it until the owner approves.
- **Emergency pair:** conditions are all pairs worn out **and** coins below the cheapest shoes for sale.
  The free pair must not be exploitable by spending coins on purpose to qualify. **Propose the guard**
  (for example a cooldown in game weeks, or checking only at the moment the last pair wears out) with
  your reasoning in the log, and wait for the owner's approval before coding that part.

### Server and saves

- All wear accrual, replacement and the emergency pair happen inside the existing server operations
  (`career-ops`), never on the client. Do not hand-edit the generated bundles; CI rebuilds them.
- New per-item wear state in the save. Choose what to store (percent, or consumed units before the
  multiplier) and **justify it in the log**: it decides what happens to existing gear when the owner later
  changes `wear_speed`. Careers saved before this load with zero wear and are not rewritten on load, as with
  previous schema additions. Add the migration path and tests.
- Add a Supabase migration only if the server needs new columns; run `npm run db:test`.

### Ship it dark

The first merge must leave `wear_speed` at `0`, so the game behaves exactly as today for the testers. The
owner switches it on after the A-5 screens exist.

### Calibration report (replaces task B-1)

Re-run the season simulation (`docs/SEASON_SIMULATION_16W.md`) against current values, say whether the M4
balance finding is closed, then propose a `wear_speed` and the km table. Suggested targets for the owner to
accept or change: shoes need replacing roughly every 8 to 12 game weeks for a sensible player, and
replacing worn gear costs roughly 25 to 35 % of the coins that player earns. Write the result in
`docs/EQUIPMENT_WEAR_CALIBRATION.md` with the numbers. **Apply no balance value without the owner's approval.**

## Out of scope

DNF; performance that drops gradually as gear wears; any screen (A-5); poles' life; a shop redesign;
changing prices.

## Acceptance criteria

- [ ] With `wear_speed = 0` the game and its tests behave exactly as before.
- [ ] With `wear_speed > 0`, equipped shoes wear by session km and race km, and equipped packs by game weeks.
- [ ] Unequipped gear does not wear. Items with no `life` never wear.
- [ ] At 100% an item is unequipped and gives no race effect.
- [ ] Re-buying a worn item replaces it and resets its wear; items that do not wear keep the "already owned" rule.
- [ ] A runner whose shoes are all worn out cannot enter a race, and the reason is explicit.
- [ ] Older saves load with zero wear and are not rewritten on load.
- [ ] All of it is decided by the server, with tests for the rules and the tables.
- [ ] `npm run check` passes (and `npm run db:test` if `supabase/` changed).
- [ ] Log in `docs/pm/log/B.md`: what was done, the Major proposal, the emergency-pair guard proposal, the
      storage choice, and the calibration summary.
