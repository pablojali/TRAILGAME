import { useEffect, useSyncExternalStore } from 'react'
import type { BackdropScene } from './backdrops'

/**
 * A screen can ask for another backdrop than its section's while it shows something else, e.g. a
 * Sunday Major at an aid station shows the solo races' aid-station picture (owner request,
 * 11 November 2026). The last screen to ask wins; leaving gives the section's scene back.
 */
let override: BackdropScene | null = null
const listeners = new Set<() => void>()

function set(scene: BackdropScene | null) {
  if (override === scene) return
  override = scene
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The scene a screen asked for, if any (AppShell). */
export function useSceneOverride(): BackdropScene | null {
  return useSyncExternalStore(subscribe, () => override)
}

/** Shows `scene` behind the calling screen while it is mounted (null: the section's own). */
export function useBackdropScene(scene: BackdropScene | null): void {
  useEffect(() => {
    set(scene)
    return () => set(null)
  }, [scene])
}
