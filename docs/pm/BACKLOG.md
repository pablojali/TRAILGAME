# Backlog

Priority: P0 now, P1 next, P2 later. Streams: **A** Experience, **B** Game systems and backend,
**PM** the PM chat. Items marked **owner** need a decision before anyone codes. Every item should be
confirmed against `main` by the stream that picks it up (the PM built this list from the docs and a
read of the code, not from running the game).

## Owner decisions needed

| ID | Decision | Why it blocks |
|---|---|---|
| ~~D1~~ | ~~Move the PM role from ChatGPT to Claude~~ **Decided 21 Nov 2026: Claude is the PM.** Approving this folder and `CLAUDE.md` happens by merging its PR | Done |
| D2 | Is M4 (Race System) accepted? If not, which part is open? | `STATUS.md` cannot be closed; B-1 depends on it |
| D3 | Native app technology: Capacitor, Expo or Flutter | Blocks M6 and any native-specific work. A web-first game with the current React code points to Capacitor, but the PM wants a technical audit before recommending |
| D10 | **Calibration.** Accept B's proposal (`wear_speed` 1, paid shoes of 200 to 300 km, the same multiplier for race km and training km, the band numbers) or change it, and fill `life_km` in `equipment.csv` | Switching wear on |
| D4 | Fitness and fatigue balance: is the current feel acceptable? | B-2 |
| D5 | Attribute adaptation from training (row 11) and profile change at season end (row 12): in scope for the next release? | B-3 |

## Decided by the owner

| ID | Decision | Date |
|---|---|---|
| D6 | Equipment wears out so coins are spent regularly. All gear (shoes, packs, poles, later the watch) by km, each item with its own life in km, a global `wear_speed` knob (0 = off), a free emergency pair avoids a soft-lock, training km from an owner table. Details in `briefs/B-6a-equipment-wear.md` | 22 Nov 2026 |
| D7 | Shoe durability bands with real consequences (100–40 % normal, 39–20 % slight penalty, 19–10 % heavy, 9–1 % injury risk in training and in a race the shoes keep wearing along the course and break at the aid station where their life runs out, a DNF, 0 % cannot start). DNF: no prize, no ranking points, reduced XP. No equipment changes during a race. Replaces the earlier "worn-out shoes only block entry, no DNF". Details in `briefs/B-6a-equipment-wear.md` and `briefs/B-6b-race-wear-consequences.md` | 22 Nov 2026 |
| D8 | **Starter shoes cost 20 coins** (they were 0), so replacing worn shoes always costs something; the free emergency pair stays (guard in `briefs/B-6c-starter-shoes-emergency-pair.md`) | 22 Nov 2026 |
| D9 | **Majors and race day with worn shoes.** Shoes are checked again at READY. At 0 % (or none equipped) the runner cannot race and the day waits until the player buys shoes or withdraws, which drops the entry and moves on to Monday. If the shoes run out on the last segment the runner finishes | 22 Nov 2026 |

## P0

| ID | Stream | Task | Acceptance |
|---|---|---|---|
| B-6a | B | Equipment wear: durability, bands, training injury risk, entry rules, calibration report (`briefs/B-6a-equipment-wear.md`). Covers B-1 | Brief acceptance criteria; ships with `wear_speed = 0` |
| B-6b | B | Race consequences of worn shoes: penalties, guaranteed DNF, DNF in results and rankings, equipment lock during a race (`briefs/B-6b-race-wear-consequences.md`), after B-6a | Brief acceptance criteria |
| A-5 | A | Equipment wear screens and DNF display (`briefs/A-5-wear-screens.md`), after B-6b | Brief acceptance criteria |
| PM-1 | PM | Fix the stale status text listed in `STATUS.md` (README, `DEVELOPMENT.md` header, M4 and M7 sections, `M4_VALIDATION.md`) | Each document matches `main`; no content is removed, only status lines and the Roles table (after D1) |
| B-1 | B | **Folded into B-6a (22 Nov 2026).** Confirm the state of the M4 balance finding by re-running the season simulation against current values; write the result in `docs/` and in `log/B.md` | A short report: finding closed or still open, with numbers. No balance change without owner approval (D4) |
| A-1 | A | Responsive test checklist (M3): document a repeatable manual checklist and run it at 360x640, 412x915, tablet and desktop on every main screen | A checklist file in `docs/`, a list of layout defects found (not all fixed in this task) |

## P1

| ID | Stream | Task | Acceptance |
|---|---|---|---|
| A-2 | A | PWA release candidate (M5): manifest, icons (192 and 512, maskable), install behaviour, offline fallback that clearly handles unsaved actions, iOS Safari notes | `DEVELOPMENT.md` M5 criteria; Lighthouse PWA check documented; tested on a real Android phone by the owner |
| A-3 | A | Fix the layout defects from A-1, ordered by severity | Each defect closed or explicitly deferred |
| B-2 | B | Fitness/fatigue balance work, after D4 | Simulation shows a sustainable gain path for a sensible player; values live in the existing tables or config, not in screens |
| B-3 | B | Attribute adaptation from training and profile change at season end, after D5 | Specification written first and approved by the owner, then implemented with tests |
| B-4 | B | Review `EQUIPMENT_BALANCE_REVIEW.md` against current values and refresh its numbers | Updated document; proposals only, no value changes without approval |

## P2

| ID | Stream | Task | Notes |
|---|---|---|---|
| B-5 | B | Technical audit for native packaging (input for D3): build setup, plugins needed, save and sign-in behaviour inside a WebView, store requirements for both platforms | Report only. No code in the repository until D3 |
| A-4 | A | Native-shell work after D3 (splash, safe areas, back button, store assets) | Starts after B-5 |
| PM-2 | PM | Strava / VTL scope and permission review (M8) | Only when the core is stable |

## Ideas parked by the owner (not scheduled)

- Equipment screen redesign: vertical cards for what is equipped, gels and cereal bars, a shop styled as
  collectible cards that open large on tap. The owner has a separate Claude Code prompt for it; check
  whether it was already implemented before scheduling anything.
- Avatar layers: the owner is drawing the layers (body, hair, shirt, shorts, shoes). Check
  `docs/AVATAR_ART_SPEC.md` and `assets/runner/**` for which are already in the game.
