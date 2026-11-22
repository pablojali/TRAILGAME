# Brief A-5 — Equipment wear: screens

**Depends on:** B-6a merged. Do not start before the PM assigns it. Read `docs/pm/README.md` and
`docs/pm/CONTRACTS.md`; one branch (`stream-a/wear-screens`), one PR.

## Goal

Show the player how worn their gear is, let them replace it, and explain why a race entry is blocked.
You display what the server returns; you never compute wear or decide who can enter.

## What to build

1. **Equipment screen:** every item that wears shows a wear bar with a percentage and a state (good, worn,
   worn out). Colour is never the only signal. A worn-out item looks clearly worn out and has a **Replace**
   button with the price; replacing uses the server operation from B-6a, with a confirmation that shows the
   price and the balance after. Items that do not wear look as today.
2. **Race Detail / entry:** when the server refuses entry because every pair of shoes is worn out, the entry
   button is inactive and the screen says why, with a link to Equipment. When the free emergency pair is
   granted, the player is told what happened.
3. **Inbox:** notifications when an equipped item reaches about 80% and when it is worn out (built from the
   career on the device, like the existing ones; each opens Equipment).
4. **Dashboard avatar:** no change unless the item layer needs one; ask the PM before changing the avatar.
5. **Language texts:** every new text in English, Spanish, French, Italian and German, in the existing
   language files (the parity test must pass).

## Rules

Mobile first, no vertical scroll on the main screens, touch targets of at least 48x48 px, loading and error
states for the replace action. No game value in a screen.

## Acceptance criteria

- [ ] Wear bar, percentage and state on every item that wears, readable without colour.
- [ ] Replace works end to end, with confirmation, and the balance updates.
- [ ] A blocked entry explains the reason and links to Equipment.
- [ ] Inbox shows the 80% and worn-out notifications once each.
- [ ] Five languages; `npm run check` passes; tested at 360x640 and 412x915.
- [ ] Log in `docs/pm/log/A.md`.
