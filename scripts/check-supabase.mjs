// Checks the Supabase connection configured in .env.local (or the environment), without signing
// in and without database tables: `npm run supabase:check`. Exit code 0 = connected.
import { loadEnv } from 'vite'
import { checkSupabaseConnection, readSupabaseConfig } from '../src/repositories/supabase/supabaseConfig.ts'

const env = { ...loadEnv('development', process.cwd(), 'VITE_SUPABASE_'), ...process.env }
const result = readSupabaseConfig(env)

if (result.status === 'missing') {
  console.log('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  console.log('(see docs/SUPABASE_SETUP.md). The game works without it.')
  process.exit(1)
}
if (result.status === 'invalid') {
  console.error(`Supabase configuration problem: ${result.problem}`)
  process.exit(1)
}
const check = await checkSupabaseConnection(result.config)
if (check.ok) {
  console.log(`Supabase connection OK: ${result.config.url}`)
} else {
  console.error(`Supabase connection failed: ${check.problem}`)
  process.exit(1)
}
