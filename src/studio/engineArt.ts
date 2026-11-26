import type { RepoFile } from './github'
import type { Upload } from './media'

/**
 * The race engine's art (the race seen from behind, docs/RACE_BACK_VIEW_DEMO.md), uploaded from
 * Trail Studio (owner request, 25 November 2026). The engine reads these files by name from
 * `assets/race/back-view/`, so they go straight there (no Claude step) and the next build bundles
 * them: once the proposal is published, /race-demo uses them.
 */
export const ENGINE_ROOT = 'assets/race/back-view'

/** A body frame of the runner seen from behind: `men_body_tone2_f1.png` (no design number since 26 November 2026). */
export const BODY_FRAME = /^(men|women)_body_tone[1-4]_f\d+\.png$/

/** The backdrop layers (sky, mountains, far forest). */
export const SCENE_SLOTS = [
  { id: 'sky', label: 'Cielo' },
  { id: 'mountains', label: 'Montañas' },
  { id: 'forest', label: 'Bosque lejano' },
] as const

/** Scenery along the trail, three drawings of each kind. */
export const DECOR_SLOTS = (['pine', 'rock', 'bush', 'grass'] as const).flatMap((kind) =>
  [0, 1, 2].map((n) => ({ id: `${kind}-${n}`, label: `${{ pine: 'Pino', rock: 'Roca', bush: 'Arbusto', grass: 'Hierba' }[kind]} ${n + 1}` })),
)

/**
 * Where an Avatares upload goes when its name marks it as seen from behind (owner request, 25
 * November 2026; one model per level, no design number, since 26 November 2026):
 * `lvl1_men_head_tone2_back.png` (the head from behind) and `lvl1_men_shirt_back.png` or
 * `…_back_f1.png` (a shirt from behind, per frame when it has sleeves). Null: an ordinary avatar file.
 */
export function backViewPath(fileName: string): string | null {
  const head = /^(lvl\d+_(?:men|women)_head_tone[1-4])_back\.png$/.exec(fileName)
  if (head) return `${ENGINE_ROOT}/runner/heads/${head[1]}.png`
  // Shoes seen from behind (owner request, 26 November 2026): one picture per frame, the level's model
  // number only when the level has more than one (`lvl1_men_shoes_02_back_f1.png`).
  const shoes = /^(lvl\d+_(?:men|women)_shoes(?:_\d{2})?)_back(_f\d+)\.png$/.exec(fileName)
  if (shoes) return `${ENGINE_ROOT}/runner/footwear/${shoes[1]}${shoes[2]}.png`
  const shirt = /^(lvl\d+_(?:men|women)_shirt)_back(_f\d+)?\.png$/.exec(fileName)
  if (shirt) return `${ENGINE_ROOT}/runner/clothing/${shirt[1]}${shirt[2] ?? ''}.png`
  return null
}

/**
 * The engine prefers a .webp over a .png of the same name, so a new picture also deletes the other
 * format of the same name already in the folder.
 */
export function replacing(path: string, existing: readonly RepoFile[] | null): Record<string, Upload> {
  const stem = path.replace(/\.(png|webp)$/, '')
  return Object.fromEntries(
    (existing ?? [])
      .filter((file) => file.path !== path && file.path.replace(/\.(png|webp)$/, '') === stem)
      .map((file) => [file.path, { base64: null, label: `${file.name} (replaced)` }]),
  )
}

/**
 * Where a pack seen from behind goes: named like the item's layer on the avatar (equipment table,
 * `avatar_layer`), without folder or extension, `{sex}` filled in: `accessories/lvl1_{sex}_back_01.webp`
 * → `runner/accessories/lvl1_men_back_01.png`. Null when the item has no layer.
 */
export function packBackPath(avatarLayer: string, sex: 'men' | 'women'): string | null {
  const stem = avatarLayer.trim().replace(/^.*\//, '').replace(/\.(webp|png)$/i, '')
  if (!stem) return null
  return `${ENGINE_ROOT}/runner/accessories/${stem.replaceAll('{sex}', sex)}.png`
}
