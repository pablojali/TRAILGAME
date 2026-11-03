/**
 * Race clips (owner request, 3 November 2026): a short video per race and segment, played after
 * Start and after each aid station, before the next aid-station report or the finish.
 *
 *   assets/race/clips/{race id}/segment-{n}.mp4   (also .webm; poster: same name .jpg or .webp)
 *
 * Segment 1 runs from the start to aid station 1; the last segment ends at the finish. A missing
 * clip is simply skipped. Clips are presentation only: the segment is already run by the server.
 */
const FILES = import.meta.glob<string>('/assets/race/clips/*/*.{mp4,webm,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface RaceClip {
  mp4?: string
  webm?: string
  poster?: string
}

/** The clip of segment `segment` (1-based) of a race, or null when there is no video for it. */
export function raceClip(raceId: string, segment: number, files: Record<string, string> = FILES): RaceClip | null {
  const base = `/assets/race/clips/${raceId}/segment-${segment}`
  const clip: RaceClip = {
    mp4: files[`${base}.mp4`],
    webm: files[`${base}.webm`],
    poster: files[`${base}.jpg`] ?? files[`${base}.jpeg`] ?? files[`${base}.webp`],
  }
  return clip.mp4 || clip.webm ? clip : null
}
