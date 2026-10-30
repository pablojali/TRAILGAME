import { useId } from 'react'
import { bodyId, outfitTint, type Appearance } from '../../domain/athlete/appearance'
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

/**
 * Close-up on the face, kept inside the full crop so the frame does not change size: a scale and
 * shift of the canvas that fills the full viewBox (140 0 360 920) with the head and shoulders,
 * centred on x 320 from y −15.
 */
const FACE_SCALE = 3.2
const FACE_LEFT = 320 - 360 / FACE_SCALE / 2
const FACE_TOP = -15
const FACE_TRANSFORM = `translate(${140 - FACE_SCALE * FACE_LEFT}px, ${-FACE_SCALE * FACE_TOP}px) scale(${FACE_SCALE})`

/** Multiplies the white T-shirt by a colour, keeping its shading. */
function tintMatrix(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3))
  return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`
}

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
  /** With the full crop: zoom in on the face (animated, e.g. while choosing a hairstyle). */
  focus?: 'face'
  className?: string
}

/**
 * Runner avatar: body (skin tone and hair painted in), then shoes if equipped, then the chosen top.
 * Without equipment the runner is as drawn: men in socks, women barefoot.
 */
export function Avatar({ sex, appearance, equipment = [], label, crop = 'full', focus, className }: AvatarProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  const filterId = useId()
  const tint = outfitTint(appearance.outfit)
  const outfitArt = tint ? 'white-tshirt' : appearance.outfit
  const layers: { id: string; href: string | undefined; tinted?: boolean }[] = [
    { id: 'body', href: art(`bodies/${bodyId(sex, appearance.skin)}`) },
    ...equipment
      .filter((id) => getEquipmentItem(id)?.slot === 'shoes')
      .map((id) => ({ id, href: art(`footwear/${id}`) })),
    ...(appearance.outfit === 'none'
      ? []
      : [{ id: appearance.outfit, href: art(`clothing/${outfitArt}`), tinted: tint !== null }]),
  ]
  const zoomed = focus === 'face' && crop === 'full'
  return (
    <svg
      viewBox={VIEWBOXES[crop]}
      className={`${styles.avatar} ${className ?? ''}`}
      data-skin={appearance.skin}
      data-hair={appearance.hair}
      data-outfit={appearance.outfit}
      data-focus={zoomed ? 'face' : undefined}
      preserveAspectRatio="xMidYMid meet"
      {...a11y}
    >
      {tint && (
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={tintMatrix(tint)} />
        </filter>
      )}
      <g className={styles.zoom} style={{ transform: zoomed ? FACE_TRANSFORM : 'none' }}>
        {layers.map(
          (layer) =>
            layer.href && (
              <image
                key={layer.id}
                href={layer.href}
                width="640"
                height="960"
                data-layer={layer.id}
                filter={layer.tinted ? `url(#${filterId})` : undefined}
              />
            ),
        )}
      </g>
    </svg>
  )
}
