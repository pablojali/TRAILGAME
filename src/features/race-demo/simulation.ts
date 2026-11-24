import type { RaceViewState, RunnerAppearance } from './types'
import { seededRandom } from './world'

/**
 * A made-up race for the demo: rivals whose speed wanders around the player's, so they come and go.
 * The real race simulation replaces this later by giving the view the same RaceViewState.
 */

const SHIRTS = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'purple', 'teal']
const SHORTS = ['black', 'navy', 'grey']
const HAIRS = ['short-dark', 'short-brown', 'short-blond', 'ponytail-dark', 'ponytail-red', 'cap-white']
const SHOES = ['orange', 'white', 'lime', 'blue', 'pink']
const PACKS = [null, 'vest-black', 'vest-blue']

interface SimRival {
  id: string
  /** Metres behind the player (negative = ahead). */
  gap: number
  /** This rival's speed minus a steady 3.2 m/s, metres per second; wanders over time. */
  pace: number
  /** Held at its gap by the debug slider. */
  pinned: boolean
  appearance: RunnerAppearance
}

export const PLAYER_APPEARANCE: RunnerAppearance = { skin: 'tone-2', hair: 'short-dark', shirt: 'black', shorts: 'black', shoes: 'orange', pack: 'vest-black', bib: 7 }

/** Rival gaps stay between these: far ahead (beyond the horizon) and far behind (out of sight). */
export const GAP_MIN = -170
export const GAP_MAX = 40
const RIVAL_BASE_SPEED = 3.2

export class RaceSimulation {
  speed = 3.2
  private rivals: SimRival[] = []
  private next = 1
  private readonly random: () => number

  constructor(seed = 11, rivals = 4) {
    this.random = seededRandom(seed)
    for (let i = 0; i < rivals; i++) this.add()
  }

  get ids(): string[] {
    return this.rivals.map((r) => r.id)
  }

  gapOf(id: string): number | undefined {
    return this.rivals.find((r) => r.id === id)?.gap
  }

  /** Adds a rival far ahead (it appears out of the distance) or, now and then, coming from behind. */
  add(): string {
    const pick = <T>(list: readonly T[]): T => list[Math.floor(this.random() * list.length)]!
    const n = this.next++
    const fromBehind = n % 3 === 0
    const rival: SimRival = {
      id: `rival-${n}`,
      gap: fromBehind ? 12 + this.random() * 10 : -(12 + this.random() * 70),
      pace: fromBehind ? 0.4 + this.random() * 0.3 : (this.random() - 0.5) * 0.6,
      pinned: false,
      appearance: { skin: `tone-${1 + Math.floor(this.random() * 4)}`, hair: pick(HAIRS), shirt: pick(SHIRTS), shorts: pick(SHORTS), shoes: pick(SHOES), pack: pick(PACKS), bib: 10 + n },
    }
    this.rivals.push(rival)
    return rival.id
  }

  /** Removes a rival (the last one when no id is given). */
  remove(id?: string): void {
    const index = id === undefined ? this.rivals.length - 1 : this.rivals.findIndex((r) => r.id === id)
    if (index >= 0) this.rivals.splice(index, 1)
  }

  /** Puts a rival at a gap and holds it there (debug slider), or lets it run again. */
  setGap(id: string, gap: number | null): void {
    const rival = this.rivals.find((r) => r.id === id)
    if (!rival) return
    rival.pinned = gap !== null
    if (gap !== null) rival.gap = Math.max(GAP_MIN, Math.min(GAP_MAX, gap))
  }

  step(dt: number): void {
    for (const rival of this.rivals) {
      if (rival.pinned) continue
      rival.pace = Math.max(-0.8, Math.min(0.8, rival.pace + (this.random() - 0.5) * 0.6 * dt))
      rival.gap += (this.speed - (RIVAL_BASE_SPEED + rival.pace)) * dt
      // Out of sight at either end, a rival turns around in the field so it comes back.
      if (rival.gap < GAP_MIN) {
        rival.gap = GAP_MIN
        rival.pace = -Math.abs(rival.pace) - 0.1
      } else if (rival.gap > GAP_MAX) {
        rival.gap = GAP_MAX
        rival.pace = Math.abs(rival.pace) + 0.1
      }
    }
  }

  state(): RaceViewState {
    return {
      speed: this.speed,
      runners: this.rivals.map((r) => ({ id: r.id, gapMetros: r.gap, appearance: r.appearance })),
      player: { appearance: PLAYER_APPEARANCE },
    }
  }
}
