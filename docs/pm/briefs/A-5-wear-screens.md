# Brief A-5 — Equipment wear: screens

**Depends on:** B-6a and B-6b merged. Do not start before the PM assigns it. Read `docs/pm/README.md` and
`docs/pm/CONTRACTS.md`; one branch (`stream-a/wear-screens`), one PR.

## Goal

Show the player how worn their gear is and what that means, let them replace it, warn them before a race that
will end in a DNF, and explain every block. You display what the server returns; you never compute wear, bands
or who can start.

## What to build

1. **Equipment screen:** every item that wears shows a durability bar, the percentage, the band label and the
   remaining life in game km, for example "Durability left: 108 km of 150 km" (the effective life is
   the server's figure; do not recompute it). Bands are readable without colour. A worn-out item looks clearly
   worn out and has a **Replace** button with the price and a confirmation that shows the balance after. Items
   that do not wear look as today. While a race is in progress the screen is read-only and says why.
2. **Race Detail / entry:** when the server refuses entry (shoes at 0 % or none equipped), the button is
   inactive and the screen says why, with a link to Equipment. When the server predicts that the shoes will not
   last the race, the entry confirmation shows a **clear warning** that names where the runner will retire
   ("Your shoes will break at aid station 3, about km 18: DNF, no prize or ranking points") and needs an
   explicit confirmation. When the shoes will last, show their durability after the race if the server sends it.
   When the free emergency pair is granted, the player is told what happened.
3. **Race run and results:** the DNF appears in the live view (where the runner leaves), in the result screen
   and in the rankings lists, after the finishers. The result explanation mentions the shoes' effect.
4. **Training:** if the equipped shoes are in the 9–1 % band (or at 0 %), the Training screen shows a short
   warning that each session carries an injury risk, without naming the number if the server does not send it.
5. **Inbox:** notifications when an equipped item reaches about 40 %, 20 % and 10 %, at 9–1 %, and when it is
   worn out (built from the career on the device like the existing ones; each opens Equipment).
6. **Dashboard avatar:** no change unless an item layer needs one; ask the PM before changing the avatar.
7. **Language texts:** every new text in English, Spanish, French, Italian and German, in the existing language
   files (the parity test must pass).

## Rules

Mobile first, no vertical scroll on the main screens, touch targets of at least 48x48 px, loading and error
states for the replace action. No game value in a screen.

## Acceptance criteria

- [ ] Durability bar, percentage, band and remaining life on every item that wears, readable without colour.
- [ ] Replace works end to end, with confirmation, and the balance updates.
- [ ] A blocked entry explains the reason and links to Equipment.
- [ ] Whenever the server predicts the shoes will not last the race, a warning names the aid station and km where
      the runner will retire, and confirming needs an explicit tap.
- [ ] A DNF shows correctly in the live view, the result and the rankings.
- [ ] Equipment is read-only during a race, with the reason shown.
- [ ] Inbox notifications appear once per threshold.
- [ ] Five languages; `npm run check` passes; tested at 360x640 and 412x915.
- [ ] Log in `docs/pm/log/A.md`.
