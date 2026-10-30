import { handleCareerOp } from '../careerOps'
import { authenticateWithSupabase, createSupabaseCareerOpsStore, type ServerConfig } from '../supabaseRest'

/**
 * The Supabase Edge Function `career-ops` (Deno). Bundled with the game engine by
 * `npm run build:functions` into supabase/functions/career-ops/index.js; deploy that file.
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
    const result = await handleCareerOp(token, body, {
      store: createSupabaseCareerOpsStore(settings),
      authenticate: (value) => authenticateWithSupabase(settings, value),
      now: () => Date.now(),
    })
    return json(result.status, result.body)
  } catch (error) {
    console.error('career-ops failed', error instanceof Error ? error.message : error)
    return json(500, { ok: false, error: 'server-error' })
  }
})
