# Brief B-6d — Rewarded ad for 20 coins

**Owner decision (22 Nov 2026): B-6c rework, B-6d and A-5 are done together in one task, one PR, on the branch of PR #130 (`stream-b/starter-shoes-emergency-pair`), no splitting into parts.** Work in this order inside it, one commit per step: 1 remove the emergency pair, 2 this brief, 3 `A-5-wear-screens.md`. The log gets one entry for the whole task. Read
`docs/pm/README.md`, `docs/pm/CONTRACTS.md` and `docs/pm/briefs/B-6c-starter-shoes-emergency-pair.md`. Server work first, then screens.

## Owner decision D11 (22 November 2026)

- A runner who **cannot race** (no equipped or owned pair above 0 %) and has **fewer coins than the cheapest pair for
  sale** (today 20) can watch a **rewarded ad** and receive **+20 coins** to buy the basic pair.
- **At most 2 coin-granting ads per real day** (server clock, UTC day). Further ads can still be watched (the owner
  earns from them) but **give no coins**, and the screen must say so before the ad starts.
- If an ad cannot be shown (offline, no ad available, blocker) the runner gets **nothing** and may retry later.
- The game is closed to testers: build a **simulated ad provider** now. The real network (AdMob in the native app, D3)
  is a later task. The provider must be one replaceable interface.

## What to build

1. A server operation in `career-ops` (for example `claim-ad-reward`) that the client calls **after** the provider
   reports a completed ad. The server decides: eligibility (wear on, no raceable pair, coins < cheapest price),
   today's count, the 20 coins, and the response (`granted` or `no-reward` with the reason `daily-limit` or
   `not-eligible`). Never trust the client's count.
2. Save fields: the real day of the last reward and the count for that day (optional, older saves load unchanged).
   The reward amount (20) and the daily limit (2) live in `src/data/economy.csv`, not in code.
3. The provider interface on the client with a simulated implementation for tests and testers. Leave a documented
   place for the real network and its **server-side verification** of the completed ad (a client-only claim is
   forgeable); do not build it.
4. Everything is active only when `wear_speed > 0`.

## PM reading of the decision (owner can widen)

The ad offer is shown **only while the runner is stuck** (no raceable pair and fewer coins than the cheapest pair), not
as a general coin button. If the owner wants rewarded ads elsewhere (shop, double race prize), that is a new topic.

## Out of scope

The real ad network, consent screen (GDPR, store rules), the screen design (A-5 or a follow-up), any other ad
placement.

## Acceptance criteria

- [ ] Two rewards per real day, the third gives no coins and says `daily-limit`; the next real day resets.
- [ ] No reward when the runner can race or has 20 coins or more.
- [ ] The server rejects a forged claim (no completed ad in the provider's report in the simulated provider).
- [ ] Old saves load unchanged; `wear_speed = 0` leaves everything as before.
- [ ] Tests for the limit, the day change, eligibility and the economy values; `npm run check`.
- [ ] Log in `docs/pm/log/B.md`, including what the real network will need.
