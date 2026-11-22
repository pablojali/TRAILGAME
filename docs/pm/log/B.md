# Stream B log

Newest entry first. Only session B writes here.

## 2026-11-22 — B-6a Equipment wear: durability, bands, training and entry rules

Branch `stream-b/equipment-wear`. Brief `docs/pm/briefs/B-6a-equipment-wear.md`. Ships dark: `wear_speed = 0`.

### What was done

**Tables (owner's)**
- `equipment.csv`: new optional column `life_km`. It is empty for every item, so nothing wears until
  the owner fills it.
- `economy.csv`: new row `wear_speed` = 0 (missing also counts as 0).
- New table `wear_km.csv` (the PM's starting proposal).
- New table `wear_bands.csv` (the owner's thresholds and my proposed numbers, see the calibration report).
- Test copies of all four live in `src/test/fixtures`. In the copy, the starter shoes last 150 km,
  the trail shoes 300 km and the first backpack 400 km.

**Rules**
- `src/domain/equipment/wear.ts`:
  - reads the tables;
  - durability in whole percent, rounded up, so only a pair with no life left at all is 0 %;
  - bands (shoes only);
  - remaining km = (1 − used) × life_km ÷ wear_speed.
- `src/game-engine/wear.ts`:
  - wear is added to the career, for equipped items with a `life_km` only;
  - status of the shoes and of all gear;
  - race-start check;
  - injury risk and draw.
- **Accrual:**
  - a training day wears the gear by the session's km;
  - an NPC race wears the gear worn at the start by the race distance;
  - a Sunday Major result wears the snapshot's gear by the race distance.
  - Wear stops at 0 %. Training is never blocked.
- **Injury:** in a band with `injury_risk_pct` > 0, a training session can injure the runner. It uses
  the existing consequences: no XP, −15 Fitness, 5 forced Rest days. The day's outcome stores
  `injuryCause: 'worn-shoes'`. Rest days are never affected.
- **Racing:**
  - `enterRace` refuses with `no-shoes-equipped` or `shoes-worn-out`.
  - `startRace` checks again, because training may have worn the shoes since the entry.
  - Major `register` refuses the same way.
  - The entry result carries `shoes` (band, durability, km left), for B-6b and A-5.
  - All of this only applies with wear on. With it off, entering with nothing equipped still works.
- **Replacing:** an owned item that has worn can be bought again at its price. Its wear resets and it
  stays equipped. Items that have not worn, never wear, or any item while wear is off keep
  `already-owned`.
- **Server (`career-ops`):** with wear on, the train and race-finish results carry `gear` (the wear of
  every owned item that wears) and the enter-race result carries `shoes`. Everything runs inside the
  existing operations. The client never decides wear.

### Storage choice

`GameState.wear` maps item id to the **share of its life used (0–1), after `wear_speed`**.
- Changing `wear_speed` or an item's `life_km` later changes how fast gear wears from then on.
- It never changes wear the gear already has: no pair breaks or heals when the owner retunes.
- The field is missing for older careers, and for every career while wear is off. Saves are not
  rewritten on load.
- The save check accepts only owned items that have a life, with values from 0 to 1.
- No migration: the career is stored as JSON, and `db:test` was not needed because `supabase/` is
  untouched.

### Injury draw

`mulberry32(fnv1a("shoe-injury|<server time ms>|<week>|<day>"))`: a deterministic function of the
server's clock at the moment the session is completed.
- Tests pick the time, so the server and the tests agree.
- The client cannot predict it, because it does not choose the server's time.
- A repeated request is answered from its operation record, so the draw never runs twice.
- A seed stored in the career would be visible to the client, which could then foresee the injury and
  switch the session to Rest.

### Proposals waiting for the owner (not coded)

- **Majors:** shoes are checked at registration only. I propose checking again at READY (refuse at
  0 % with `shoes-worn-out`) and nowhere else: the READY snapshot races. Details in
  `docs/EQUIPMENT_WEAR_CALIBRATION.md` §8.
- **Emergency pair:**
  - The starter shoes cost 0 and are for sale, so re-buying them is already a free replacement.
  - The condition "coins below the cheapest pair for sale" can therefore never be met, and no
    soft-lock happens.
  - The owner chooses between A, keep that (no code), and B, take the starter shoes off sale or price
    them.
  - With B, the guard I propose is: give one free starter pair at the moment the last pair above 9 %
    drops to 9 % or less, if coins are then below the cheapest pair, at most once every 8 game weeks.
  - Details in §6–7.
- **For B-6b:** a race Sunday whose shoes are at 0 % cannot be completed, because the start is
  refused and Sunday is race day. I propose letting the player withdraw, or counting it as "did not
  start". Details in §9.

### Calibration summary (`docs/EQUIPMENT_WEAR_CALIBRATION.md`)

- **M4 finding:** closed. A sensible player in daily play goes from Fitness 20 to 44 in 16 weeks and
  to 55–66 in 32 weeks, with no injuries.
- **Distance:** a sensible player covers about 26 km a week.
- **Proposal:**
  - `wear_speed = 1`;
  - paid shoes with lives of 200–300 km, which last 7.7–11.5 weeks;
  - replacements cost about 16–40 % of income;
  - the same multiplier for race km and training km.
- **Race use at speed 1:** an Elite race uses 21–35 % of a 200 km pair and an Open race 2–5 %.
- **Bands:** 1 / 0.75 / 0.4 / 0 / 0 effect factors, and 10 % injury risk per session at 9–1 % and
  at 0 %.
- No values were applied.

### Files

- **Tables:** `src/data/{equipment,economy}.csv`, `src/data/{wear_km,wear_bands}.csv`.
- **Rules:** `src/domain/equipment/{items,wear}.ts`, `src/domain/economy/premium.ts`,
  `src/game-engine/{wear,training,races,equipment,majorRewards,gameState}.ts`.
- **Saves:** `src/repositories/gameRepository.ts`.
- **Server:** `src/server/{careerOps,majorOps}.ts`.
- **Client glue:** `src/app/game/GameProvider.tsx`, where the new refusals are cast to the existing
  types; see "For stream A".
- **Tests:** `src/game-engine/wear.test.ts`, `src/server/wearOps.test.ts`, `src/data/tables.test.ts`,
  `src/test/setup.ts`, `src/test/fixtures/*`.
- **Simulation:** `scripts/wear-simulation.ts`.
- **Docs:** `docs/EQUIPMENT_WEAR_CALIBRATION.md`.

### Checks

- `npm run lint` and `npm run typecheck` pass.
- `npm run test`: 941 tests pass. Locally the only failures are `functionBundle.test.ts`, because the
  Edge Function bundles are not committed; CI rebuilds them.
- `npm run build` passes.
- Wear is tested with wear on through a test config, and through a test file that loads the server
  with `wear_speed 1`.

### Manual test steps

With `wear_speed 0` (as shipped), nothing changes in the game:
1. Train a day.
2. Enter a race with no shoes equipped.
3. Buy an owned item: it answers "already owned".

To try wear locally, set `wear_speed,1` in `economy.csv` and a `life_km` on the starter shoes, then:
1. Equip the starter shoes and train. The career gets `wear`, and the train result lists `gear`.
2. Unequip the shoes and enter a race: the entry is refused with `no-shoes-equipped`.

### Trail Studio

Left alone:
- The Equipment form does not show `life_km`, although its CSV writer keeps the column.
- The Economy panel shows the `wear_speed` row and checks it.
- `wear_km.csv` and `wear_bands.csv` are not in Studio.
- The owner needs `life_km` in the Equipment form, and the two new tables in Studio, to edit them
  there. That is an owner request for Studio.

### For stream A (A-5)

- `enterRace` and `startRace` can now refuse with `no-shoes-equipped` or `shoes-worn-out`.
  `GameProvider` casts them to the existing `RaceEntryError` and `RaceStartError` so the screens'
  message maps still compile. A-5 should widen those types and add the texts.
- To show wear: `wearStatus(itemId, state.wear?.[itemId] ?? 0)` and `gearStatus(state)` give
  durability, band and km left. The server answers also carry `gear` and `shoes`.

