import type { ReactNode } from 'react'
import type { Appearance, HairStyleId } from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import styles from './Avatar.module.css'

/**
 * Avatar canvas: x 20–100, y 16–232 of the drawing (80 × 216). Every layer (these SVG parts, and
 * future equipment artwork in SVG or WebP) uses this same canvas so layers line up when stacked.
 */
export const AVATAR_VIEWBOX = '20 16 80 216'

/** Crops of the same canvas, used for swatches: head and shoulders, and the kit. */
const VIEWBOXES = {
  full: AVATAR_VIEWBOX,
  head: '32 20 56 56',
  kit: '26 64 68 88',
} as const

interface AvatarProps {
  sex: Sex
  appearance: Appearance
  /** Accessible name. Without it the avatar is decorative. */
  label?: string
  crop?: keyof typeof VIEWBOXES
  className?: string
}

/**
 * Runner avatar, drawn as a black silhouette until final artwork exists: standing, three-quarter
 * view facing right, in the basic kit. The silhouette shows the body, kit and hairstyle shapes; skin
 * tone is saved but only visible on its swatch for now. Shoes are equipment and are not drawn here.
 */
export function Avatar({ sex, appearance, label, crop = 'full', className }: AvatarProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
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
      {crop === 'full' && <ellipse cx="60" cy="226" rx="30" ry="5" className={styles.shadow} />}
      <g className={styles.ink}>
        <g data-layer="hair-back" transform={HEAD_OFFSET}>
          {HAIR_BACK[appearance.hair]}
        </g>
        <g data-layer="body">
          <path d="M51 74 L44 100 L44 122" className={styles.limb} />
          <circle cx="44" cy="124" r="4.5" />
          <path d="M50 128 h10 l-1 48 l-2 42 h-7 l-1 -42 z" />
          <path d="M61 128 h11 l-1 48 l-2 44 h-8 l0 -44 z" />
          <rect x="56" y="56" width="10" height="16" rx="3" />
        </g>
        {/* Bare feet. The shoe slot is reserved for equipment. */}
        <g data-layer="feet">
          <path d="M50 216 h8 q7 0 8 6 h-17 z" />
          <path d="M61 218 h9 q8 0 9 6 h-19 z" />
        </g>
        <g data-layer="outfit">
          <path d="M47 118 h28 l2 28 l-14 2 l-2 -12 l-2 12 l-14 -2 z" />
          <path d="M51 75 L48 87" className={styles.sleeve} />
          <path d={TORSO[sex]} />
        </g>
        <g data-layer="front-arm">
          <path d="M73 74 L80 100 L79 122" className={styles.limb} />
          <circle cx="79" cy="124" r="4.5" />
          <path d="M71 75 L75 87" className={styles.sleeve} />
        </g>
        <g data-layer="head" transform={HEAD_OFFSET}>
          <ellipse cx="50" cy="46" rx="3" ry="4.5" />
          <ellipse cx="62" cy="44" rx="13" ry="15" />
        </g>
        <g data-layer="hair-front" transform={HEAD_OFFSET}>
          {HAIR_FRONT[appearance.hair]}
        </g>
      </g>
    </svg>
  )
}

/** Skin tone sample for swatches: the silhouette cannot show the tone. */
export function SkinToneChip({ skin }: { skin: Appearance['skin'] }) {
  return <span className={styles.skinChip} data-skin={skin} aria-hidden="true" />
}

/** Sits the head on a short neck. */
const HEAD_OFFSET = 'translate(0 4)'

const TORSO: Record<Sex, string> = {
  female: 'M48 72 Q61 66 74 72 L76 92 L72 106 L75 122 L47 122 L50 106 L46 92 Z',
  male: 'M46 72 Q61 66 76 72 L78 100 L76 122 L46 122 L44 100 Z',
}

/**
 * Hair volume, shared by the female styles. In a silhouette only what sticks out of the head shows,
 * so every style changes the outline.
 */
const CAP = <path d="M47 48 Q43 24 62 22.5 Q81 23 78.5 44 Q73 32 60 33 Q51 35 50 52 Z" />

const HAIR_BACK: Record<HairStyleId, ReactNode> = {
  ponytail: <path d="M50 31 Q33 32 36 58 Q38 70 46 76 Q44 58 53 41 Z" />,
  bob: <path d="M44 40 Q44 22 62 22 Q80 22 80 42 L79 58 Q70 54 62 56 Q54 56 45 61 Z" />,
  braid: (
    <>
      <ellipse cx="49" cy="52" rx="4.5" ry="5.5" />
      <ellipse cx="48" cy="61" rx="4.5" ry="5.5" />
      <ellipse cx="47" cy="70" rx="4" ry="5" />
      <ellipse cx="46" cy="78" rx="3.5" ry="4.5" />
    </>
  ),
  short: null,
  buzz: null,
  curly: null,
}

const HAIR_FRONT: Record<HairStyleId, ReactNode> = {
  ponytail: CAP,
  bob: CAP,
  braid: CAP,
  short: <path d="M47.5 44 Q45 25 56 22 Q60 17 67 20 Q73 19 76 25 Q80 30 77.5 39 Q73 31 63 31 Q53 32 50 46 Z" />,
  // Close to the scalp: the outline of the head itself.
  buzz: null,
  curly: (
    <>
      <circle cx="50" cy="38" r="6" />
      <circle cx="55" cy="31" r="6" />
      <circle cx="63" cy="28.5" r="6" />
      <circle cx="71" cy="31" r="5.5" />
      <circle cx="75.5" cy="37" r="4.5" />
      <circle cx="49" cy="46" r="4.5" />
    </>
  ),
}
