export type IconName = 'dashboard' | 'training' | 'equipment' | 'races' | 'career' | 'settings' | 'cloud'

const PATHS: Record<IconName, string> = {
  // Gauge
  dashboard: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M6 19h12',
  // Calendar
  training: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4M9 14h2M13 14h2M9 17h2',
  // Shoe
  equipment: 'M3 17v-4l4-1 3-5 2 1-1 3 5 2 5 1v3zM3 17h18v2H3z',
  // Mountain with flag
  races: 'M2 20l7-11 4 6 3-4 6 9zM16 11V4l4 2-4 2',
  // Trophy
  career: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4',
  // Sliders
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  // Cloud
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z',
}

interface IconProps {
  name: IconName
  size?: number
}

/** Decorative stroke icon; pair it with a visible text label or an aria-label on its control. */
export function Icon({ name, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
