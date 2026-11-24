/**
 * The race back view (owner brief, 24 November 2026): the runner seen from behind, the trail running
 * to the horizon, rivals ahead and behind. The view only draws a state; it does not know where the
 * state comes from (a simulated generator in the demo, the real race simulation later).
 */

/**
 * How a runner looks from behind. The shirt, pack and hair name the owner's art like the avatar's
 * files (`lvl1_men_shirt_01`…, see backSprites.ts); an id with no art is a placeholder colour of the
 * coded runner, drawn only while there is no body art.
 */
export interface RunnerAppearance {
  /** Whose body art: `men` (default) or `women`. */
  sex?: 'men' | 'women'

  /** Skin tone, e.g. `tone-2` (same ids as the avatar). */
  skin: string
  hair: string
  shirt: string
  shorts: string
  shoes: string
  /** A pack or running vest worn over the shirt, or none. */
  pack: string | null
  /** Race number on the back. */
  bib?: number
}

export interface RaceViewRunner {
  id: string
  /**
   * Metres between this runner and the player: negative is ahead (towards the horizon), positive is
   * behind (towards the camera, then off screen).
   */
  gapMetros: number
  appearance: RunnerAppearance
}

export interface RaceViewState {
  /** The player's speed in metres per second (0 = standing). */
  speed: number
  runners: RaceViewRunner[]
  player: { appearance: RunnerAppearance }
}

/** Where the view reads its state from, once per frame. */
export type RaceViewSource = () => RaceViewState
