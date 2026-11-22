# Queue

The order of work, kept by the PM. **One Code session for now**, one topic at a time. When a topic's PR is
merged, the PM moves the next one up and tells the owner what to paste into the session.
The streams A and B in `README.md` are areas of work; with one session they are simply topics in this list.

Last updated: 22 November 2026 (D11, rewarded ad instead of the emergency pair).

| Position | Topic | Brief | State |
|---|---|---|---|
| Now | **Owner: switch wear on.** Set `wear_speed` to 1 in `economy.csv` (via Trail Studio) and test with the testers. Packs and poles still have no `life_km` | `docs/EQUIPMENT_WEAR_CALIBRATION.md` | Owner decision. Nothing for Code until then |
| Later | A-1 Responsive checklist and defect list | `BACKLOG.md` | Needs a brief |
| Later | A-2 PWA release candidate | `BACKLOG.md` | After A-1 |
| Waiting | B-2 Fitness/fatigue balance (D4), B-3 attribute adaptation (D5) | `BACKLOG.md` | Owner decisions |

## Owner's ideas not yet briefed

Life in km for each shoe model, the packs and the poles (owner fills the table); the watch when it is added.

## Merged

- 22 Nov 2026: PR #130 B-6c + B-6d + A-5 in one task: starter shoes at 20 coins (emergency pair dropped, D11), rewarded ad for 20 coins (2 per real UTC day, simulated provider), all wear screens in 5 languages. Shipped dark (`wear_speed = 0`).
- 22 Nov 2026: PR #127 B-6b worn shoes in races (wear per segment, DNF at the aid station, equipment lock, race day waits for buy-or-withdraw, DNF is not a finished race), shipped dark. Review fixes applied by Code.
- 22 Nov 2026: PR #122 PM coordination folder and briefs.
- 22 Nov 2026: PR #125 B-6a equipment wear, shipped dark (`wear_speed = 0`, every `life_km` empty). Also closed B-1: the report says the M4 balance finding is closed (owner decision D2 still open).
