import type { Sex } from '../../domain/athlete/athlete'

/**
 * Dashboard runner artwork, separate from the creation illustrations:
 * `assets/runner/dashboard/{sex}/body.(webp|png)` is the base body without equipment and
 * `assets/runner/dashboard/{sex}/equipment/{item}.(webp|png)` are stacked layers with the same canvas.
 */
const DASHBOARD_ART = import.meta.glob<string>('/assets/runner/dashboard/**/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface RunnerLayer {
  id: string
  url: string
}

export interface DashboardArt {
  /** Base body image, or null to show the placeholder. */
  body: string | null
  /** Equipment layers that have artwork, bottom to top in the order given. */
  layers: RunnerLayer[]
}

function find(manifest: Record<string, string>, path: string): string | null {
  return manifest[`${path}.webp`] ?? manifest[`${path}.png`] ?? null
}

/** Resolves the artwork for a runner. Items without artwork are skipped. */
export function resolveDashboardArt(
  sex: Sex,
  equipment: readonly string[],
  manifest: Record<string, string> = DASHBOARD_ART,
): DashboardArt {
  const base = `/assets/runner/dashboard/${sex}`
  const layers: RunnerLayer[] = []
  for (const id of equipment) {
    const url = find(manifest, `${base}/equipment/${id}`)
    if (url) layers.push({ id, url })
  }
  return { body: find(manifest, `${base}/body`), layers }
}
