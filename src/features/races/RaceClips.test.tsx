import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newGame, onSunday, withEntry } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'
import { raceClip } from './raceClips'

vi.mock('./raceClips', async (original) => {
  const actual = await original<typeof import('./raceClips')>()
  // Every segment of every race has a clip in this test.
  return { ...actual, raceClip: (raceId: string, segment: number) => actual.raceClip(raceId, segment, { [`/assets/race/clips/${raceId}/segment-${segment}.mp4`]: `clip-${segment}.mp4` }) }
})

describe('race clips (owner request, 3 November 2026)', () => {
  it('finds a race segment clip by its file name, with an optional webm and poster', async () => {
    const actual = await vi.importActual<typeof import('./raceClips')>('./raceClips')
    const files = {
      '/assets/race/clips/RACE-001/segment-1.mp4': 'a.mp4',
      '/assets/race/clips/RACE-001/segment-1.webm': 'a.webm',
      '/assets/race/clips/RACE-001/segment-1.jpg': 'a.jpg',
      '/assets/race/clips/RACE-001/segment-2.jpg': 'b.jpg',
    }
    expect(actual.raceClip('RACE-001', 1, files)).toEqual({ mp4: 'a.mp4', webm: 'a.webm', poster: 'a.jpg' })
    // A poster alone is not a clip; another race has its own folder.
    expect(actual.raceClip('RACE-001', 2, files)).toBeNull()
    expect(actual.raceClip('RACE-002', 1, files)).toBeNull()
    expect(raceClip('RACE-001', 1)).not.toBeNull()
  })

  it('plays the clip of each segment after Start and after the aid station, then shows the next step', async () => {
    const user = userEvent.setup()
    const entered = withEntry({ ...newGame(), consumables: { gel: 0, bar: 0 } }, 'RACE-001', 0)
    seedCareer(onSunday(entered.state))
    const view = await renderApp('/races/run/entry-1')

    await user.click(screen.getByRole('button', { name: 'Start race' }))
    // Segment 1's clip: the race already started on the server; Skip closes it.
    const first = await screen.findByRole('dialog', { name: /^Forest First Steps · Segment 1 of 2/ })
    expect(first.querySelector('video source')).toHaveAttribute('src', 'clip-1.mp4')
    // Ambient sound on by default (owner request, 7 November 2026); the choice is remembered.
    const video = first.querySelector('video')!
    expect(video.muted).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Turn sound off' }))
    expect(video.muted).toBe(true)
    expect(localStorage.getItem('trailgame.clipSound')).toBe('off')
    await user.click(screen.getByRole('button', { name: 'Turn sound on' }))
    expect(video.muted).toBe(false)
    expect(localStorage.getItem('trailgame.clipSound')).toBe('on')
    expect(readSave()!.state.activeRace).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText(/Aid station 1 of 1/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The last segment's clip ends at the finish, then the result.
    await user.click(screen.getByRole('button', { name: /stop, run to the finish$/ }))
    await screen.findByRole('dialog', { name: /Segment 2 of 2/ })
    expect(view.router.state.location.pathname).toBe('/races/run/entry-1')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByRole('tab', { name: 'Result' })
    expect(view.router.state.location.pathname).toBe('/races/results/entry-1')
  })

  it('plays muted when the browser refuses sound without a tap, and the sound button turns it on', async () => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(undefined)
    try {
      const user = userEvent.setup()
      const entered = withEntry({ ...newGame(), consumables: { gel: 0, bar: 0 } }, 'RACE-001', 0)
      seedCareer(onSunday(entered.state))
      await renderApp('/races/run/entry-1')
      await user.click(screen.getByRole('button', { name: 'Start race' }))
      const clip = await screen.findByRole('dialog', { name: /Segment 1 of 2/ })
      const video = clip.querySelector('video')!
      await screen.findByRole('button', { name: 'Turn sound on' })
      expect(video.muted).toBe(true)
      await user.click(screen.getByRole('button', { name: 'Turn sound on' }))
      expect(video.muted).toBe(false)
    } finally {
      HTMLMediaElement.prototype.play = play
    }
  })

  it('with reduce motion on, waits on the poster for a tap instead of skipping the clip', async () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as typeof window.matchMedia
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    try {
      const user = userEvent.setup()
      const entered = withEntry({ ...newGame(), consumables: { gel: 0, bar: 0 } }, 'RACE-001', 0)
      seedCareer(onSunday(entered.state))
      await renderApp('/races/run/entry-1')
      await user.click(screen.getByRole('button', { name: 'Start race' }))
      const clip = await screen.findByRole('dialog', { name: /Segment 1 of 2/ })
      const video = clip.querySelector('video')!
      expect(video.autoplay).toBe(false)
      expect(play).not.toHaveBeenCalled()
      // It does not close by itself: the player chooses to watch it or skip it.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(screen.getByRole('dialog', { name: /Segment 1 of 2/ })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Play clip' }))
      expect(play).toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Play clip' })).not.toBeInTheDocument()
    } finally {
      window.matchMedia = matchMedia
      play.mockRestore()
    }
  })
})
