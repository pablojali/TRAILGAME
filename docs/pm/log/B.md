# Stream B log

Newest entry first. Only session B writes here.

## 2026-11-22 — B-6c Starter shoes at 20 coins and the emergency pair

Branch `stream-b/starter-shoes-emergency-pair`. Brief `docs/pm/briefs/B-6c-starter-shoes-emergency-pair.md`.
Everything new is active only with `wear_speed > 0`. It ships at 0.

### What was done

**Price (owner decision D8)**
- `starter-shoes` costs 20 in `src/data/equipment.csv`, a value the owner authorised. The test copy
  of the table was changed the same way.
- Runners still start owning the starter shoes.
- Buying them again is refused as "already owned" unless they have worn. A worn pair is replaced for
  20 coins.
- With wear off the only visible change is the price on the shop card: "Starter shoes, 20 coins,
  Owned" instead of "free". Two shop tests and one engine test were updated for it.

**Emergency pair** (`withEmergencyPair` in `src/game-engine/wear.ts`)
- When it is checked: at the moment wear is applied, after the day or race is complete, coins
  included. That covers a training day (`executeCurrentDay`), an NPC race finish (`finishRace`) and a
  Sunday Major result (`applyMajorReward`).
- When it is given: all of these must hold.
  - Before that wear, the runner owned at least one usable pair (above the DNF band, or shoes that
    never wear).
  - After it, they own none.
  - Their coins are below the cheapest shoes for sale (20 now).
  - No pair was given in the last 8 game weeks.
- What is given:
  - the starter shoes, new (their wear is reset) and equipped;
  - `emergencyPairWeek` records the week;
  - the result of the training day or race finish carries `emergencyPair: true`.
  - For a Major, the result is added inside `career-ops` without an answer of its own. A-5 can tell by
    `emergencyPairWeek` changing.

**Save:** `GameState.emergencyPairWeek` is optional, a whole week of 1 or more. Older saves load
without it and are not rewritten.

### Holes found in the guard (proposals, nothing coded around them)

1. **Spending before the moment.** A player can spend coins just before training their last pair into
   the band, and so qualify on purpose. Checking at the moment stops spending *after* it, not before.
   - What limits it: the 8-week cooldown, and the prize is only a 20-coin pair. Each time, the player
     also goes through the 9–1 % band, with its injury risk and DNF.
   - I propose to accept it. If the owner wants it closed: also require that the coins did not drop in
     the same game week, which needs the coins at the start of the week in the save.
2. **No coins and the cooldown still running.** Training is never blocked, and a race day can be
   withdrawn from (B-6b), so there is no hard soft-lock. The runner cannot race until they have 20
   coins or the cooldown ends. Coins still come from level rewards and achievements.
   - I propose to accept it: it is the intended pressure.
3. **A pair already in the band when wear is switched on.** It never crosses the line, so it gets no
   pair. This only matters on the day the owner turns wear on. Today every `life_km` is empty, so no
   career has wear yet.

### Files
- **Tables:** `src/data/equipment.csv`, `src/test/fixtures/equipment.csv`.
- **Engine:** `src/game-engine/{wear,training,races,majorRewards,gameState}.ts`.
- **Saves:** `src/repositories/gameRepository.ts`.
- **Tests:**
  - `src/game-engine/emergencyPair.test.ts` (new): the guard, the cooldown, the race finish, wear
    off, the save;
  - `src/server/wearOps.test.ts`: the grant in the server's answer;
  - price updates in `equipment.test.ts`, `raceWear.test.ts` and `EquipmentScreen.test.tsx`. The last
    one is stream A's file; only the expected price text changed.

### Checks
- Lint, typecheck and build pass.
- 974 tests pass. Locally only `functionBundle.test.ts` fails, because the bundles are not committed;
  CI rebuilds them.
- `supabase/` is untouched, so no `db:test`.

### For A-5
- Tell the player about `emergencyPair` in the training-day and race results, and about a change of
  `emergencyPairWeek` after a Major.
- The starter shoes now show a price of 20 in the shop.

## 2026-11-22 — B-6b Race consequences of worn shoes: wear along the course, DNF, equipment lock

Branch `stream-b/race-wear-consequences`. Brief `docs/pm/briefs/B-6b-race-wear-consequences.md`.
Everything is active only with `wear_speed > 0`, which ships at 0.

### Owner decisions given to me in the session (22 November 2026)
- **D9:** check the shoes again at READY. **Done.**
- **D9, second part (confirmed by the owner via the PM, 22 November 2026):** race day with shoes at 0 %
  (or none equipped): **the day waits** until the player decides.
  - The start is refused (`shoes-worn-out`) and training that day is refused (`race-day`). Nothing
    closes the day or drops the entry by itself.
  - The player either buys or equips shoes and races, or **withdraws**. Withdrawing is the new
    operation `withdraw-race` (`withdrawFromRace`, `GameProvider.withdrawRace`): it drops the entry,
    closes the day as Rest, and the result carries `didNotStart: <raceId>`.
  - Withdrawing is refused when the shoes can race (`race-can-start`) or on another day
    (`not-race-day`).
  - The operation is recorded in `career_operations` with the kind `train`, since it closes a day as
    a training day does. The database's list of kinds therefore needs no migration.
- **Sunday Major, same rule:**
  - READY is refused at 0 % (`shoes-worn-out`), and nothing is done automatically.
  - The player buys shoes and confirms READY, or withdraws with the existing Major `withdraw`.
  - The Major's own schedule is unchanged: a player not READY when the window closes does not start.
    That is the rule from before B-6b and is not new.
- **Shoes running out on the last segment:** the runner **finishes** the race. Done.
- **D8:** "Zapas salen barato, 20 euros". I read it as option B: the starter shoes get a price (20 coins).
  **Not done here:** the price is an owner-table value, and option B also needs the emergency-pair
  guard (`EQUIPMENT_WEAR_CALIBRATION.md` §7). For the PM to brief.

### Segment rule
- The engine already runs a race one segment at a time, so no rewrite was needed.
- At the start, the race keeps the gear's wear (`ActiveRace.wear`: wear speed and each worn item's
  share of life used). A Major keeps it in its READY snapshot.
- Each segment is run with the effect left by the wear at its start:
  - **Shoes:** the band's `effect_factor` scales their bonuses. +4 at 0.75 is +3; a 0.9 multiplier
    at 0.75 becomes 0.925.
  - **Other gear:** full effect while it has life left, none at 0 %.
- The engine change is small:
  - `getRaceEffect` takes optional per-item factors;
  - the runner input takes `effectFactors`;
  - solo races build them in `contextOf`, and Majors in `segmentContext`.

### Aid-station rule
- If the shoes' durability reaches 0 % during a segment, the runner reaches the end of that segment
  and retires at that aid station.
- Running out on the **last** segment still finishes the race (owner decision). The shoes end at 0 %.
- The step at that aid station only records the DNF, whatever was decided there.

### The DNF
- `RaceResult.dnf = { segment (1-based), km, aidStation }`. A DNF is always at an aid station.
- **Rewards:**
  - no prize (0 coins);
  - no ranking fields, so the database trigger records no points;
  - XP = **last place's XP × km run ÷ race distance**, rounded down.
- **Fatigue:** the in-race fatigue of the km actually run. The injury rule applies as before.
- **Wear:** the km actually run, so the shoes end at 0 %.
- **Placing:**
  - In solo results the player is placed last (`position` = field size), and `getStandings` marks the
    row `dnf`.
  - In Majors, retired runners rank after everyone still running, the furthest first.
  - Major rewards follow the same rules.
- **Majors live view:**
  - the runner's live row carries `retires: true` on the segment where they stop;
  - the standings mark `dnf` once that segment is revealed;
  - they run nothing after.
- **Old saves:** results and races without these fields load unchanged. No migration: careers are
  JSON, and the ranking trigger already skips results without points. `supabase/` is untouched.

### The shoes' effect in the result
- A finished or retired race with worn shoes stores `shoeWear`:
  - the shoes' durability at the start and at the end;
  - `timeLostS`: the same race run again with full effect, same intensities and stops.
- That gives the explanation a figure for "the worn shoes cost you X seconds". A-5 shows it.

### Entry preview
- `predictShoes(state, race)` gives `{ lasts: true }` or `{ lasts: false, segment, km, aidStation }`.
- The race is deterministic from the wear and the course, so the prediction is exact unless training
  wears the shoes further before the start.
- The enter-race result carries `shoes` and `prediction`. The screen can call `predictShoes` before
  the player confirms.

### Equipment lock
- With wear on, `setItemEquipped` and `buyItem` (replacing included) refuse with `race-in-progress`
  while `activeRace` is set.
- In Majors the READY snapshot fixes the gear that races, so changing the kit after READY does not
  change the Major.
- The new refusal is kept apart from the screens' error types (`RaceLockError`), so they compile.

### PM review fixes (22 November 2026)

**A DNF is not a finished race.**
- `isFinisher(entry)` (`src/game-engine/career.ts`) tells a finisher from a DNF, and `getFinishers`
  lists the finishers.
- DNFs stay in `getRaceHistory`, so the career screen lists them.

Readers checked:
- **Changed to count finishers only:**
  - `career.ts`: medal table, and personal bests. A DNF never sets a best time or position but counts
    as a run; a race with DNFs only is not in the bests list.
  - `achievements.ts`: races finished, positions, and the season summary. A DNF therefore pays no
    achievement reward, because `applyAchievementRewards` reads these.
  - `cloudSync.ts`: the summary's race count.
  - `majorOps.ts`: `racesFinished`.
- **Left as they are, for A-5 to show DNFs** (their files are stream A's):
  - `inbox.ts`: the race item shows position and points; a DNF has 0 points.
  - `Inbox.tsx`: "races run" counts DNFs, which is right for runs.
  - `TrainingScreen.tsx`: the Sunday result line.
  - `RaceDetailScreen.tsx`: the best and last position from `getFinishedEntries`. A DNF is position 50,
    so it never beats a finish; with DNFs only, it shows 50.
  - `RaceResultScreen.tsx` and `CareerScreen.tsx` history rows: position and time.
  - `RaceRunScreen.tsx`: `status === 'finished'` to leave the run screen, which is right for a DNF too.
  - Coach `hasFinishedRace`: true after a DNF; the first-race coach moment still makes sense.
- **Rankings:** a DNF has no ranking fields, so the database trigger skips it, as before.

**Tests:** a DNF does not add to races finished, achievements (and pays no achievement reward), the
medal table or the season summary, and does not set or beat a best time. The same holds for a Major
DNF. Also tested: the race-day wait and the withdrawal, in the engine and through `career-ops`.

### Files
- **Engine:**
  - `src/game-engine/raceWear.ts` (new);
  - `src/game-engine/{races,raceEngine,raceSimulation,majorRace,majorRewards,equipment,gameState}.ts`;
  - `src/domain/equipment/items.ts`, `src/domain/major/major.ts`.
- **Saves:** `src/repositories/gameRepository.ts`.
- **Server:** `src/server/{careerOps,majorOps,majorOrchestrator}.ts`.
- **Client glue:** `src/app/game/GameProvider.tsx`.
- **Tests:**
  - `src/game-engine/{raceWear,majorWear}.test.ts`;
  - `src/server/wearOps.test.ts`: READY refused at 0 %, wear in the snapshot, the lock, the
    prediction.

### Checks
- `npm run lint`, typecheck and `npm run build` pass.
- 959 tests pass. Locally only `functionBundle.test.ts` fails, because the bundles are not committed;
  it passes after `npm run build:functions`, and CI rebuilds them.

### For stream A (A-5)
- **Texts:** `race-in-progress`, `no-shoes-equipped` and `shoes-worn-out`.
- **Results:** show `result.dnf` and `result.shoeWear`.
- **Entry warning:** use `predictShoes`.
- **Live Majors:** handle the `retires` flag in the live runners and `dnf` in the standings.
- **Aid station:** `retiresHere(active, race)` says the runner retires at the station they are at.

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

