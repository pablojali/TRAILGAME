/**
 * Screen backgrounds (owner request, 31 October 2026). Each section of the app has a scene; the
 * owner's illustration is used when it exists in `assets/ui/backgrounds/{scene}.{webp,jpg,png}`,
 * otherwise a scene drawn in code (Backdrop.tsx). Race cards use `assets/ui/races/{race id}.*` the
 * same way. Cosmetic only.
 */
export type BackdropScene = 'dashboard' | 'training' | 'equipment' | 'races' | 'career' | 'settings'

const BACKGROUNDS = import.meta.glob<string>('/assets/ui/backgrounds/*.{webp,jpg,jpeg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const RACE_PHOTOS = import.meta.glob<string>('/assets/ui/races/*.{webp,jpg,jpeg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

function byName(files: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(files).find((path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, '') === name)
  return key === undefined ? undefined : files[key]
}

/** The owner's background for a scene, if there is one. */
export function backgroundImage(scene: BackdropScene): string | undefined {
  return byName(BACKGROUNDS, scene)
}

/** The owner's photo of a race, if there is one (e.g. `RACE-001.webp`). */
export function racePhoto(raceId: string): string | undefined {
  return byName(RACE_PHOTOS, raceId)
}

/** The scene of a route: each screen takes the scene of the section it belongs to. */
export function sceneForPath(pathname: string): BackdropScene {
  const section = pathname.split('/')[1] ?? ''
  switch (section) {
    case '':
    case 'attributes':
      return 'dashboard'
    case 'training':
      return 'training'
    case 'equipment':
    case 'appearance':
      return 'equipment'
    case 'races':
      return 'races'
    case 'career':
      return 'career'
    default:
      return 'settings'
  }
}
