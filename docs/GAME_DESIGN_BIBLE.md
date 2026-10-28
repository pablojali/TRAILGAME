# TRAIL GAME — GAME DESIGN BIBLE

**Version:** 1.2

**Status:** Approved design baseline — partially implemented (M0, M1 and M2 accepted); remaining systems pending milestone assignment

**Changes in 1.2 (owner decisions, 28 October 2026):** Rest now applies Fatigue −8 and Fitness −2 (§4.4); new injury rule (§4.7); the simulated training week is labelled Monday–Sunday (§4.2); career creation adds a cosmetic sex and the runner's name (§2.1). These were implemented on the working branch together with UI Improvements v1 (see `docs/UI_IMPROVEMENTS.md`).

**Project:** Trail Game

**Product vision:** A trail-running management game where players develop an athlete, manage training and fatigue, acquire equipment, compete in races, and progress through seasons.

---

## 1. PRODUCT VISION

Trail Game is a trail-running athlete management game designed primarily for mobile devices.

The player begins as an amateur runner and develops their athlete through training, attribute progression, equipment upgrades, race participation, and seasonal competition.

The game should reward strategic decisions rather than simply accumulating training sessions.

The core gameplay loop is:

1. Review the athlete's condition.
2. Select or complete a training session.
3. Manage Fitness and Fatigue.
4. Earn XP and progress through levels.
5. Develop the athlete's attributes.
6. Prepare for and enter races.
7. Earn rewards and improve equipment.
8. Compete against rivals.
9. Complete a season and make long-term progression decisions.

The interface should resemble a modern mobile game, even when accessed through a web browser.

### Design principles

- **Progression:** The athlete should visibly improve over time.
- **Specialization:** Different starting profiles should encourage different strategies.
- **Trade-offs:** Training should provide benefits while introducing fatigue and opportunity costs.
- **Consistency:** Long-term training should matter more than a single session.
- **Strategic decisions:** Fitness, fatigue, attributes, equipment, and race characteristics should interact.
- **Fair progression:** Starting profiles should offer different strengths without giving one profile an overwhelming total-stat advantage.
- **Persistence:** Progress should survive browser refreshes and application restarts.
- **Incremental development:** Features must be implemented in explicitly defined milestones.

---

## 2. ATHLETE CREATION

### 2.1 Starting profile selection

At the beginning of a new career, the player must select one of four profiles:

1. Climber
2. Sprinter
3. All-rounder
4. Endurance

The player must not be restricted to All-rounder.

Each profile defines the athlete's initial attribute distribution. Every profile has the same total number of starting attribute points, ensuring a fair starting baseline.

Profile selection should be presented through four visually distinct cards containing:

- Profile name.
- Short description.
- Attribute strengths.
- Attribute weaknesses.
- Attribute distribution or radar chart.
- Confirmation action.

The player must confirm the selected profile before starting the career.

**Cosmetic identity (1.2):** before confirming, the player also chooses the runner's sex (Female or Male) and, as a final step, the runner's name (required, 1–16 characters). Both are saved with the career. Sex only changes the runner's artwork; it never affects attributes, starting values or any other gameplay value, and it cannot be changed after the career is created.

### 2.2 Initial athlete state

The initial state is:

| Parameter | Starting value |
|---|---:|
| Level | 1 |
| XP | 0 |
| Fitness | 20/100 |
| Fatigue | 0/100 |
| Money | 100 coins |
| Unspent attribute points | 0 |
| Equipment | Basic shoes and basic hydration vest |
| Poles | Not owned |
| Career status | New amateur athlete |

The starting balance of 100 coins and starter equipment are provisional economy defaults. They must not be treated as proof that a complete equipment or economy system has already been implemented.

### 2.3 Starting attributes

The six core attributes are:

- **Endurance:** Capacity to maintain performance over long distances.
- **Climbing:** Performance on uphill terrain.
- **Speed:** Performance on fast and runnable terrain.
- **Technical:** Ability to handle technical trails and difficult descents.
- **Recovery:** Ability to recover from training and fatigue.
- **Consistency:** Ability to sustain training and perform reliably over time.

All attributes use a scale from 1 to 100.

Initial values must be between 12 and 20, inclusive.

#### Profile attribute matrix

| Attribute | Climber | Sprinter | All-rounder | Endurance |
|---|---:|---:|---:|---:|
| Endurance | 16 | 13 | 16 | 20 |
| Climbing | 20 | 12 | 16 | 15 |
| Speed | 13 | 20 | 16 | 14 |
| Technical | 18 | 17 | 16 | 13 |
| Recovery | 14 | 16 | 16 | 18 |
| Consistency | 15 | 18 | 16 | 16 |
| **Total** | **96** | **96** | **96** | **96** |

Every profile starts with exactly 96 attribute points.

#### Climber

A specialist in uphill performance and mountainous terrain.

- Main strength: Climbing.
- Secondary strength: Technical.
- Relative weaknesses: Speed and Recovery.
- Intended strategy: Prioritize elevation gain, mountain races, and terrain where climbing ability is important.

#### Sprinter

A specialist in speed and runnable terrain.

- Main strength: Speed.
- Secondary strengths: Consistency and Technical.
- Relative weaknesses: Endurance and Climbing.
- Intended strategy: Favor shorter, faster races and develop endurance when preparing for longer events.

#### All-rounder

A balanced athlete without a major initial weakness.

- All attributes start at 16.
- Intended strategy: Adapt to different race types and develop specialization through training.

#### Endurance

A specialist in long-distance performance and recovery.

- Main strength: Endurance.
- Secondary strength: Recovery.
- Relative weaknesses: Technical and Speed.
- Intended strategy: Favor long races and progressively develop the technical skills needed for demanding mountain events.

**Important:** Profiles define the initial distribution of attributes. They do not permanently lock the athlete into a race category.

---

## 3. ATHLETE CONDITION

### 3.1 Fitness

Fitness represents the athlete's current physical readiness and accumulated training condition.

- Range: 0–100.
- Initial value: 20.
- Fitness increases through training.
- Fitness decreases through inactivity and on Rest days (−2 per Rest day, 1.2).
- Fitness must never exceed 100 or fall below 0.

Fitness is not the same as an attribute.

Attributes represent relatively persistent capabilities. Fitness represents a changing condition affected by recent training and inactivity.

A high Endurance attribute does not automatically mean the athlete currently has high Fitness.

### 3.2 Fatigue

Fatigue represents the accumulated short-term cost of training.

- Range: 0–100.
- Initial value: 0.
- Training can increase Fatigue.
- Rest reduces Fatigue.
- Fatigue must remain between 0 and 100.

Fitness and Fatigue must be tracked separately.

The system must not assume that increasing Fitness automatically removes Fatigue.

### 3.3 Condition display

The Dashboard should make the following information easy to understand:

- Current Fitness.
- Current Fatigue.
- Athlete level and XP progress.
- Current profile.
- Core attributes.
- Current training week.
- Next available training session.

Visual indicators should communicate the athlete's condition without requiring the player to interpret raw numbers alone.

The exact effect of Fitness and Fatigue on race performance must be defined in the race simulation specification before that system is implemented.

---

## 4. TRAINING SYSTEM

### 4.1 Training philosophy

Training is the primary mechanism for developing the athlete.

Each completed training session may affect:

- XP.
- Fitness.
- Fatigue.
- Potentially, attributes through a separately balanced adaptation system.

The player should not receive the same benefits from every session. Different sessions serve different purposes.

### 4.2 Initial weekly plan

The initial training plan is:

| Day | Session |
|---|---|
| Monday | Easy Run |
| Tuesday | Intervals |
| Wednesday | Strength |
| Thursday | Rest |
| Friday | Hills |
| Saturday | Long Run |
| Sunday | Rest |

This is the initial demo plan, not a complete personalized training-plan generator.

The week is simulated: day 1 of every training week is labelled Monday and day 7 Sunday, independent of the real date (owner decision, 1.2).

The plan may be expanded in future milestones.

### 4.3 Training rewards: XP

The XP rewards from the original M1 design are reduced by 10%.

Formula:

`New XP = round(Base XP × 0.90)`

Use conventional rounding to the nearest integer, with half values rounded up.

| Session | Original XP | New XP |
|---|---:|---:|
| Easy Run | 10 | 9 |
| Intervals | 18 | 16 |
| Strength | 12 | 11 |
| Hills | 16 | 14 |
| Long Run | 20 | 18 |
| Rest | 0 | 0 |
| **Weekly total** | **76** | **68** |

The weekly total assumes that each listed session is completed once.

XP is awarded only when the applicable session is completed according to the game's rules. Opening a screen or revisiting a completed session must not award XP again.

Rest must not award training XP unless a future feature explicitly defines a separate reward.

### 4.4 Training rewards: Fitness

Positive Fitness gains are reduced by 50% from the original M1 design.

Formula:

`New Fitness gain = round(Base Fitness gain × 0.50)`

Use conventional rounding to the nearest integer, with half values rounded up.

| Session | Original Fitness gain | New Fitness gain |
|---|---:|---:|
| Easy Run | +3 | +2 |
| Intervals | +5 | +3 |
| Strength | +3 | +2 |
| Hills | +5 | +3 |
| Long Run | +6 | +3 |
| Rest | 0 | −2 (1.2) |

Fitness gains must be capped at 100.

**Revision 1.2:** each Rest day reduces Fitness by 2 (owner decision, 28 October 2026). Rest still grants no XP and still does not reset the inactivity reference (§4.5).

The new values intentionally make Fitness progression slower than in the original M1 prototype.

**Fatigue effects are not changed by this adjustment.** The existing M1 Fatigue values should remain unchanged unless a later balancing decision explicitly modifies them.

Reference values to verify against the source implementation:

| Session | Fatigue effect |
|---|---:|
| Easy Run | +5 |
| Intervals | +14 |
| Strength | +8 |
| Hills | +12 |
| Long Run | +16 |
| Rest | −8 (1.2; was −12) |

These Fatigue values are carried forward from the current design baseline and must be checked against the actual source code before implementation.

**Revision 1.2:** Rest reduces Fatigue by 8 instead of 12 (owner decision, 28 October 2026). With the default weekly plan this adds +39 Fatigue and +9 Fitness per week, so a player who never changes the plan reaches the injury rule (§4.7) in week 3.

### 4.5 Fitness decay through inactivity

Fitness must decrease when the athlete stops training.

Proposed deterministic rule:

- Reduce Fitness by 1 point for every complete 24-hour period without a completed non-rest training session.
- The initial inactivity reference timestamp must be established when the career is created.
- Completing a non-rest training session resets the inactivity reference timestamp.
- Completing a Rest session does not reset the inactivity reference timestamp.
- Fitness cannot fall below 0.
- Fitness cannot rise above 100.
- Multiple elapsed periods must be applied correctly after the player returns to the game.
- The application does not need to remain open for the decay to occur.

Example:

An athlete has Fitness 20 and completes no training for 72 hours. On returning to the game, Fitness becomes 17.

Example:

An athlete has Fitness 20 and completes a non-rest training session. The inactivity reference is reset. If the athlete returns 12 hours later without training again, no full 24-hour period has elapsed since that reference.

The implementation must prevent the same elapsed period from being applied twice.

#### Technical requirements

- Persist the relevant timestamp.
- Calculate elapsed full 24-hour periods using a consistent time basis.
- Apply decay when loading or resuming the career.
- Update the persisted state so repeated application does not double-count elapsed time.
- Handle missing, malformed, or future timestamps safely.
- Do not rely solely on an in-memory timer.
- Avoid changing Fitness merely because the player navigates between screens.

The exact behavior when the athlete has Fitness 0 is straightforward: Fitness remains 0 until training increases it.

### 4.6 Training and the game calendar

The current prototype advances the training week when the player completes a session.

This behavior must remain consistent with the existing implementation until the calendar system is explicitly redesigned.

The real-time Fitness decay rule introduces a second concept: elapsed real-world time.

The implementation must not accidentally apply both real-time decay and duplicate simulated-day decay for the same elapsed period. The PM must decide how the game calendar and real-world time interact before the decay feature is implemented.

**Resolution (M2):** decay uses real elapsed time only; advancing the simulated week never causes decay. The −2 Fitness of a Rest day (1.2) is the Rest session's own effect, not decay.

### 4.7 Injury (1.2)

Owner decision, 28 October 2026.

- Completing a non-rest session that leaves Fatigue **above 95**, measured after the session, injures the athlete.
- Training is never blocked: the player is warned before completing the session and may train anyway.
- The injuring session grants no XP, and Fitness drops by 15 instead of the session's gain (never below 0). The session's Fatigue cost still applies.
- The next 5 days are forced Rest days, carried into the next week if needed. They cannot be changed, and each one applies the normal Rest effects.
- The injuring session still counts as training for the inactivity reference (§4.5).
- An injury never affects attributes.

---

## 5. ATTRIBUTE DEVELOPMENT

### 5.1 Purpose

Training should eventually contribute to long-term attribute development in addition to XP and Fitness.

Attributes must not increase arbitrarily. Each training type should have a defined relationship with the athlete's capabilities.

### 5.2 Proposed training-to-attribute mapping

| Training | Primary attribute | Secondary attribute |
|---|---|---|
| Easy Run | Endurance | Recovery |
| Intervals | Speed | Endurance |
| Strength | Consistency | Recovery |
| Hills | Climbing | Endurance |
| Long Run | Endurance | Consistency |
| Rest | None | None |

This mapping defines training intent, not final numerical gains.

The exact adaptation amount, frequency, probability, and cap behavior must be balanced before implementation.

Rest may improve the athlete's condition through Fatigue recovery, but it must not directly increase attributes under the current design.

### 5.3 Attribute limits

- Minimum attribute: 1.
- Maximum attribute: 100.
- Attributes must remain integers.
- No attribute may exceed 100.
- Training must not produce unbounded attribute growth.

The initial profile values are not permanent caps.

---

## 6. XP, LEVELS, AND ATTRIBUTE POINTS

### 6.1 XP

XP represents the athlete's accumulated progression.

XP is persistent and must not be reset when the player changes profile.

The XP system must support:

- Correct accumulation.
- Level threshold checks.
- Multiple level-ups if a single award crosses multiple thresholds.
- Prevention of duplicate awards for the same completed session.
- Persistent state after refresh or application restart.

### 6.2 Level thresholds

The existing M1 thresholds are:

| Level reached | Total XP threshold |
|---|---:|
| Level 2 | 100 |
| Level 3 | 250 |
| Level 4 | 450 |
| Level 5 | 700 — provisional |

The first three thresholds are carried forward from the M1 implementation. The Level 5 threshold is a provisional extension and must be validated before implementation.

Future thresholds should be defined through a progression curve rather than arbitrary isolated values.

Because training XP is reduced by 10%, the time required to level up will increase. This is intentional, but the complete progression curve must be tested to ensure early progression remains rewarding.

### 6.3 Level-up rewards

Proposed rule:

- Each level gained awards 2 unspent attribute points.
- Each level can award its points only once.
- If the player gains multiple levels at once, all corresponding rewards must be granted.
- Unspent points persist across sessions.
- Unspent points are not lost when changing profile.

### 6.4 Allocating attribute points

The player can spend unspent points to increase attributes.

Rules:

- One point increases one attribute by +1.
- Only attributes below 100 may receive points.
- Spending a point must immediately update the attribute.
- The unspent point balance decreases by the number of points spent.
- Spending must be rejected if the player has insufficient points.
- Points cannot be spent twice through repeated requests or rapid interactions.
- No automatic redistribution is permitted.
- Attribute points cannot be refunded under the current design.

The interface should clearly display current values, available points, and the result of each proposed allocation.

---

## 7. PROFILE CHANGES AND SEASONS

### 7.1 Profile changes

The player may change their profile at the end of each completed season.

Profile changes are not allowed at arbitrary moments during a season.

The rule is intended to let the player adapt the athlete's specialization to future objectives without erasing the athlete's history.

### 7.2 Season definition prerequisite

The season system is not yet fully specified.

Before implementing profile changes, the game must define:

- Season duration.
- Season start and end.
- How a season is completed.
- Whether the player must meet any minimum participation requirement.
- How rankings and rewards are finalized.
- What happens to unfinished races and training plans.
- When the next season becomes available.

Until these rules exist, the end-of-season profile-change feature remains a future design requirement.

### 7.3 Attribute adjustment when changing profile

When a profile change is allowed, attributes should be adjusted relative to the old and new profile baselines.

Formula:

`New attribute = clamp(Current attribute + New profile base - Old profile base, 1, 100)`

Where:

- `Current attribute` is the athlete's actual value before the change.
- `Old profile base` is the starting value for that attribute under the current profile.
- `New profile base` is the starting value for that attribute under the selected profile.
- `clamp` restricts the result to the range 1–100.

Example:

An athlete started as an All-rounder, whose base Climbing value is 16. Through training and progression, the athlete has reached Climbing 24.

The player changes to Climber, whose base Climbing value is 20.

The new Climbing value becomes:

`24 + 20 - 16 = 28`

This approach preserves improvements gained above the original baseline while adjusting the athlete's relative strengths.

The adjustment must be applied to all six attributes.

### 7.4 What profile changes preserve

A profile change must not reset:

- XP.
- Level.
- Unspent attribute points.
- Fitness.
- Fatigue.
- Money.
- Equipment.
- Race history.
- Career history.

The game must show a preview of the resulting attributes and require confirmation before applying the change.

The operation must be atomic: the player must not end up with only some attributes updated if the operation fails.

A profile change should be recorded in the career history.

---

## 8. EQUIPMENT

### 8.1 Initial equipment

The proposed starting equipment is:

- Basic trail-running shoes.
- Basic hydration vest.
- No poles.

Equipment should eventually have meaningful gameplay effects rather than serving only as decoration.

### 8.2 Equipment categories

Future categories may include:

- Shoes.
- Hydration vests.
- Poles.
- Additional equipment categories if justified by gameplay.

Each item should eventually define:

- Name.
- Category.
- Price.
- Unlock requirement.
- Relevant bonuses or penalties.
- Terrain or distance suitability.
- Ownership status.

### 8.3 Equipment balance

Equipment bonuses must interact with race characteristics.

Examples of intended relationships:

- Shoe properties may influence speed, grip, or technical-terrain performance.
- Hydration capacity may influence suitability for long races.
- Poles may improve performance in selected uphill conditions while introducing trade-offs elsewhere.

These are design directions, not final numerical mechanics.

The equipment catalogue, prices, inventory rules, and bonus formulas remain to be specified before implementation.

---

## 9. ECONOMY

### 9.1 Currency

The proposed starting balance is 100 coins.

Money is intended to create meaningful decisions about equipment purchases, race entry fees, and progression.

### 9.2 Potential income sources

Future income sources may include:

- Race participation rewards.
- Race placement prizes.
- Seasonal rewards.
- Other progression rewards defined by the economy design.

### 9.3 Potential expenses

Future expenses may include:

- Race entry fees.
- Equipment purchases.
- Other clearly justified gameplay costs.

### 9.4 Economy rules

The game must not grant or remove money without a defined reason.

All financial transactions should be validated and persisted.

A purchase must not succeed if the player lacks sufficient funds.

The player should receive clear feedback for purchases, rewards, and failed transactions.

The complete economy is not yet specified. Starting money, item prices, prize distributions, and progression costs must be balanced together before the economy is implemented.

---

## 10. RACE SYSTEM

### 10.1 Race purpose

Races are the main competitive objective of the game.

They should test how effectively the player develops and manages the athlete.

A race result should depend on more than the athlete's level alone.

### 10.2 Race data model

Each race should eventually define:

- Race name.
- Location.
- Distance in kilometres.
- Total elevation gain in metres.
- Terrain composition.
- Difficulty or tier.
- Entry fee.
- Cutoff time, where applicable.
- Unlock requirements.
- Rewards and prizes.
- Season or competition association.

Race data should be stored separately from the presentation layer.

### 10.3 Race simulation principles

The preferred direction is a segment-based simulation.

A race can be divided into segments representing different terrain and effort demands, such as:

- Flat or runnable terrain.
- Uphill sections.
- Technical descents.
- Rolling terrain.
- Long sustained climbs.

Each segment should define its distance, elevation characteristics, and terrain difficulty.

The athlete's performance should be influenced by relevant factors, potentially including:

- Relevant attributes.
- Current Fitness.
- Current Fatigue.
- Equipment.
- Distance and elevation.
- Terrain difficulty.
- Race strategy.

The final simulation must be deterministic for the same saved inputs and strategy unless a deliberate random element is introduced.

If randomness is introduced, it must be controlled and sufficiently transparent to make results understandable and testable.

### 10.4 Race strategy

Future gameplay may allow the player to choose a strategy before or during a race.

Possible strategic dimensions include:

- Conservative versus aggressive pacing.
- Effort allocation on climbs.
- Risk tolerance on technical terrain.
- Energy management over long distances.

These options are not yet finalized.

### 10.5 Race outcomes

The future race system should define:

- Finishing time.
- Position.
- Rewards.
- Cutoff success or failure.
- DNF conditions, if applicable.
- Performance feedback.
- Attribute or progression consequences, if any.

The exact formulas for speed, terrain effects, pacing, weather, nutrition, and DNF risk remain undefined.

**Implementation rule:** Do not invent final race-simulation formulas during coding. They must be approved as part of the race-system specification first.

---

## 11. RIVALS, RANKINGS, AND COMPETITION

The game should eventually include simulated rivals so that the player's progression has a competitive context.

Potential systems include:

- Athlete profiles for rivals.
- Race-specific rival performance.
- Race rankings.
- Season standings.
- Progression between competitive tiers.
- Historical results.

Rivals must follow the same broad performance rules as the player's athlete. They should not receive unexplained bonuses solely to force a desired result.

Ranking rules, rival generation, tie-breaking, season points, and promotion or relegation mechanics remain to be specified.

These systems depend on the race and season designs and should not be implemented as disconnected placeholder logic.

---

## 12. CAREER HISTORY AND PERSISTENCE

### 12.1 Persistent state

The career save should eventually include, at minimum:

- Save schema version.
- Athlete identity.
- Current profile.
- Current attributes.
- Level and XP.
- Unspent attribute points.
- Fitness and Fatigue.
- Training plan and completed sessions.
- Training and inactivity timestamps.
- Money.
- Owned equipment.
- Race history.
- Current season and season history.
- Profile-change history.

Not all fields are expected to exist in M1.

The final schema should evolve through explicit migrations rather than silent incompatible changes.

### 12.2 Save integrity

The system must:

- Validate saved values.
- Handle missing or malformed data safely.
- Prevent invalid attribute, Fitness, Fatigue, XP, and currency values.
- Avoid awarding XP or money twice for the same event.
- Persist completed actions reliably.
- Support schema migrations where necessary.

### 12.3 Browser-local persistence

M1 currently uses browser-local persistence.

This is suitable for an early prototype, but it does not automatically provide cross-device synchronization or cloud backups.

A future backend may be considered when account systems, cross-device saves, or competitive integrity require it.

Backend selection is a separate technical and product decision.

---

## 13. USER INTERFACE

The interface should prioritize clarity and mobile usability.

### Dashboard

The Dashboard should present the athlete's current state and the next relevant action.

Expected information includes:

- Profile.
- Level and XP progress.
- Fitness.
- Fatigue.
- Attributes.
- Current training week.
- Next training session.

### Training

The Training screen should present:

- Weekly plan.
- Session type.
- Session status.
- Rewards and condition changes.
- Clear action to complete an eligible session.

The interface must prevent accidental duplicate session completion.

### Career

Career is intended to contain long-term progression, season history, and competitive achievements.

Until the relevant systems are implemented, it may remain a clearly marked placeholder.

### Equipment and Races

These screens may remain placeholders until their respective systems are defined and implemented.

A placeholder must not suggest that a transaction, race, or progression feature is functional when it is not.

### Responsive behavior

The product is mobile-first but must remain usable on wider screens.

The layout should adapt to screen width without breaking navigation, cards, or primary actions.

---

## 14. PROGRESSION BALANCE

The design must balance three different time scales:

**Short term:** Training sessions, Fitness changes, and Fatigue management.

**Medium term:** XP, level-ups, attribute points, and equipment progression.

**Long term:** Race results, rival competition, seasons, and athlete specialization.

The game should avoid the following problems:

- Fitness reaches 100 too quickly.
- Fatigue becomes irrelevant.
- Inactivity has no meaningful effect.
- XP progression feels either instantaneous or excessively slow.
- One profile dominates all race types.
- Equipment makes attributes irrelevant.
- Attribute points can be exploited through repeated actions.
- Players can repeatedly collect the same reward.
- Race outcomes are impossible to explain from the athlete's state and strategy.

Any balancing change should be supported by tests or repeatable simulations where appropriate.

---

## 15. IMPLEMENTATION STATUS AND MILESTONES

### 15.1 M0 — Foundation

M0 has been completed.

### 15.2 M1 — Dashboard and Training prototype

M1 has been implemented, validated on mobile, and tested through the Cloudflare Pages preview.

The delivered prototype includes the Dashboard and Training flow, a fixed All-rounder demonstration athlete, a weekly training plan, XP and Fitness progression, Fatigue changes, levels, browser-local persistence, and placeholders for later screens.

The M1 implementation was delivered on branch `ccr-4899c2c5-ikxanb`, commit `dd61ee6`. The main branch was not changed as part of that delivery.

After the owner approved M1, it was merged into `main` with merge commit `e0d8822`.

The delivery report indicated that lint, type-check, tests, and production build passed. Manual mobile checks were also reported as successful.

These are the recorded M1 delivery facts. The repository remains the source of truth for the exact current implementation.

### 15.3 Changes defined by this Bible version

The following requirements revise or extend the original M1 design:

- Choose from four starting profiles.
- Use profile-specific starting attributes.
- Start Fitness at 20/100.
- Reduce training XP rewards by 10%.
- Reduce positive Fitness gains by 50%.
- Add time-based Fitness decay during inactivity.
- Define attribute adaptation by training type.
- Define attribute-point rewards and allocation rules.
- Establish profile changes at the end of a completed season.

These rules are design requirements. Implementation status: profile selection, profile-specific starting attributes, starting Fitness 20, the revised XP and Fitness rewards, time-based Fitness decay and attribute-point rewards and allocation were implemented and accepted in M2. Attribute adaptation by training type and profile changes at the end of a season are not implemented.

Because M1 has already been delivered, the PM must assign these changes to an explicitly named follow-up milestone or approve a deliberate M1 revision before implementation begins.

The developer must not silently modify the delivered M1 scope based only on the presence of these requirements in the Bible.

### 15.4 Suggested follow-up milestone: Athlete Progression

A suitable next milestone could cover:

1. Profile selection during career creation.
2. The four starting attribute distributions.
3. Initial Fitness of 20/100.
4. Revised XP rewards.
5. Revised positive Fitness gains.
6. Persistent inactivity tracking and Fitness decay.
7. Save-state validation and any required migration.
8. Unit and integration tests for progression.
9. Updated Dashboard and Training UI.
10. Manual acceptance checks on mobile and desktop.

The PM should confirm the scope and milestone name before implementation.

**Status (implementation note):** the PM approved this scope as **M2 — Athlete Progression**, including Trail Technique at 11 XP / +2 Fitness / +6 Fatigue (kept out of the weekly plan) and an explicit restart flow for v1 saves instead of a migration. It was formally accepted by the General PM on 28 October 2026 and merged into `main` (merge commit `c1f22a0`, implementation commit `2058f48`); see `DEVELOPMENT.md` §11 and §15.

### 15.5 Later milestones

The following systems require additional design before implementation:

- Attribute adaptation amounts.
- Full equipment catalogue and bonuses.
- Economy and pricing.
- Race catalogue.
- Race simulation and strategy.
- Rivals and rankings.
- Season lifecycle and rewards.
- Profile switching at season end.
- Cloud saves or accounts, if required.

Profile switching depends on the existence of a defined season lifecycle and therefore must not be implemented as an isolated button without those rules.

---

## 16. ACCEPTANCE CRITERIA FOR THE NEW PROGRESSION RULES

These criteria apply when the corresponding follow-up milestone is approved.

### Athlete creation

- The player can select any of the four profiles.
- Each profile initializes the correct attribute values.
- All starting attributes are between 12 and 20.
- Each profile has exactly 96 total starting attribute points.
- Fitness starts at 20.
- Fatigue starts at 0.
- XP starts at 0 and Level starts at 1.

### XP

- Easy Run awards 9 XP.
- Intervals awards 16 XP.
- Strength awards 11 XP.
- Hills awards 14 XP.
- Long Run awards 18 XP.
- Rest awards 0 XP.
- Completing the same session twice cannot award duplicate XP.

### Fitness

- Easy Run grants +2 Fitness.
- Intervals grants +3 Fitness.
- Strength grants +2 Fitness.
- Hills grants +3 Fitness.
- Long Run grants +3 Fitness.
- Fitness never exceeds 100.
- Fitness never falls below 0.

### Inactivity

- Each complete 24-hour period without a non-rest session reduces Fitness by 1.
- Partial periods do not cause premature decay.
- Completing a non-rest session resets the inactivity reference.
- Rest does not reset the inactivity reference.
- Reopening the application does not apply the same decay period twice.
- Decay is correctly applied after several elapsed periods.
- Missing or invalid timestamps do not crash the application or cause unbounded decay.

### Levels and attribute points

- XP crossing a level threshold grants the correct level-up reward.
- Multiple level-ups grant the correct total number of points.
- Unspent points persist after refresh.
- A point increases exactly one attribute by 1.
- An attribute cannot exceed 100.
- Points cannot be spent when none are available.

### Persistence

- The selected profile persists.
- Attributes, XP, Fitness, Fatigue, and unspent points persist.
- New timestamps are stored and validated.
- Existing saves are migrated or handled safely.
- A failed action does not leave a partially updated career state.

### Profile switching

When the season system is implemented:

- A profile change is allowed only at the end of a completed season.
- The player sees the new attribute values before confirming.
- The baseline adjustment formula is applied to all six attributes.
- XP, level, unspent points, Fitness, Fatigue, money, equipment, and history are preserved.
- The profile change is recorded once.
- Repeating or retrying the operation cannot apply the adjustment twice.

---

## 17. SOURCE OF TRUTH AND CHANGE CONTROL

This document defines the intended game-design baseline.

The repository defines what is actually implemented.

When a discrepancy exists:

1. Do not assume the implementation matches this document.
2. Identify the discrepancy.
3. Determine whether it is an implementation defect or an approved design change.
4. Ask the PM to decide the scope if the milestone is unclear.
5. Update the implementation and tests only after the intended behavior is clear.

Before implementing numerical changes, verify the existing source values, particularly in:

- `src/domain/training/sessions.ts`
- `src/domain/athlete/levels.ts`
- The current save-state and persistence modules.
- The current training completion flow.

The development documentation must also be reconciled with this Bible. In particular, `DEVELOPMENT.md §11` was reported to contain an older M1 scope describing equipment purchases, race simulation, and rewards. That section must not contradict the actual delivered M1 or the milestone approved next.

**Final rule:** Claude Code implements approved scope; it does not independently invent missing game mechanics. When a rule is provisional or undefined, it must be reported to the PM before implementation.
