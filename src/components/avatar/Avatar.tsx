import { useId } from 'react'
import { bodyId, outfitTint, type Appearance } from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import { getEquipmentItem } from '../../domain/equipment/items'
import { art, headArt } from './avatarArt'
import styles from './Avatar.module.css'

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
 * Shoes without their own artwork reuse the starter-shoes art, recoloured per model, until the
 * owner supplies art for them.
 */
const SHOE_COLORS: Record<string, string> = {
  'trail-shoes-basic': '#3d8fd6',
  'trail-shoes': '#f07c2a',
  'trail-shoes-light': '#9bcf3a',
}

/** Colours the (dark) art by its brightness, keeping its shading. */
function recolorMatrix(hex: string): string {
  const gain = 3.2
  const rows = [1, 3, 5].map((i) => {
    const c = (parseInt(hex.slice(i, i + 2), 16) / 255) * gain
    return `${(0.3 * c).toFixed(3)} ${(0.59 * c).toFixed(3)} ${(0.11 * c).toFixed(3)} 0 0`
  })
  return `${rows.join('  ')}  0 0 0 1 0`
}

/** Alpha = 25 × (blue − red): opaque on the bluish shoes, clear on the grey socks. */
const SHOE_MASK = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -25 0 25 0 0'

/** Pole colour by item: lvl 1 aluminium, lvl 2 carbon. */
const POLE_COLORS: Record<string, { shaft: string; band: string }> = {
  poles: { shaft: '#9aa3ab', band: '#d6453a' },
  'poles-2': { shaft: '#2b2f36', band: '#f07c2a' },
}

/** Vest colour by item: lvl 1 slate with grey trim, lvl 2 charcoal with orange trim. */
const PACK_COLORS: Record<string, { light: string; dark: string; trim: string }> = {
  'hydration-backpack': { light: '#5d6873', dark: '#3a434c', trim: '#aab6c0' },
  'hydration-backpack-2': { light: '#3a4148', dark: '#1f2429', trim: '#f07c2a' },
}

/**
 * Poles held in the hands, drawn behind the body so the fists cover the grips. Placeholder vector
 * art on the shared canvas: every body has its hands at about x 214 and x 424, y 480–530.
 */
function Poles({ id }: { id: string }) {
  const color = POLE_COLORS[id]!
  return (
    <g data-layer={id} strokeLinecap="round">
      {[
        [214, 452, 184, 905],
        [424, 452, 454, 905],
      ].map(([x1, y1, x2, y2]) => (
        <g key={x1}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.shaft} strokeWidth="5" />
          <line
            x1={x1! + (x2! - x1!) * 0.22}
            y1={y1! + (y2! - y1!) * 0.22}
            x2={x1! + (x2! - x1!) * 0.3}
            y2={y1! + (y2! - y1!) * 0.3}
            stroke={color.band}
            strokeWidth="6"
          />
          <ellipse cx={x1! + (x2! - x1!) * 0.93} cy={y1! + (y2! - y1!) * 0.93} rx="9" ry="3" fill={color.shaft} />
        </g>
      ))}
    </g>
  )
}

/**
 * Front of a running vest: narrow straps over the shoulders that widen into chest pockets with
 * soft flasks, and a sternum strap. Drawn over the top. Placeholder vector art: every body has its
 * neck at x 260–338 and shoulders at y 180–200.
 */
function Vest({ id }: { id: string }) {
  const color = PACK_COLORS[id]!
  const gradient = `vest-${id}`
  const panels = [
    'M250 186 C256 182 266 182 272 186 C274 214 278 244 278 280 C278 302 276 320 272 334 L240 334 C234 310 230 280 232 252 C236 226 242 204 250 186 Z',
    'M350 186 C344 182 334 182 328 186 C326 214 322 244 322 280 C322 302 324 320 328 334 L362 334 C368 310 372 280 370 252 C366 226 358 204 350 186 Z',
  ]
  return (
    <g data-layer={id}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color.light} />
          <stop offset="1" stopColor={color.dark} />
        </linearGradient>
      </defs>
      {panels.map((d) => (
        <path key={d} d={d} fill={`url(#${gradient})`} stroke={color.dark} strokeWidth="1.5" />
      ))}
      {[
        [243, 240],
        [334, 240],
      ].map(([x, y]) => (
        <g key={x}>
          <path
            d={`M${x! + 4} ${y! + 10} Q${x! + 12} ${y! - 2} ${x! + 20} ${y! + 10} L${x! + 22} ${y! + 56} Q${x! + 12} ${y! + 64} ${x! + 2} ${y! + 56} Z`}
            fill="#cfe9f5"
            fillOpacity="0.8"
            stroke="#8fbfd2"
          />
          <rect x={x! + 8} y={y! - 6} width="8" height="9" rx="2" fill="#20262c" />
        </g>
      ))}
      <path d="M276 238 L324 238" stroke={color.trim} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M277 298 L323 298" stroke={color.trim} strokeWidth="3" strokeLinecap="round" />
      {panels.map((d) => (
        <path key={`${d}-trim`} d={d} fill="none" stroke={color.trim} strokeWidth="1.5" strokeOpacity="0.8" strokeDasharray="0 0" />
      ))}
    </g>
  )
}

/**
 * Runner avatar, back to front: poles (held in the hands), body (skin tone, basic head), the chosen
 * head, shoes, the chosen top, then the running vest. Without equipment the runner is as drawn: men in
 * socks, women barefoot.
 */
export function Avatar({ sex, appearance, equipment = [], label, crop = 'full', focus, className }: AvatarProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  const filterId = useId()
  const tint = outfitTint(appearance.outfit)
  const outfitArt = tint ? 'white-tshirt' : appearance.outfit
  const bySlot = (slot: string) => equipment.filter((id) => getEquipmentItem(id)?.slot === slot)
  const shoes = bySlot('shoes').map((id) => {
    const own = art(`footwear/${id}`)
    return { id, href: own ?? art('footwear/starter-shoes'), color: own ? undefined : SHOE_COLORS[id] }
  })
  const layers: { id: string; href: string | undefined; filter?: string }[] = [
    { id: 'body', href: art(`bodies/${bodyId(sex, appearance.skin)}`) },
    // The chosen head is drawn over the body's basic head, in the body's skin tone.
    { id: 'head', href: headArt(sex, appearance.hair, Number(appearance.skin.slice('tone-'.length))) },
    ...shoes.map((shoe) => ({ ...shoe, filter: shoe.color && `${filterId}-${shoe.id}` })),
    ...(appearance.outfit === 'none'
      ? []
      : [{ id: appearance.outfit, href: art(`clothing/${outfitArt}`), filter: tint ? `${filterId}-top` : undefined }]),
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
        <filter id={`${filterId}-top`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={tintMatrix(tint)} />
        </filter>
      )}
      {shoes.map(
        (shoe) =>
          shoe.color && (
            <filter key={shoe.id} id={`${filterId}-${shoe.id}`} colorInterpolationFilters="sRGB">
              {/* The shoes are bluish and the socks neutral grey: recolour only where blue > red. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values={recolorMatrix(shoe.color)} result="color" />
              <feColorMatrix in="SourceGraphic" type="matrix" values={SHOE_MASK} result="mask" />
              <feComposite in="color" in2="mask" operator="in" result="shoe" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="shoe" />
              </feMerge>
            </filter>
          ),
      )}
      <g className={styles.zoom} style={{ transform: zoomed ? FACE_TRANSFORM : 'none' }}>
        {bySlot('poles').map((id) => POLE_COLORS[id] && <Poles key={id} id={id} />)}
        {layers.map(
          (layer) =>
            layer.href && (
              <image
                key={layer.id}
                href={layer.href}
                width="640"
                height="960"
                data-layer={layer.id}
                filter={layer.filter ? `url(#${layer.filter})` : undefined}
              />
            ),
        )}
        {bySlot('pack').map((id) => PACK_COLORS[id] && <Vest key={id} id={id} />)}
      </g>
    </svg>
  )
}
