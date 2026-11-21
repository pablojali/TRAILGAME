# PM coordination — how the two Claude Code sessions work together

**Status:** proposed on 21 November 2026, pending owner approval (see decision D1 in `BACKLOG.md`).

This folder is the single source of truth for who works on what. Two Claude Code sessions (streams
**A** and **B**) work on this repository in parallel; the PM (Claude, in a separate chat) plans, writes
briefs and reviews. The owner decides product direction and approves merges.

## Roles

| Who | Does |
|---|---|
| Owner | Product decisions, testing on the phone, approves merges, owns `src/data/*.csv` and `assets/**` (edited through Trail Studio) |
| PM (Claude chat) | Backlog, briefs, acceptance criteria, reviews PRs and writes findings to the owner. Does not write game code |
| Session A (Experience) | See `briefs/stream-A.md` |
| Session B (Game systems and backend) | See `briefs/stream-B.md` |

## Rules for both sessions

1. **Read first:** this file, `STATUS.md`, `CONTRACTS.md`, your brief, then the code you will touch.
2. **Stay inside your stream's files** (ownership table in `CONTRACTS.md`). If you need a change in the
   other stream's area, do not make it: write a request in `log/` and tell the owner.
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

## Review flow

1. Session opens a PR and adds a log entry.
2. The owner pastes the PR link in the PM chat (or the PM reads open PRs directly).
3. PM reviews against the brief and the Definition of Done and posts findings as a PR comment.
4. The owner tests the deployed build and approves the merge.
