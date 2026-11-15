import { useEffect, useSyncExternalStore } from 'react'

/**
 * Immersive screens (owner request, 15 November 2026): while a Sunday Major is run, the whole
 * screen is the race — no brand bar, no bottom navigation. A screen asks for it while mounted;
 * leaving gives the bars back.
 */
let immersive = false
const listeners = new Set<() => void>()

function set(value: boolean) {
  if (immersive === value) return
  immersive = value
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether a screen asked for the immersive mode (AppShell). */
export function useImmersiveMode(): boolean {
  return useSyncExternalStore(subscribe, () => immersive)
}

/** Hides the app's bars while the calling screen is mounted and `on` is true. */
export function useImmersive(on: boolean): void {
  useEffect(() => {
    set(on)
    return () => set(false)
  }, [on])
}
