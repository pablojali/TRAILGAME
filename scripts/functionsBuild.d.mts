import type { BuildOptions } from 'esbuild'

export declare const functionsBuildOptions: BuildOptions
export declare const FUNCTIONS: readonly { name: string; entry: string; outfile: string }[]
export declare function functionBuildOptions(entry: string): BuildOptions
