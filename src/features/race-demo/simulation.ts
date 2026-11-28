import { artIn } from './assets'
import type { RaceViewState, RunnerAppearance } from './types'
import { seededRandom } from './world'

/**
 * A made-up race for the demo: rivals whose speed wanders around the player's, so they come and go.
 * The real race simulation replaces this later by giving the view the same RaceViewState.
 */

const SHORTS = ['black', 'navy', 'grey']
const HAIRS = ['short-dark', 'short-brown', 'short-blond', 'ponytail-dark', 'ponytail-red', 'cap-white']
/**
 * The kits of a sex with back-view art in a folder of runner/ (`clothing` → `lvl1_men_shirt`…,
 * `footwear` → `lvl0_men_shoes`…), by level: every one the owner uploads in Trail Studio shows in the
 * demo. Empty while there is none.
 */
export function kitsFor(folder: 'clothing' | 'footwear', sex: 'men' | 'women'): string[] {
  const prefix = `runner/${folder}/`
  const names = [...new Set(artIn(prefix).map((key) => key.slice(prefix.length).replace(/_f\d+$/, '')))]
  const item = folder === 'clothing' ? 'shirt' : 'shoes'
  return names.filter((name) => name.includes(`_${sex}_${item}`))
}

/** The shoes of a sex: the first pair the owner uploaded, or a placeholder colour while there is none. */
function shoesFor(sex: 'men' | 'women'): string {
  return kitsFor('footwear', sex)[0] ?? 'orange'
}

/**
 * The k-th kit of a list (owner, 28 November 2026: at least one runner in each shirt and each pair
 * of shoes), going round the list; a fallback while the list is empty.
 */
function kitAt(list: readonly string[], k: number, fallback: string): string {
  return list.length > 0 ? list[k % list.length]! : fallback
}
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

/**
 * The player: the owner's first full set of back-view layers (26 November 2026): men, tone 3, the
 * level 1 hair and the level 3 tank top.
 */
export const PLAYER_APPEARANCE: RunnerAppearance = { sex: 'men', skin: 'tone-3', hair: 'lvl1_men_head_tone3', shirt: 'lvl3_men_shirt', shorts: 'black', shoes: shoesFor('men'), pack: null, bib: 7 }

/** Rival gaps stay between these: far ahead (beyond the horizon) and far behind (out of sight). */
export const GAP_MIN = -170
export const GAP_MAX = 40
const RIVAL_BASE_SPEED = 3.2

export class RaceSimulation {
  speed = 3.2
  private rivals: SimRival[] = []
  private next = 1
  private readonly random: () => number

  /**
   * The demo starts with the whole cast (owner, 26 November 2026): one rival for each sex and skin
   * tone, close ahead in a staggered line so all eight show at once, then free to come and go.
   */
  constructor(seed = 11, rivals = 8) {
    this.random = seededRandom(seed)
    for (let i = 0; i < rivals; i++) {
      const id = this.add()
      const rival = this.rivals.find((r) => r.id === id)!
      rival.gap = -(5 + i * 4.5)
    }
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
    const sex = n % 2 === 0 ? 'women' : 'men'
    /** This rival's place among those of its sex: 0, 1, 2… */
    const k = Math.floor((n - 1) / 2)
    const fromBehind = n % 3 === 0
    const rival: SimRival = {
      id: `rival-${n}`,
      gap: fromBehind ? 12 + this.random() * 10 : -(12 + this.random() * 70),
      pace: fromBehind ? 0.4 + this.random() * 0.3 : (this.random() - 0.5) * 0.6,
      pinned: false,
      appearance: {
        // Men and women in turn, the skin tones 1 to 4 in pairs, so eight rivals are the whole cast
        // (owner art of 26 November 2026). Each wears the next shirt and the next pair of shoes of
        // their sex, so the field shows every kit; their hair is still to come, so they run bald.
        sex,
        skin: `tone-${((Math.ceil(n / 2) - 1) % 4) + 1}`,
        hair: pick(HAIRS),
        shirt: kitAt(kitsFor('clothing', sex), k, 'red'),
        shorts: pick(SHORTS),
        shoes: kitAt(kitsFor('footwear', sex), k, 'orange'),
        pack: pick(PACKS),
        bib: 10 + n,
      },
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
