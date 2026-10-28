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
 * Runner avatar: standing, three-quarter view facing right, in the basic kit (white top, dark
 * shorts). Shoes are equipment and are not drawn here; the feet stay bare until an equipment model
 * says shoes are equipped.
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
      <g data-layer="hair-back" className={styles.hair} transform={HEAD_OFFSET}>
        {HAIR_BACK[appearance.hair]}
      </g>
      <g data-layer="body">
        {/* Far arm and leg sit behind the torso and are a shade darker. */}
        <path d="M51 74 L44 100 L44 122" className={`${styles.limb} ${styles.skinShade}`} />
        <circle cx="44" cy="124" r="4.5" className={styles.skinShadeFill} />
        <path d="M50 128 h10 l-1 48 l-2 42 h-7 l-1 -42 z" className={styles.skinShadeFill} />
        <path d="M61 128 h11 l-1 48 l-2 44 h-8 l0 -44 z" className={styles.skinFill} />
        <rect x="56" y="56" width="10" height="16" rx="3" className={styles.skinShadeFill} />
      </g>
      {/* Bare feet. The shoe slot is reserved for equipment. */}
      <g data-layer="feet">
        <path d="M50 216 h8 q7 0 8 6 h-17 z" className={styles.skinShadeFill} />
        <path d="M61 218 h9 q8 0 9 6 h-19 z" className={styles.skinFill} />
      </g>
      <g data-layer="outfit">
        <path d="M47 118 h28 l2 28 l-14 2 l-2 -12 l-2 12 l-14 -2 z" className={styles.shorts} />
        <path d="M51 75 L48 87" className={styles.sleeve} />
        <path d={TORSO[sex]} className={styles.top} />
      </g>
      <g data-layer="front-arm">
        <path d="M73 74 L80 100 L79 122" className={`${styles.limb} ${styles.skin}`} />
        <circle cx="79" cy="124" r="4.5" className={styles.skinFill} />
        <path d="M71 75 L75 87" className={styles.sleeve} />
      </g>
      <g data-layer="head" transform={HEAD_OFFSET}>
        <ellipse cx="50" cy="46" rx="3" ry="4.5" className={styles.skinShadeFill} />
        <ellipse cx="62" cy="44" rx="13" ry="15" className={styles.skinFill} />
        <circle cx="65" cy="44" r="1.5" className={styles.feature} />
        <circle cx="72" cy="44" r="1.4" className={styles.feature} />
        <path d="M66 52 q3 2 6 0" className={styles.mouth} />
      </g>
      <g data-layer="hair-front" className={styles.hair} transform={HEAD_OFFSET}>
        {HAIR_FRONT[appearance.hair]}
      </g>
    </svg>
  )
}

/** Sits the head on a short neck. */
const HEAD_OFFSET = 'translate(0 4)'

const TORSO: Record<Sex, string> = {
  female: 'M48 72 Q61 66 74 72 L76 92 L72 106 L75 122 L47 122 L50 106 L46 92 Z',
  male: 'M46 72 Q61 66 76 72 L78 100 L76 122 L46 122 L44 100 Z',
}

/** Fringe and top of the head, shared by most styles. */
const CAP = <path d="M47 44 Q46 26 62 26 Q78 26 77 42 Q70 34 58 36 Q51 38 50 48 Z" />

const HAIR_BACK: Record<HairStyleId, ReactNode> = {
  ponytail: <path d="M50 32 Q36 34 39 58 Q40 68 46 74 Q45 58 53 42 Z" />,
  bob: <path d="M46 40 Q46 24 62 24 Q78 24 78 42 L77 58 Q70 54 62 56 Q54 56 47 60 Z" />,
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
  short: <path d="M48 44 Q47 27 62 27 Q77 27 76 40 Q72 33 62 34 Q53 35 51 46 Z" />,
  buzz: <path d="M49 42 Q49 30 62 29 Q75 29 75 38 Q66 33 52 39 Z" className={styles.buzz} />,
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
