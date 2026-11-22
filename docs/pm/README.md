# PM coordination — how the two Claude Code sessions work together

**Status:** the PM role and the merge policy below were decided by the owner on 21 November 2026.

This folder is the single source of truth for who works on what. Two Claude Code sessions (streams
**A** and **B**), each on one topic at a time, work on this repository; the PM (Claude, in a separate chat)
plans, writes briefs, reviews and merges. The owner decides product direction and tests what is merged.

## Roles

| Who | Does |
|---|---|
| Owner | Product decisions, tests the merged build on the phone, owns `src/data/*.csv` and `assets/**` (edited through Trail Studio) |
| PM (Claude chat) | Backlog and queue, briefs, acceptance criteria, reviews PRs and **merges them** (see "Review and merge"). Does not write game code |
| Session A (Experience) | See `briefs/stream-A.md` |
| Session B (Game systems and backend) | See `briefs/stream-B.md` |

## One topic at a time

The owner does not want a session overloaded. Each session works on **one topic at a time**: one brief,
one branch, one PR. It does not start the next item until the PM assigns it. The order lives in
`QUEUE.md`. The game is closed to testers, so the aim is an orderly flow, not maximum parallelism.

**Intake:** when the owner has an idea (an interface change, a rule, a bug), they tell the PM in the
PM chat. The PM turns it into a brief with acceptance criteria, puts it in `QUEUE.md` and the owner
pastes the brief into a Code session. Ideas are never dictated to a Code session while it is mid-topic.

## Rules for both sessions

1. **Read first:** this file, `STATUS.md`, `CONTRACTS.md`, your brief, then the code you will touch.
2. **Stay inside your stream's files** (ownership table in `CONTRACTS.md`). It matters when both sessions
   run at the same time; if you need a change in the other stream's area, write a request in `log/`
   instead of making it. When only one session is active, the PM may assign it work from either stream.
3. **One topic per branch and PR.** Branch names: `stream-a/<topic>` and `stream-b/<topic>`. Rebase on
   `main` before opening the PR: `main` moves on its own (see "Things that change under you").
4. **Definition of Done** is section 12 of `DEVELOPMENT.md`; `npm run check` must pass.
5. **Do not mark a milestone complete.** Only the owner does.
6. **Report in your own log file** (`log/A.md` or `log/B.md`), newest entry at the top: date, what was
   done, files changed, checks run, manual test steps, open questions. Never edit the other stream's log.
7. **Ask instead of guessing** when a task touches a decision marked "owner" in `BACKLOG.md`.

## Things that change under you

- **Trail Studio branches** (`studio/*`): the owner's table and art edits arrive as PRs and merge into
  `main` at any time. They only touch `src/data/*.csv`, `assets/**` and `src/data/courses/**`.
- **CI commits to `main`** ("Rebuild career-ops bundle and prepared art"): it regenerates
  `supabase/functions/*/index.js` and prepared art. **Never hand-edit those files.** On a conflict in
  them, take `main`'s version and let CI rebuild.
- Both mean: `git fetch` and rebase before every push, and re-run `npm run check` after rebasing.

## Review and merge

1. The session opens a PR and adds a log entry.
2. The PM reviews it against the brief and the Definition of Done and posts the findings as a PR comment
   (the owner can paste the PR link in the PM chat, or the PM reads the open PRs directly).
3. **The PM merges the PR when** the CI is green, the PR does what the brief asked and nothing more, and
   it needs no owner decision (no balance value changed without approval, no milestone declared complete).
   If anything fails, the PM leaves comments and the session fixes it.
4. **The owner tests after the merge**, on the deployed build, and reports what they see to the PM.
   A problem becomes a fix item in `QUEUE.md`; a bad merge is undone with a revert PR.
5. Decisions that are the owner's (balance values, milestone acceptance, new product scope) are asked
   before merging, not after.

Merging to `main` deploys the Edge Functions to Supabase through CI. Today that is acceptable because the
game is closed to testers; revisit this policy before any public release.
