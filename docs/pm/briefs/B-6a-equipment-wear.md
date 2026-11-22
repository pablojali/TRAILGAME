# Brief B-6a — Equipment wear: durability, bands, training and entry rules

**Topic owner:** Claude Code (game systems). **Depends on:** nothing. **Followed by:** B-6b (race
consequences), then A-5 (screens). Read `docs/pm/README.md` and `docs/pm/CONTRACTS.md` first. One topic,
one branch (`stream-b/equipment-wear`), one PR. Do not start B-6b, A-5 or anything else.

## Goal

Make coins leave the player's hands regularly, with real consequences. Gear wears out faster than in real
life, and worn gear hurts: worse performance, injury risk in training, and no race start. Today nothing
wears: shoes, packs and poles are bought once and kept for ever in `ownedEquipment`; only gels and bars are
used up.

## Owner decisions (22 November 2026; updated at 08:48 with the durability bands)

1. **All wearable gear wears by distance (km)**: shoes, packs, poles, and the watch when it is added. **Each
   item has its own life in km** (`life_km`), entered by the owner in the equipment table, so one shoe model
   can last 150 km and another 300 km. (Real-life reference for shoes: about 500 km, which the owner scales
   down to game values.) **The owner supplies the values;** do not invent them. An item with no `life_km` never
   wears. Packs, poles and the watch have no values yet, so they do not wear until the owner fills them in. A
   new wearable item (the watch, glasses, a cap) needs only a `life_km` in its row, no new rules.
2. **One global knob, `wear_speed`**, multiplies the wear of every item so all gear can be retuned without
   editing each row. `1` = as entered in the table; above 1 wears faster; `0` means wear is **off**. What the
   player sees is the item's life divided by `wear_speed` (for example "108 km of 150 km" at `wear_speed` 1).
3. **What counts as distance.** Races count their real `distance_km`. Training sessions have no distance, so
   a new owner table gives each session type a km equivalent (starting proposal below). Gear wears **only
   while it is equipped**.
4. **Shoe durability bands** (the owner's example values; to be balanced by simulation):

   | Durability left | Consequence |
   |---|---|
   | 100–40 % | Normal performance |
   | 39–20 % | Slight penalty |
   | 19–10 % | Heavy penalty |
   | 9–1 % | High risk: random chance of injury in training. In a race the shoes keep wearing along the course and break at the aid station where their remaining life runs out (see B-6b) |
   | 0 % | Not fit to race: the runner **cannot start a race** |

5. **Training is never blocked.** Reaching 0 % in training does not stop it; the accumulated wear just forces
   a replacement before racing. Wear does not go below 0 %.
6. **To start a race the runner needs functional shoes equipped** ("it is not enough to have the money; the
   kit has to be ready"). Functional means above 0 %. (This also applies when nothing is equipped: the
   runner must equip a pair. PM assumption, see the end.)
7. **No fixing it mid-race.** Equipment cannot be changed or bought while a race is in progress (done in B-6b).
8. **No soft-lock.** The game starts with 0 coins and free starter shoes. If the runner owns no pair above the
   DNF band (above 9 %) and cannot afford the cheapest pair for sale, the game gives a **free emergency pair**.
   The exact guard is part of this task.
9. **Packs, poles, the watch and any other item that gets a life (not shoes)**: no bands. Full effect until 0 %, then the effect is off and
   the item shows as worn out. They never block a race. (PM assumption.)

## What to build

### Data (the owner's tables, read like the other tables)

- `src/data/equipment.csv`: one new optional column, `life_km` (empty = never wears). Add the column and read it. The owner fills the values per model (for example
  150 km for one shoe model, 300 km for another); until they do, those items do not wear. Use test fixtures
  for your tests, not invented values in the real table.
- `src/data/economy.csv`: new row `wear_speed`.
- New table `src/data/wear_km.csv` (`session,km`). **Starting proposal, for the owner to change:** easy-run 8,
  intervals 6, hills 6, long-run 18, trail-technique 4, strength 0, rest 0.
- New table `src/data/wear_bands.csv`: one row per band with `from_pct`, `to_pct`, `label`, `effect_factor`
  (share of the shoe's race bonus that is kept), `injury_risk_pct` (per training session) and `race_start`
  (`ok`, `dnf` or `blocked`). The thresholds are the owner's; **the numbers for `effect_factor` and
  `injury_risk_pct` are yours to propose** from simulation. Starting point for the simulation (PM proposal):
  factors 1 / 0.75 / 0.4 / 0 / 0.
- Update Trail Studio's table editing only if it already handles these files generically; otherwise leave
  Studio alone and say so in your log.

### Rules (`src/domain`, `src/game-engine`)

- **Accrual:** shoes gain wear when a training session is completed (km from the table) and when a race
  result is committed (the km actually run). **Every equipped item that has a `life_km` wears by those same km**
  (shoes, pack, poles, watch...). Each amount is multiplied by `wear_speed` and divided by the item's
  `life_km`. Only equipped items wear.
- **Bands and injury:** the band of the equipped shoes is computed from the durability left. In training,
  shoes in the 9–1 % band (and at 0 %, PM assumption) give each session an `injury_risk_pct` chance of injury,
  using the **existing injury consequence** (no XP, -15 Fitness, 5 forced Rest days; `DEVELOPMENT.md`
  section 4.7 and `src/domain/training/injury.ts`). The random draw must be deterministic from a stored seed
  or server value so tests and the server agree; explain your choice in the log.
- **Race start:** `enterRace` (and the Major registration/start checks) refuse with explicit reasons when the
  equipped shoes are at 0 % (`shoes-worn-out`) or when no shoes are equipped (`no-shoes-equipped`). What
  happens along the course is B-6b; here only expose the band, the durability and the remaining effective
  life in km on the entry result so B-6b and A-5 can use them.
- **Replace:** buying an owned item again (same price) is a replacement and resets its wear. Today an owned item
  cannot be bought twice; change that only for items that wear and have wear above zero.
- **Majors:** report how a Sunday Major behaves when the runner's shoes change band between registering and
  starting, and **propose** a rule in your log (PM suggestion: bands are checked at registration and again at
  start; at 0 % at the start the runner does not start). Do not code it until the owner approves.
- **Emergency pair:** conditions are no pair above the DNF band **and** coins below the cheapest shoes for sale.
  It must not be exploitable by spending coins on purpose to qualify. **Propose the guard** (a cooldown in game
  weeks, or checking only at the moment the last good pair drops into the DNF band) with your reasoning in the
  log, and wait for the owner's approval before coding that part.

### Server and saves

- All accrual, bands, injury draws, replacement and the emergency pair happen inside the existing server
  operations (`career-ops`), never on the client. Do not hand-edit the generated bundles; CI rebuilds them.
- New per-item wear state in the save. Choose what to store (percent, or consumed units before the multiplier)
  and **justify it in the log**: it decides what happens to existing gear when the owner later changes
  `wear_speed`. Careers saved before this load with zero wear and are not rewritten on load, as with previous
  schema additions. Add the migration path and tests.
- Add a Supabase migration only if the server needs new columns; run `npm run db:test`.

### Ship it dark

**Every new rule is active only when `wear_speed > 0`.** With `0` the game behaves exactly as today, including
race entry with nothing equipped. The first merge leaves `wear_speed` at `0`; the owner switches it on after
B-6b and A-5.

### Calibration report (replaces task B-1)

Re-run the season simulation (`docs/SEASON_SIMULATION_16W.md`) against current values, say whether the M4
balance finding is closed, then propose `wear_speed`, the km table and the band numbers. Suggested targets for
the owner to accept or change: shoes need replacing roughly every 8 to 12 game weeks for a sensible player, and
replacing worn gear costs roughly 25 to 35 % of the coins that player earns. Races wear shoes along the
course too (B-6b): on a 150 km pair at `wear_speed` 1, a 70 km race uses nearly half a pair. Include the **cost
per km of each shoe model** (price divided by life), so the owner can compare a short-lived cheap pair with a
long-lived expensive one. State how much of
a pair each race category uses at your proposed `wear_speed`, and say whether race km should use the same
multiplier as training km. Write it in
`docs/EQUIPMENT_WEAR_CALIBRATION.md` with the numbers. **Apply no balance value without the owner's approval.**

## Out of scope

The DNF itself, race penalties and the "no changes during a race" lock (B-6b); any screen (A-5); the life values of packs, poles and the watch (owner); a
shop redesign; changing prices.

## Acceptance criteria

- [ ] With `wear_speed = 0` the game and its tests behave exactly as before.
- [ ] With `wear_speed > 0`, every equipped item with a `life_km` wears by session km and race km.
- [ ] Unequipped gear does not wear. Items with no `life_km` never wear.
- [ ] Durability left and band are available for every item that wears, from the server.
- [ ] Training is never blocked; shoes at 9–1 % add the injury chance per session, using the existing injury rule.
- [ ] A race cannot be started with shoes at 0 % or with no shoes equipped, and the reason is explicit.
- [ ] Re-buying a worn item resets its wear; items that do not wear keep the "already owned" rule.
- [ ] Older saves load with zero wear and are not rewritten on load.
- [ ] All of it is decided by the server, with tests for the rules and the three tables.
- [ ] `npm run check` passes (and `npm run db:test` if `supabase/` changed).
- [ ] Log in `docs/pm/log/B.md`: what was done, the Major proposal, the emergency-pair guard proposal, the storage
      choice, the injury-draw approach and the calibration summary.

## PM assumptions the owner can overturn

1. Shoes at 0 % also carry the training injury risk (same as the 9–1 % band).
2. Racing now requires equipped shoes above 0 % (nothing equipped also blocks).
3. Only shoes have bands and can block or end a race; packs, poles and the watch have no bands, just full effect
   until 0 % and then none, and never block racing.
