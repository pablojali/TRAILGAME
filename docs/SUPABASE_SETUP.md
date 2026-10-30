# Supabase setup (M7 foundation)

**Status (30 October 2026):** the official client is installed and configured, but nothing in the
game uses it yet. The career is still saved only in this browser (localStorage). There are no
tables, no sign-in and no remote saves; those come in later phases.

## What exists

| Part | File |
|---|---|
| Configuration: reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, refuses secret keys | `src/repositories/supabase/supabaseConfig.ts` |
| The one shared client, created on first use; `null` when not configured | `src/repositories/supabase/supabaseClient.ts` (`getSupabaseClient()`) |
| Connection check (no sign-in, no tables) | `npm run supabase:check` (`scripts/check-supabase.mjs`) |

Supabase lives in the repository layer only. `src/domain` and `src/game-engine` never import it
(checked by `src/architecture/layers.test.ts`). Because nothing imports the client yet, it is not
in the production bundle.

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

## Not done yet (next phases)

Database tables and RLS, authentication (anonymous, then email/Apple/Google), remote saves and the
import of the local save, Edge Functions for coins, XP and race results, the coin ledger.
