import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMajorStore, readBody } from './majorRest'

const config = { url: 'https://db.test', anonKey: 'anon', serviceRoleKey: 'service' }

describe('major-ops database access', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads an empty successful answer as nothing, not as an error', async () => {
    expect(await readBody(new Response(null, { status: 204 }))).toBeUndefined()
    expect(await readBody(new Response('', { status: 201 }))).toBeUndefined()
    expect(await readBody(new Response('[{"id":1}]', { status: 200 }))).toEqual([{ id: 1 }])
  })

  it('logs an admin action (201 with an empty body, return=minimal) without failing', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const store = createSupabaseMajorStore(config)
    await expect(store.log(null, 'admin', 'config-set', {})).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledOnce()
  })
})
