import { bodyId, type Appearance } from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import { getEquipmentItem } from '../../domain/equipment/items'
import styles from './Avatar.module.css'

/**
 * The owner's layered artwork, prepared by scripts/prepare_avatar_art.py. Every layer shares one
 * 640 × 960 canvas, so layers line up when stacked:
 * `bodies/{sex}-{tone}`, `clothing/{outfit}` and `footwear/{item}`.
 */
const ART = import.meta.glob<string>('/assets/runner/avatar/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Crops of the shared canvas: the whole runner, head and shoulders, the torso, and the feet. */
const VIEWBOXES = {
  full: '140 0 360 920',
  head: '230 8 180 180',
  kit: '170 140 300 300',
  feet: '170 720 300 200',
} as const

function art(path: string): string | undefined {
  return ART[`/assets/runner/avatar/${path}.webp`]
}

interface AvatarProps {
  sex: Sex
  appearance: Appearance
  /** Equipped item ids. Only items with artwork are drawn. */
  equipment?: readonly string[]
  /** Accessible name. Without it the avatar is decorative. */
  label?: string
  crop?: keyof typeof VIEWBOXES
  className?: string
}

/**
 * Runner avatar: body (skin tone and hair painted in), then shoes if equipped, then the chosen top.
 * Without equipment the runner is as drawn: men in socks, women barefoot.
 */
export function Avatar({ sex, appearance, equipment = [], label, crop = 'full', className }: AvatarProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  const layers: { id: string; href: string | undefined }[] = [
    { id: 'body', href: art(`bodies/${bodyId(sex, appearance.skin)}`) },
    ...equipment
      .filter((id) => getEquipmentItem(id)?.slot === 'shoes')
      .map((id) => ({ id, href: art(`footwear/${id}`) })),
    ...(appearance.outfit === 'none' ? [] : [{ id: appearance.outfit, href: art(`clothing/${appearance.outfit}`) }]),
  ]
  return (
    <svg
      viewBox={VIEWBOXES[crop]}
      className={`${styles.avatar} ${className ?? ''}`}
      data-skin={appearance.skin}
      data-hair={appearance.hair}
      data-outfit={appearance.outfit}
      preserveAspectRatio="xMidYMid meet"
      {...a11y}
    >
      {layers.map(
        (layer) =>
          layer.href && <image key={layer.id} href={layer.href} width="640" height="960" data-layer={layer.id} />,
      )}
    </svg>
  )
}
