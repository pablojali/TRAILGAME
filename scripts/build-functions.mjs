// Bundles each Edge Function (src/server/edge/*Function.ts) with the game engine it reuses into one
// file, supabase/functions/<name>/index.js, ready to deploy. Usage: npm run build:functions
import { build } from 'esbuild'
import { FUNCTIONS, functionBuildOptions } from './functionsBuild.mjs'

for (const fn of FUNCTIONS) {
  await build({ ...functionBuildOptions(fn.entry), outfile: fn.outfile })
  console.log(`Built ${fn.outfile}`)
}
