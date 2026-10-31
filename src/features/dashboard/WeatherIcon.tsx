import type { WeatherKind } from './weather'

/** Small weather pictogram, decorative (the weather is also given as text). */
export function WeatherIcon({ kind, className }: { kind: WeatherKind; className?: string }) {
  const sun = (
    <g>
      <circle cx="10" cy="10" r="4" fill="#f2c531" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="10" y1="2.2" x2="10" y2="4" stroke="#f2c531" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${a} 10 10)`} />
      ))}
    </g>
  )
  const cloud = (dx: number, dy: number, fill: string) => (
    <path transform={`translate(${dx} ${dy})`} d="M5 16 a3.5 3.5 0 0 1 0.6-7 a4.5 4.5 0 0 1 8.6-0.8 a3.2 3.2 0 0 1 0.8 6.3 Z" fill={fill} />
  )
  return (
    <svg viewBox="0 0 24 22" width="22" height="20" className={className} aria-hidden="true">
      {(kind === 'sun' || kind === 'partly') && sun}
      {kind === 'partly' && cloud(6, 3, '#e6e9ee')}
      {(kind === 'cloud' || kind === 'rain') && cloud(3, -1, '#c9ced6')}
      {kind === 'rain' &&
        [7, 12, 17].map((x) => <line key={x} x1={x} y1="17" x2={x - 1.5} y2="21" stroke="#6fb3e8" strokeWidth="1.6" strokeLinecap="round" />)}
    </svg>
  )
}
