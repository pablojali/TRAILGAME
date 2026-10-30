# Supabase setup (M7)

**Status (30 October 2026, Phase 2C):** players get an anonymous Supabase identity, can link it
to email or Google, and their career is saved on the device and in the cloud, restored on another
device and protected against silent overwrites (see Phase 2C below).

## What exists

| Part | File |
|---|---|
| Configuration: reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, refuses secret keys | `src/repositories/supabase/supabaseConfig.ts` |
| The one shared client, created on first use; `null` when not configured | `src/repositories/supabase/supabaseClient.ts` (`getSupabaseClient()`) |
| Connection check (no sign-in, no tables) | `npm run supabase:check` (`scripts/check-supabase.mjs`) |
| Configuration from the build environment | `src/repositories/supabase/supabaseEnv.ts` |

Supabase lives in the repository layer only. `src/domain` and `src/game-engine` never import it
(checked by `src/architecture/layers.test.ts`). The library is a separate chunk loaded after the
game has started, and only when Supabase is configured.

## Connect a project (owner steps)

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough).
2. In the project: **Project Settings → API**. Copy the **Project URL** and the **anon / publishable
   key**. Do **not** copy the `service_role` or secret key: it must never be in the app.
3. Local development: copy `.env.example` to `.env.local` and fill in both values. `.env.local` is
   ignored by Git.
4. Check the connection: `npm run supabase:check` prints `Supabase connection OK` (it calls the
   Auth health endpoint with the anon key).
5. Deployment (Cloudflare Pages): add the same two variables under the project's environment
   variables. They are read at build time.

If the variables are missing or invalid, the game starts and plays exactly as before. A
`service_role` or `sb_secret_` key is refused even if it is set.

## Phase 2A: database and anonymous sign-in

### Owner steps in the Supabase dashboard

1. **Migration:** applied to the project on 30 October 2026 through the Supabase connector
   (version 20261030170516, the file's name). Verified there: RLS on all five tables, two test
   players isolated from each other, client writes refused, anon refused (test data rolled
   back). Future migrations: `supabase db push`, or the SQL Editor for a single file.
2. **Enable anonymous sign-ins:** **Authentication → Sign In / Providers → Allow anonymous
   sign-ins** (on).
3. Recommended against abuse (anonymous accounts can be created by anyone with the public key):
   **Authentication → Rate Limits** (keep the default limit on anonymous sign-ins), and later a
   CAPTCHA (**Authentication → Attack Protection**). Old unused anonymous users can be cleaned up
   later with a scheduled job.

Supabase's security advisor reports one expected warning: `create_my_career` is a
`security definer` function signed-in players can call. That is its purpose (the only way to
create a career); it checks the caller and accepts only a brand-new career.

### How to check it worked

- **Table Editor:** the five tables `profiles`, `careers`, `race_entries`, `owned_equipment` and
  `coin_transactions` exist, each with "RLS enabled".
- Open the deployed game in a private window and start a new career. In **Authentication →
  Users** a new user appears marked *Anonymous*; in **Table Editor → careers** one row appears for
  it, with the new career in `game_state`. Reloading the game creates no second user or career.
- An existing player (a career already on the device) gets an anonymous user but no remote
  career: their local career will be imported in Phase 2C.

### What it does

| Part | File |
|---|---|
| Tables, RLS policies and `create_my_career` | `supabase/migrations/20261030170516_player_foundation.sql` |
| Anonymous sign-in and remote career creation | `src/repositories/supabase/playerIdentity.ts` |
| Database checks on a local PostgreSQL | `npm run db:test` (`scripts/test-db.sh`, `supabase/tests/`) |

- **Tables:** `profiles` (one per auth user), `careers` (one per user: `user_id` is unique;
  `game_state` is the GameState snapshot the app's save parser reads; `schema_version`;
  `version` for later concurrency checks), `race_entries` (unique per career and game entry id),
  `owned_equipment` (career + item), `coin_transactions` (ledger, empty for now: no history is
  invented from current balances). Deleting a user deletes all of their rows.
- **RLS:** players can only **read** their own profile, career, race entries, equipment and coin
  transactions. Clients cannot insert, update or delete anything; signed-out visitors cannot read
  anything. Writes go through server-side code only.
- **`create_my_career(initial_state, initial_schema_version)`:** a `security definer` function
  that creates the caller's profile and career once and returns the career (also on later calls,
  which create nothing). It accepts only a brand-new career (Level 1, 25 coins, week 1, no races,
  starter shoes), so it cannot be used to plant progress.
- **In the app:** at startup the game reuses the stored Supabase session (key `trailgame.auth`)
  or signs in anonymously once; simultaneous starts share one sign-in. Failures (offline,
  Supabase down) are retried in the background (2 s, doubling up to 60 s) and never block play.
  Starting a new career calls `create_my_career` with that career; the local save is never read,
  changed or deleted by any of this. The Supabase library loads after the game's first screen.
- **Account linking later** (email, Apple, Google) will link the identity to the same anonymous
  user, so the user id, career id and all progress stay the same.

## Phase 2B: linking the guest account (email, Google)

**Settings → Account** shows whether the player is a guest (anonymous) or has a linked account,
and links an email or a Google account to **the same Supabase user**: the user id, profile,
career and local progress stay as they are. It is optional and never blocks play.

| Part | File |
|---|---|
| Linking service (status, email, password, Google, redirect check) | `src/repositories/supabase/accountLinking.ts` |
| Shared client loader (one client for identity and linking) | `src/repositories/supabase/supabaseLoader.ts` |
| Account card in Settings | `src/features/settings/AccountCard.tsx` |

- **Email:** `updateUser({ email })` on the signed-in guest; Supabase emails a confirmation link
  (back to `/settings`). Until it is opened the account stays a guest ("Check your inbox"). Once
  confirmed the account is permanent and the card offers an optional password (`updateUser({
  password })`, at least 8 characters; Supabase only allows a password after the email is
  confirmed). An email that belongs to another account is refused (`email_exists`): accounts are
  never merged and neither career changes.
- **Google:** `linkIdentity({ provider: 'google' })` from the current session. Before leaving, the
  app remembers the user id in sessionStorage (no tokens); on return to `/settings` it asks the
  Auth server for the user (`getUser`) and reports success only if it is the same id and now has a
  Google identity. A Google account already linked to another player (`identity_already_exists`),
  a cancelled sign-in or any other error leaves the guest account as it was.
- **Apple:** not offered yet (no Apple configuration). The service accepts `apple` for
  `linkIdentity`, so adding it is configuration plus one button (see below).
- **Sign out:** the service has it, but Settings does not offer it yet: there is no sign-in screen,
  so a player who signed out could not get back to their account on this device.
- Nothing here touches the local save, creates a career or writes game data; passwords and tokens
  are passed to Supabase and never stored or logged by the app.

### Owner steps in the Supabase dashboard (Phase 2B)

1. **Allow manual linking** (required for both email and Google on a guest): **Authentication →
   Sign In / Providers → "Allow manual linking"** (also called Enable Manual Linking) → on.
2. **Email provider:** on (default), with **Confirm email** on (default; keep it on).
3. **Email delivery:** the built-in email service only sends to the project's team members
   (others get "Emails cannot be sent to that address yet") and only a few per hour. For real
   players, set up **custom SMTP** (Authentication → Emails → SMTP Settings; e.g. Resend, Brevo,
   Postmark) and then raise **Authentication → Rate Limits → emails per hour**.
4. **URL Configuration** (Authentication → URL Configuration):
   - **Site URL:** `https://trailgame-f01.pages.dev`
   - **Redirect URLs:** `https://trailgame-f01.pages.dev/**`, `https://*.trailgame-f01.pages.dev/**`
     (Cloudflare preview deployments), `http://localhost:5173/**` (`npm run dev`) and
     `http://localhost:4173/**` (`npm run preview`).
5. **Google** (Authentication → Sign In / Providers → Google):
   - In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type
     **Web application**. Authorized redirect URI:
     `https://zalyfrjfmsirvsrkdroy.supabase.co/auth/v1/callback`. Authorized JavaScript origins:
     `https://trailgame-f01.pages.dev`. Set up the OAuth consent screen (app name, support email).
   - Paste the **Client ID** and **Client Secret** into Supabase's Google provider and enable it.
     The secret stays in Supabase; it is never in the app.
6. **Apple (later):** an Apple Developer account; a **Services ID** (web) with the return URL
   `https://zalyfrjfmsirvsrkdroy.supabase.co/auth/v1/callback`, a **Sign in with Apple key**
   (.p8), the Team ID and Key ID. In Supabase's Apple provider, add the Services ID and the
   generated client secret (it expires every 6 months and must be renewed). Apple requires Sign
   in with Apple in iOS apps that offer Google, so it is needed before the App Store release.

## Phase 2C: cloud saves, restore on another device, conflicts

**The career is saved on the device first and then in the cloud.** Play never waits for the
network; the cloud copy is a backup and the way to play on another device. It is **not
anti-cheat**: the values come from the client and must not be trusted for future competitive
features (that needs server-side game operations).

| Part | File |
|---|---|
| `save_my_career`, snapshot checks, mirror of race entries and equipment | `supabase/migrations/20261030200000_career_sync.sql` |
| Sync engine (decide, upload, retry, conflicts; no Supabase inside) | `src/repositories/cloudSync.ts` |
| Supabase career store (read own row, write through the function) | `src/repositories/supabase/supabaseCareerStore.ts` |
| Wiring | `src/repositories/supabase/cloudSave.ts`, `src/app/game/GameProvider.tsx` |
| Cloud indicator, conflict dialog, restore notice | `src/app/cloud/` |
| Cloud save card, sign-in to an existing account | `src/features/settings/` |

### Persistence architecture

- **One active GameState** (in `GameProvider`). Every change is saved to localStorage first (the
  save queue); every successful local save is then handed to the cloud sync.
- **Cloud copy:** the whole snapshot in `careers.game_state`, written only through
  `save_my_career(snapshot, schema_version, base_version)` (security definer). It checks the
  shape and schema version, writes only the caller's career, and saves **only if `base_version` is
  the cloud's current version**; otherwise it writes nothing and returns the current version.
  `race_entries` and `owned_equipment` are rewritten from the snapshot in the same transaction, so
  they always match it. `coin_transactions` stays empty (no server-side coin operations yet).
- **Device record** (`trailgame.sync` in localStorage, per user): the cloud version the device
  last synced with, a fingerprint of that career and whether local changes are pending.

### At startup

The local career is played at once. Then, in the background, it is compared with the cloud:

| Device | Cloud | What happens |
|---|---|---|
| Career | None | Uploaded as the cloud career (first migration). Confirmed before marked synced. |
| None | Career | Restored (after checking its schema version and content); no new career is offered. With no local career the game waits up to 3 s for it on the loading screen. |
| Same career | Same career | Nothing to do. |
| Changed since last sync | Unchanged since last sync | The device's career is uploaded. |
| Unchanged since last sync | Changed (another device) | The newer cloud career replaces it, with a notice. |
| Different, both changed or never synced here | | **The player chooses** (dialog). |
| None | None | A new career; uploaded (created once) when started. |

Careers created in Phase 2A (an untouched Level 1 copy of the same runner in the cloud) are simply
replaced by the device's progress, without asking. A damaged or unsupported cloud copy is never
loaded: if the device has a career, the dialog offers to keep it.

### Conflicts

The dialog shows both careers (runner, level, week, coins, races) and needs an explicit choice;
careers are never mixed. **Keep this device's career** replaces exactly the cloud version shown
(if the cloud changed again meanwhile, nothing is written and the new difference is shown).
**Keep the cloud career** plays it on the device; the replaced local career is kept as a copy in
`trailgame.save.backup`. Until the choice is saved both careers are unchanged; uploads pause.

### Ongoing sync, offline and retries

- Uploads are debounced (2 s; rapid saves become one upload), one at a time, each on the version
  the previous one returned, so an older snapshot cannot overwrite a newer one.
- A refused upload (another device wrote first) is never forced: the cloud is read again and, if
  the careers differ, the player chooses.
- Offline: play and local saves continue; the indicator shows "pending"; retries after 5 s,
  doubling up to 5 min, and immediately when the browser is back online, when the app becomes
  visible again, from **Settings → Cloud save → Retry now**, or at the next startup (the pending
  flag is stored).

### Accounts and devices

- **Guest (anonymous):** saved locally and in the cloud. If the browser's data is lost, a guest
  account cannot be recovered on another device; linking it (Settings → Account) makes it
  recoverable.
- **Linked account on another device:** **Settings → Account → Sign in to an existing account**,
  or on a new device the career screen's **"Already playing on another device? Sign in"** (Google
  or email + password). The account's cloud career is restored; if the device already has a
  different career, the player chooses.
- **Reset demo** starts a new career that then replaces the one in the cloud (the confirmation
  says so).

### Supabase configuration

- Migration `20261030200000_career_sync.sql` (applied by the owner in the SQL Editor on 30 October
  2026, then verified with the connector). No dashboard setting is needed beyond Phases 2A–2B.
- Security advisor: `save_my_career` and `create_my_career` are security definer functions that
  players may call (intended: they are the only ways to write a career, and they check the
  caller). "Anonymous access policies" are intended (guests are players reading their own rows).
  Optional: enable **leaked password protection** (Authentication → Password security).
- `create_my_career` is no longer used by the app (the sync creates careers); it can be removed in
  a later migration.

## Phase 3B.1: server-authoritative progression

The server now owns progression. Training days, race days and attribute points run in the
Edge Function `career-ops`, which reuses the game's TypeScript engine (`src/game-engine`), so no
formula exists twice. Clients can no longer write career snapshots.

### What lives where

| Piece | Where |
| --- | --- |
| `career_operations` table and `commit_career` (service role only) | `supabase/migrations/20261031090000_server_authority.sql` |
| Removal of `save_my_career` and `create_my_career` | `supabase/migrations/20261031090100_revoke_client_writes.sql` |
| Request handling (pure, tested without Supabase) | `src/server/careerOps.ts` |
| Supabase access (auth check, REST reads, `commit_career`) | `src/server/supabaseRest.ts` |
| Edge Function entry (`Deno.serve`, CORS) | `src/server/edge/careerOpsFunction.ts` |
| Deployable bundle (generated, do not edit) | `supabase/functions/career-ops/index.js` (`npm run build:functions`) |
| Client call | `src/repositories/supabase/careerOpsClient.ts`, `src/app/game/GameProvider.tsx` |

### Actions

`POST /functions/v1/career-ops` with the player's session token and a JSON body:

- `train` `{operationId, baseVersion, ref, session, snapshot?}`: completes today's training day.
- `race` `{operationId, baseVersion, ref, entryId, snapshot?}`: runs today's race.
- `allocate` `{operationId, baseVersion, attribute, expectedSpent, snapshot?}`: spends one point.
- `save` `{baseVersion, snapshot}`: uploads the fields the player may change (cloud sync).
- `new-career` `{baseVersion, profile, identity}`: creates (or replaces) the career on the server.

Every answer has the career the server holds afterwards (`state`, `version`). A refusal of a game
rule (for example `day-completed`) is HTTP 422 with the server's career, so the device catches up.

### How a progression request is checked

1. The token is checked with Supabase Auth (`/auth/v1/user`); the user id comes only from it.
2. The request shape is checked (operation id must be a UUID).
3. An operation id already used is answered with the stored response (never re-applied); one used
   by another player is refused (403).
4. The player's career is loaded and parsed with the game's own save parser.
5. Only when the device saw the current version (`baseVersion`) are its own fields taken from the
   attached snapshot: name, look (must be unlocked), coins, equipment, pending race entries and
   today's planned session (through the engine's `planSession`). Progression fields always come
   from the server.
6. Fitness decay is applied with the server's clock, then the engine runs (`executeCurrentDay`,
   `raceCurrentDay` or `allocateAttributePoint`). The engine's rules decide validity.
7. `commit_career` writes the result in one transaction: the career row is locked (`for update`),
   the version must still be the one read (otherwise the function retries, up to 3 times, then
   answers `busy`), race entries and equipment rows are mirrored, and the operation id is stored
   with its response. `career_operations.operation_id` is the primary key, so the same id can
   never be stored twice.

### Fields the server keeps

XP and level, Fitness, Fatigue, attributes and spent points, the week (completed days and their
outcomes), forced rest, decay reference, finished race entries and their results. A `save` never
changes them: the server keeps its own values and returns its career, which the device adopts.

Still owned by the device (not part of this phase): coins, purchases, equipment and race entry
(fees). They are accepted as sent in a `save`. Moving them to the server is the next step.

### On the device

- Local-first stays: the career is saved locally after every change and synced in the background.
- Training, racing and spending points wait for the server. On failure nothing is awarded; the
  screen says so ("No connection…" / "The server could not confirm…") and the same button retries
  with the same operation id, so a request that reached the server is never applied twice.
- No offline queue for rewards.
- A conflict between a progressed device career and the cloud career can only be resolved by
  keeping the cloud career (a copy of the device career stays on the device). A brand-new device
  career, or any device career when the cloud copy is damaged, can replace it: the server builds a
  new career for that runner.

### Known limitations

- A career that exists only on a device (never uploaded) is accepted once by the first `save`,
  when the player has no cloud career yet. Careers created from now on are created by the server.
- Coins and equipment are still client-owned (see above).
- Without Supabase configuration (local development, tests) the game runs the engine on the device.

### Deployment (owner steps)

Order matters: the released app (main) still saves with `save_my_career` until this branch is
merged.

1. Migration `20261031090000_server_authority.sql` (additive): **applied on 30 October 2026**
   with the connector and checked (privileges, idempotency, conflicts, foreign operation ids,
   malformed snapshots) in a rolled-back transaction.
2. Edge Function: Supabase dashboard → **Edge Functions** → **Deploy a new function** → **Via
   Editor**. Name `career-ops`; replace the sample code with the whole content of
   `supabase/functions/career-ops/index.js`; deploy. Keep **Verify JWT** on (the default).
   The function uses only `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides to every function;
   nothing to configure, and no key is in the app or the repository.
3. Merge to main (the site redeploys).
4. Migration `20261031090100_revoke_client_writes.sql` (drops the client writers) right after the
   release.
5. Security advisor afterwards: "RLS enabled, no policy" on `career_operations` is intended (no
   client may read or write it). The `save_my_career` / `create_my_career` warnings disappear.

## Not done yet (next phases)

Sign in with Apple, server-side economy (coins, purchases, race entry fees) and the coin ledger,
sign-out, native packaging.
