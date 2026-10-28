import type { Sex } from '../../domain/athlete/athlete'

/**
 * Equipment artwork layered over the Dashboard avatar:
 * `assets/runner/dashboard/{sex}/equipment/{item}.(webp|png|svg)`, drawn on the avatar canvas
 * (80 × 216, see `AVATAR_VIEWBOX`) so it lines up with the body.
 */
const EQUIPMENT_ART = import.meta.glob<string>('/assets/runner/dashboard/**/*.{webp,png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface RunnerLayer {
  id: string
  url: string
}

function find(manifest: Record<string, string>, path: string): string | null {
  return manifest[`${path}.svg`] ?? manifest[`${path}.webp`] ?? manifest[`${path}.png`] ?? null
}

/** Layers for the equipped items, bottom to top in the order given. Items without artwork are skipped. */
export function resolveEquipmentLayers(
  sex: Sex,
  equipment: readonly string[],
  manifest: Record<string, string> = EQUIPMENT_ART,
): RunnerLayer[] {
  const layers: RunnerLayer[] = []
  for (const id of equipment) {
    const url = find(manifest, `/assets/runner/dashboard/${sex}/equipment/${id}`)
    if (url) layers.push({ id, url })
  }
  return layers
}
