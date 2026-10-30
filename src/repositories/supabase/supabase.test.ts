import { describe, expect, it, vi } from 'vitest'
import { createSupabaseClient, getSupabaseClient } from './supabaseClient'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { checkSupabaseConnection, isSecretKey, readSupabaseConfig } from './supabaseConfig'

/** A JWT-shaped key with this payload (signature not checked here). */
function jwt(payload: object) {
  const part = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.signature`
}

const CONFIG = { url: 'https://abcd.supabase.co', anonKey: jwt({ role: 'anon' }) }

describe('Supabase configuration', () => {
  it('is missing without variables, so the game runs without Supabase', () => {
    expect(readSupabaseConfig({})).toEqual({ status: 'missing' })
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: '' })).toEqual({ status: 'missing' })
  })

  it('reads a URL and an anon key', () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co/', VITE_SUPABASE_ANON_KEY: CONFIG.anonKey }),
    ).toEqual({ status: 'configured', config: CONFIG })
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' }),
    ).toMatchObject({ status: 'configured' })
  })

  it('refuses half a configuration, a bad URL and plain http', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co' }).status).toBe('invalid')
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' }).status).toBe('invalid')
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).status).toBe(
      'invalid',
    )
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'k' }).status).toBe(
      'configured',
    )
  })

  it('refuses a service-role or secret key', () => {
    expect(isSecretKey(jwt({ role: 'service_role' }))).toBe(true)
    expect(isSecretKey('sb_secret_abc')).toBe(true)
    expect(isSecretKey(jwt({ role: 'anon' }))).toBe(false)
    expect(isSecretKey('sb_publishable_abc')).toBe(false)
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: CONFIG.url, VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }),
    ).toMatchObject({ status: 'invalid', problem: expect.stringMatching(/service-role/) })
  })

  it('has no configuration in the test build', () => {
    expect(supabaseConfigFromEnv()).toEqual({ status: 'missing' })
    expect(getSupabaseClient()).toBeNull()
  })
})

describe('Supabase client', () => {
  it('initializes from a valid configuration without any network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const client = createSupabaseClient(CONFIG)
    expect(typeof client.from).toBe('function')
    expect(typeof client.auth.getSession).toBe('function')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('Supabase connection check', () => {
  it('calls the Auth health endpoint with the anon key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await expect(checkSupabaseConnection(CONFIG, fetchImpl)).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://abcd.supabase.co/auth/v1/health',
      expect.objectContaining({ headers: { apikey: CONFIG.anonKey } }),
    )
  })

  it('reports a rejected key and an unreachable project without throwing', async () => {
    await expect(checkSupabaseConnection(CONFIG, async () => new Response('', { status: 401 }))).resolves.toMatchObject({
      ok: false,
      problem: expect.stringMatching(/rejected the key/),
    })
    await expect(
      checkSupabaseConnection(CONFIG, async () => {
        throw new TypeError('fetch failed')
      }),
    ).resolves.toMatchObject({ ok: false, problem: expect.stringMatching(/Could not reach/) })
  })
})
