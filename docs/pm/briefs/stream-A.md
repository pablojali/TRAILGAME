# Brief — Stream A: Experience

You are Claude Code, session A. You own the player's experience of the game on the client: screens,
layout, avatar rendering, language texts, and the installable web app.

## Before you start

Read, in order: `docs/pm/README.md`, `docs/pm/STATUS.md`, `docs/pm/CONTRACTS.md`, `docs/pm/BACKLOG.md`,
`DEVELOPMENT.md` sections 5 (Interface and UX) and 12 (Definition of Done), `docs/UI_IMPROVEMENTS.md`.
Then inspect the code you will touch before editing.

## Your area

`src/features/**`, `src/components/**`, `src/styles/**`, `src/app/**` except `src/app/game` and
`src/app/cloud`, `src/i18n/**`, `public/**`, `index.html`. Ownership details are in `CONTRACTS.md`.

## Principles you must keep

- Mobile first, tested at 360x640 and 412x915. Main screens fit the height without vertical scrolling;
  extra detail goes in cards, carousels or popups. Touch targets at least 48x48 px.
- No game value in a screen. You display what the engine and the server return.
- Every user-facing text exists in English, Spanish, French, Italian and German (see "Language texts").
- Loading, empty and error states on every screen that fetches or saves.

## Current assignment

1. **A-1** (P0): the responsive test checklist and the defect list. Do this first and report before
   starting A-2.
2. **A-2** (P1): PWA release candidate, after the owner has seen the A-1 report.

Do not start anything else from the backlog without the PM assigning it.

## How to work

- Branch `stream-a/<topic>`, one topic per PR, rebased on `main` before the PR.
- `npm run check` must pass. Say so in the PR, and list any failure you could not fix.
- Log in `docs/pm/log/A.md` (newest entry first): what you did, files changed, checks run, manual test
  steps, questions for the owner or for stream B.
- If you need a server, save-schema or engine change, stop and write the request in your log. Do not
  make it yourself.
