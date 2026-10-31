import { backgroundImage, type BackdropScene } from './backdrops'
import styles from './Backdrop.module.css'

/** Deterministic pseudo-random numbers, so a scene is drawn the same way every time. */
function random(seed: number) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** A mountain ridge across the width: jagged peaks from a seed, closed down to the bottom. */
function ridge(seed: number, base: number, height: number, peaks: number): string {
  const next = random(seed)
  const points: string[] = [`0 ${base}`]
  const step = 400 / peaks
  for (let i = 0; i < peaks; i++) {
    const x = i * step
    points.push(`${(x + step * (0.3 + next() * 0.4)).toFixed(1)} ${(base - height * (0.45 + next() * 0.55)).toFixed(1)}`)
    points.push(`${(x + step).toFixed(1)} ${(base - height * next() * 0.35).toFixed(1)}`)
  }
  return `M${points.join(' L')} L400 860 L0 860 Z`
}

const MOUNTAIN_PALETTES = {
  // Sunset (Dashboard).
  dashboard: { sky: ['#1b2440', '#5a3a4a', '#d0703c', '#f3b062'], sun: '#ffd28a', ridges: ['#4b4f6a', '#323a52', '#232a3a', '#151b22'] },
  // Morning (Training).
  training: { sky: ['#14303f', '#2f5a68', '#8fb8b4', '#e7d6a6'], sun: '#fff1c4', ridges: ['#45677a', '#2f4d5c', '#203841', '#132429'] },
}

function Mountains({ scene }: { scene: 'dashboard' | 'training' }) {
  const palette = MOUNTAIN_PALETTES[scene]
  const id = `sky-${scene}`
  return (
    <svg className={styles.art} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.sky[0]} />
          <stop offset="0.22" stopColor={palette.sky[1]} />
          <stop offset="0.36" stopColor={palette.sky[2]} />
          <stop offset="0.44" stopColor={palette.sky[3]} />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor={palette.sun} stopOpacity="0.9" />
          <stop offset="1" stopColor={palette.sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="860" fill={`url(#${id})`} />
      <circle cx="292" cy="300" r="90" fill={`url(#${id}-sun)`} />
      <circle cx="292" cy="300" r="11" fill={palette.sun} />
      <path d={ridge(11, 400, 150, 5)} fill={palette.ridges[0]} />
      <path d={ridge(23, 470, 120, 7)} fill={palette.ridges[1]} />
      <path d={ridge(37, 560, 110, 6)} fill={palette.ridges[2]} />
      <path d={ridge(41, 700, 90, 4)} fill={palette.ridges[3]} />
    </svg>
  )
}

function Cabin() {
  const next = random(7)
  const planks = Array.from({ length: 12 }, (_, i) => ({ x: i * 34, shade: 0.85 + next() * 0.3 }))
  return (
    <svg className={styles.art} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="cabin-glow" cx="0.25" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#f2b765" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f2b765" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cabin-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe0c2" />
          <stop offset="1" stopColor="#8fae6e" />
        </linearGradient>
      </defs>
      <rect width="400" height="860" fill="#2b1d14" />
      {planks.map((plank) => (
        <g key={plank.x}>
          <rect x={plank.x} y="0" width="34" height="640" fill="#5a3a24" opacity={plank.shade * 0.55} />
          <rect x={plank.x} y="0" width="1.5" height="640" fill="#1a110b" opacity="0.7" />
        </g>
      ))}
      <rect x="22" y="150" width="120" height="150" rx="4" fill="url(#cabin-window)" opacity="0.75" />
      <path d="M82 150 V300 M22 225 H142" stroke="#3b2717" strokeWidth="6" />
      <rect x="16" y="144" width="132" height="162" rx="6" fill="none" stroke="#3b2717" strokeWidth="8" />
      <rect y="640" width="400" height="220" fill="#24170f" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} y={640 + i * 38} width="400" height="1.5" fill="#120b07" opacity="0.8" />
      ))}
      <rect y="600" width="400" height="18" fill="#3e2a1b" />
      <rect width="400" height="860" fill="url(#cabin-glow)" />
    </svg>
  )
}

/** Closed contour lines around a centre, wobbling with a seed. */
function contours(cx: number, cy: number, seed: number, rings: number): string[] {
  const next = random(seed)
  const phase = [next() * 6, next() * 6, next() * 6]
  return Array.from({ length: rings }, (_, k) => {
    const radius = 18 + k * 17
    const points = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2
      const r = radius * (1 + 0.16 * Math.sin(3 * a + phase[0]!) + 0.1 * Math.sin(5 * a + phase[1]! + k * 0.3) + 0.06 * Math.sin(2 * a + phase[2]!))
      return `${(cx + Math.cos(a) * r * 1.2).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`
    })
    return `M${points.join(' L')} Z`
  })
}

function Topo() {
  const centres: [number, number, number][] = [
    [80, 140, 3],
    [330, 330, 5],
    [110, 560, 8],
    [320, 760, 13],
  ]
  const route = 'M150 40 C 230 120, 330 150, 300 240 S 140 330, 170 420 S 330 520, 280 620 S 80 700, 150 830'
  return (
    <svg className={styles.art} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="860" fill="#0d1d17" />
      {centres.flatMap(([cx, cy, seed]) =>
        contours(cx, cy, seed, 9).map((d, k) => (
          <path key={`${seed}-${k}`} d={d} fill="none" stroke="#3f7a5c" strokeOpacity={k % 4 === 3 ? 0.55 : 0.28} strokeWidth={k % 4 === 3 ? 1.4 : 0.8} />
        )),
      )}
      <path d={route} fill="none" stroke="#f07c2a" strokeOpacity="0.75" strokeWidth="3" strokeDasharray="1 0" />
      {[
        [300, 240],
        [170, 420],
        [280, 620],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="7" fill="#0d1d17" stroke="#f07c2a" strokeWidth="3" />
      ))}
    </svg>
  )
}

function Stars() {
  const next = random(29)
  const stars = Array.from({ length: 140 }, () => ({ x: next() * 400, y: next() * 290, r: next() < 0.92 ? 0.6 + next() * 0.6 : 1.4, o: 0.35 + next() * 0.65 }))
  return (
    <svg className={styles.art} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060a18" />
          <stop offset="0.45" stopColor="#141d38" />
          <stop offset="0.6" stopColor="#2a2a46" />
        </linearGradient>
        <linearGradient id="milky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9c4ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#d9d2ff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#b9c4ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dawn" cx="0.58" cy="0.3" r="0.35">
          <stop offset="0" stopColor="#f07c2a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f07c2a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="860" fill="url(#night)" />
      <path d="M-40 230 L460 20 L460 100 L-40 300 Z" fill="url(#milky)" />
      {stars.map((star, i) => (
        <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} />
      ))}
      <rect width="400" height="860" fill="url(#dawn)" />
      <path d={ridge(53, 290, 70, 6)} fill="#151a2a" />
      <path d="M120 290 L228 168 L250 184 L340 290 Z" fill="#0b0e17" />
      <path d="M229 169 V128 L258 137 L229 146" fill="none" stroke="#d6453a" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="226" cy="160" r="2.2" fill="#f2c531" />
      <rect y="289" width="400" height="571" fill="#0b0e17" />
    </svg>
  )
}

/**
 * The background of the current section, behind the top bar, the screen and the tab bar: the
 * owner's illustration when it exists, otherwise a scene drawn here. A dark veil keeps text
 * readable over any picture.
 */
export function Backdrop({ scene }: { scene: BackdropScene }) {
  const image = backgroundImage(scene)
  return (
    <div className={styles.backdrop} data-scene={scene} data-art={image ? 'image' : 'drawn'} aria-hidden="true">
      {image ? (
        <img className={styles.art} src={image} alt="" />
      ) : scene === 'dashboard' || scene === 'training' ? (
        <Mountains scene={scene} />
      ) : scene === 'equipment' ? (
        <Cabin />
      ) : scene === 'races' ? (
        <Topo />
      ) : scene === 'career' ? (
        <Stars />
      ) : null}
      <div className={styles.veil} />
    </div>
  )
}
