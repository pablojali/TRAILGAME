// @vitest-environment node
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { functionBuildOptions, functionsBuildOptions } from '../../scripts/functionsBuild.mjs'
import deployed from '../../supabase/functions/career-ops/index.js?raw'
import deployedMajor from '../../supabase/functions/major-ops/index.js?raw'

describe('career-ops Edge Function bundle', () => {
  it('is up to date with src/server (run `npm run build:functions` after changing it)', async () => {
    const result = await build({
      ...functionsBuildOptions,
      write: false,
    })
    expect(result.outputFiles[0]!.text).toBe(deployed)
  }, 30_000)

  it('does not contain any Supabase key or the service role key', () => {
    expect(deployed).not.toMatch(/sb_secret_|sb_publishable_|eyJhbGci/)
    expect(deployed).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')".replace(/'/g, '"'))
  })
})

describe('major-ops Edge Function bundle', () => {
  it('is up to date with src/server (run `npm run build:functions` after changing it)', async () => {
    const result = await build({ ...functionBuildOptions('src/server/edge/majorOpsFunction.ts'), write: false })
    expect(result.outputFiles[0]!.text).toBe(deployedMajor)
  }, 30_000)

  it('does not contain any Supabase key', () => {
    expect(deployedMajor).not.toMatch(/sb_secret_|sb_publishable_|eyJhbGci/)
  })
})
