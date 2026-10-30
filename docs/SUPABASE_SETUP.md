# Supabase setup (M7)

**Status (30 October 2026, Phase 2A):** players get an anonymous Supabase identity in the
background, and a new career also creates the player's remote career record. The game is still
played and saved only in this browser (localStorage): there are no remote saves yet.

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

### Existing local careers (Phase 2C)

A career already saved on the device is left untouched and no remote career is created for it.
Phase 2C will import it: validate it with `parseGameState`, then create the remote career from it
through a server-side function that checks it (instead of `create_my_career`, which only accepts
new careers). Until then the local save stays the only copy of that career.

## Not done yet (next phases)

Remote saves (Phase 2B), the import of existing local careers (Phase 2C), account linking with
email/Apple/Google, Edge Functions for coins, XP and race results, writing the coin ledger.
