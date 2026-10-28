import type { SessionType } from '../../domain/training/sessions'

const PATHS: Record<SessionType, string> = {
  // Gentle wave.
  'easy-run': 'M3 14c3-4 6-4 9 0s6 4 9 0',
  // Rising bars.
  intervals: 'M5 19v-6M10 19V7M15 19v-9M20 19V5',
  // Mountain.
  hills: 'M2 19l7-11 4 6 3-4 6 9z',
  // Long road.
  'long-run': 'M5 20L10 4M19 20L14 4M12 6v2M12 11v2M12 16v2',
  // Dumbbell.
  strength: 'M7 8v8M4 10v4M17 8v8M20 10v4M7 12h10',
  // Rocky steps.
  'trail-technique': 'M3 19h5v-4h5v-4h5V7h3',
  // Moon.
  rest: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
}

/** Decorative icon for a session type; always pair it with the session name. */
export function SessionIcon({ session, size = 24 }: { session: SessionType; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[session]} />
    </svg>
  )
}
