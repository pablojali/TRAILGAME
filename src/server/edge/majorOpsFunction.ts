import { handleMajorOp } from '../majorOps'
import { loadServerCareer } from '../careerOps'
import { createSupabaseMajorStore, createSupabaseRaceStore } from '../majorRest'
import { authenticateWithSupabase, createSupabaseCareerOpsStore, type ServerConfig } from '../supabaseRest'

/**
 * The Supabase Edge Function `major-ops` (Deno): the Sunday Major event manager. Bundled by
 * `npm run build:functions` into supabase/functions/major-ops/index.js; CI deploys it from main.
 */
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response> | Response): void
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function config(): ServerConfig {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase environment missing')
  return { url, anonKey, serviceRoleKey }
}

function tickSecret(request: Request): string | null {
  const value = request.headers.get('x-major-tick')
  return value && value.length >= 32 ? value : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method-not-allowed' })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { ok: false, error: 'bad-request' })
  }
  try {
    const settings = config()
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null
    const result = await handleMajorOp(token, body, {
      store: createSupabaseMajorStore(settings),
      race: createSupabaseRaceStore(settings),
      // The scheduler (pg_cron + pg_net) sends this secret; it is never in a browser.
      tickAuthorized: tickSecret(request) !== null && tickSecret(request) === Deno.env.get('MAJOR_TICK_SECRET'),
      loadCareer: (userId) => loadServerCareer(createSupabaseCareerOpsStore(settings), userId, Date.now()),
      authenticate: (value) => authenticateWithSupabase(settings, value),
      now: () => Date.now(),
    })
    return json(result.status, result.body)
  } catch (error) {
    console.error('major-ops failed', error instanceof Error ? error.message : error)
    return json(500, { ok: false, error: 'server-error' })
  }
})
