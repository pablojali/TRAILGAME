// Bundles the Edge Function `career-ops` (src/server/edge/careerOpsFunction.ts) with the game
// engine it reuses into one file, supabase/functions/career-ops/index.js, ready to deploy.
// Usage: npm run build:functions
import { build } from 'esbuild'
import { functionsBuildOptions } from './functionsBuild.mjs'

await build({ ...functionsBuildOptions, outfile: 'supabase/functions/career-ops/index.js' })
console.log('Built supabase/functions/career-ops/index.js')
