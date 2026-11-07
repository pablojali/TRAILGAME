import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { ordinal } from './raceText'
import { newGame, onSunday, withAthlete, withEntry } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer, settled } from '../../test/renderApp'

/** A level-11 career (3,250 XP, Ridge Runner's recommended level) with the given coins. */
function level11(coins: number): GameState {
  return { ...withAthlete(newGame(), { xp: 3_250 }), coins }
}

/** A level-2 career (100 XP), within Forest First Steps' levels (1–6, recommended 4). */
function level2(): GameState {
  return withAthlete(newGame(), { xp: 100 })
}

function card(name: string) {
  return screen.getByRole('link', { name: new RegExp(`^${name}`) })
}

describe('Race Hub', () => {
  it('shows one difficulty at a time in tabs (I–V), with level and coin balance', async () => {
    const user = userEvent.setup()
    seedCareer()
    const { router } = await renderApp('/races')
    expect(screen.getByRole('heading', { level: 1, name: 'Races' })).toBeInTheDocument()
    expect(within(screen.getAllByRole('banner')[0]!).getByText('Lvl 1')).toBeInTheDocument()
    expect(within(screen.getAllByRole('banner')[0]!).getByText('25').parentElement).toHaveTextContent('25 coins')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['I', 'II', 'III', 'IV', 'V'])
    // Level 1: Difficulty I first, with its three races.
    expect(screen.getByRole('tab', { name: 'I' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('link', { name: /km/ })).toHaveLength(3)
    await user.click(screen.getByRole('tab', { name: 'II' }))
    expect(router.state.location.search).toBe('?difficulty=II')
    expect(screen.getAllByRole('link', { name: /km/ })).toHaveLength(3)
    // Level 1: Ridge Runner opens at Level 6 (5 below its recommended level).
    expect(card('Ridge Runner')).toHaveAccessibleName('Ridge Runner 12 km · 550 m D+ Lvl 6')
  })

  it('shows Free for races the runner may enter, the opening level, and the last level of easy races', async () => {
    const user = userEvent.setup()
    seedCareer(level11(0))
    await renderApp('/races')
    // Level 11: Difficulty II first (the first difficulty with a race at or above the level).
    expect(screen.getByRole('tab', { name: 'II' })).toHaveAttribute('aria-selected', 'true')
    expect(within(card('Ridge Runner')).getByText('Free')).toBeInTheDocument()
    // Stone Path Classic (recommended 14) opens at 9; Wildwood Ascent (18) at 13.
    expect(within(card('Stone Path Classic')).getByText('Free')).toBeInTheDocument()
    expect(within(card('Wildwood Ascent')).getByText('Lvl 13')).toBeInTheDocument()
    // Easy races close 2 levels above their recommended level.
    await user.click(screen.getByRole('tab', { name: 'I' }))
    expect(within(card('Forest First Steps')).getByText('Up to Lvl 6')).toBeInTheDocument()
    expect(within(card('Pine Loop Challenge')).getByText('Up to Lvl 10')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'V' }))
    expect(within(card('Beyond the Skyline')).getByText('Lvl 45')).toBeInTheDocument()
    expect(card('Beyond the Skyline')).toHaveAttribute('href', '/races/RACE-012')
  })

  it('opens the tab of a pending entry and keeps the tab in the URL', async () => {
    const entered = withEntry(level11(500), 'RACE-007', 0)
    seedCareer(entered.state)
    const first = await renderApp('/races')
    expect(screen.getByRole('tab', { name: 'III' })).toHaveAttribute('aria-selected', 'true')
    first.unmount()
    await renderApp('/races?difficulty=V')
    expect(screen.getByRole('tab', { name: 'V' })).toHaveAttribute('aria-selected', 'true')
  })

  it('is reachable from the navigation', async () => {
    const user = userEvent.setup()
    seedCareer()
    const { router } = await renderApp('/')
    await user.click(screen.getByRole('link', { name: 'Races' }))
    expect(router.state.location.pathname).toBe('/races')
  })
})

describe('Race Detail', () => {
  it('shows the course, the free entry with its opening level, and potential prizes', async () => {
    seedCareer(level11(0))
    await renderApp('/races/RACE-007')
    expect(screen.getByRole('heading', { level: 1, name: 'Summit Quest' })).toBeInTheDocument()
    expect(screen.getByText('Trail · Difficulty III')).toBeInTheDocument()
    expect(screen.getByText('22 km')).toBeInTheDocument()
    expect(screen.getByText('1,300 m')).toBeInTheDocument()
    expect(screen.getByText('Steep climbs, rocky descents')).toBeInTheDocument()
    // Tiles, no prize explanations (owner request, 1 November 2026).
    // Summit Quest (recommended 21) takes levels 16 to 23: the level-11 runner cannot enter yet.
    expect(screen.getByText('Entry').nextElementSibling).toHaveTextContent('Free · levels 16–23')
    expect(screen.getByText('Recommended level').nextElementSibling).toHaveTextContent('21 (you: 11)')
    const prizes = within(screen.getByRole('list', { name: 'Gross coin prizes by finishing position' })).getAllByRole('listitem')
    expect(prizes.map((r) => r.textContent)).toEqual(['1st700', '2nd490', '3rd350', '4th–10th175', '11th+70'])
    expect(screen.queryByText(/reduced when your level is above/)).not.toBeInTheDocument()
  })

  it('marks reduced and zero rewards for easy races', async () => {
    seedCareer(withAthlete(newGame(), { xp: 3_850 })) // level 12
    const view = await renderApp('/races/RACE-004')
    expect(screen.getByText(/· 75% at your level/)).toBeInTheDocument()
    view.unmount()
    await renderApp('/races/RACE-001')
    expect(screen.getByText(/· 0% at your level/)).toBeInTheDocument()
  })

  it('blocks entry outside the race\'s levels and says why', async () => {
    const user = userEvent.setup()
    seedCareer(level11(0))
    const above = await renderApp('/races/RACE-001')
    expect(screen.getByRole('button', { name: 'Enter race' })).toHaveAccessibleDescription('Open up to level 6 (you: 11): choose a harder race.')
    above.unmount()
    seedCareer(newGame())
    await renderApp('/races/RACE-003')
    const enter = screen.getByRole('button', { name: 'Enter race' })
    expect(enter).toHaveAttribute('aria-disabled', 'true')
    expect(enter).toHaveAccessibleDescription('Opens at level 3 (you: 1).')
    await user.click(enter)
    expect(screen.queryByRole('heading', { name: /Confirm entry/ })).not.toBeInTheDocument()
    expect(readSave()!.state).toMatchObject({ coins: 25, raceEntries: [] })
  })

  it('confirms a free entry, records it once and keeps it after a reload', async () => {
    const user = userEvent.setup()
    seedCareer(level2())
    const first = await renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    expect(screen.getByRole('heading', { name: 'Confirm entry to Forest First Steps' })).toHaveFocus()
    expect(screen.getByText(/Balance stays 25 coins/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    expect(screen.getByText('Entry confirmed. Entry fee paid: free entry.')).toHaveAttribute('role', 'status')
    expect(screen.getByText(/Race day: Sunday, week 1\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start race/ })).not.toBeInTheDocument()
    expect(readSave()!.state.raceEntries).toHaveLength(1)
    first.unmount()

    await renderApp('/races/RACE-001')
    expect(screen.getByText('Entry fee paid: free entry.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enter race' })).not.toBeInTheDocument()
    expect(readSave()!.state.raceEntries).toHaveLength(1)
  })

  it('never charges for an entry, even with no coins, and enters once on a double tap', async () => {
    const user = userEvent.setup()
    seedCareer(level11(0))
    await renderApp('/races/RACE-004')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    expect(screen.getByText('Free entry.').parentElement).toHaveTextContent('Free entry. Balance stays 0 coins.')
    await user.dblClick(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    expect(readSave()!.state).toMatchObject({ coins: 0, raceEntries: [{ raceId: 'RACE-004', feePaid: 0, entryType: 'free' }] })
    expect(readSave()!.state.raceEntries).toHaveLength(1)
  })

  it('Cancel enters nothing', async () => {
    const user = userEvent.setup()
    seedCareer(level11(300))
    await renderApp('/races/RACE-004')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Enter race' })).toBeInTheDocument()
    expect(readSave()!.state).toMatchObject({ coins: 300, raceEntries: [] })
  })

  it('shows a not-found screen for an unknown race', async () => {
    seedCareer()
    await renderApp('/races/RACE-999')
    expect(screen.getByRole('heading', { level: 1, name: 'Race not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to races' })).toHaveAttribute('href', '/races')
  })
})

describe('Race day and results', () => {
  async function enterAndStart(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: /^Confirm free entry|^Pay / }))
    await settled()
    await user.click(screen.getByRole('link', { name: /^Prepare race/ }))
    await runToFinish(user)
  }

  /** From the preparation: Start at Target pace, then the default stop and intensity to the finish. */
  async function runToFinish(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Start race' }))
    // Each segment is confirmed asynchronously (by the server when one is configured).
    for (;;) {
      const next = await screen.findByRole('button', { name: /stop, (continue|run to the finish)$/ })
      const last = /finish/.test(next.textContent ?? '')
      await user.click(next)
      if (last) break
    }
    await screen.findByRole('tab', { name: 'Result' })
  }

  it('enters for this week’s Sunday and allows one race per week', async () => {
    const user = userEvent.setup()
    seedCareer(level2())
    await renderApp('/races/RACE-001')
    expect(screen.getByText('Sunday, week 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    expect(screen.getByText('Race day: Sunday, week 1.')).toBeInTheDocument()
    expect(screen.getByText(/Today is Monday\. Train until then/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← All races' }))
    await user.click(screen.getByRole('link', { name: /^Riverside Trail/ }))
    expect(screen.getByText(/already entered in Forest First Steps on Sunday/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enter race' })).not.toBeInTheDocument()
  })

  it('runs a race once on Sunday, shows the result with rewards and explanation, and keeps it after a reload', async () => {
    const scrollIntoView = vi.fn(() => Promise.resolve())
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
    const user = userEvent.setup()
    seedCareer(onSunday(level2()))
    const first = await renderApp('/races/RACE-001')
    await enterAndStart(user)

    const save = readSave()!.state
    const entry = save.raceEntries[0]!
    if (entry.status !== 'finished') throw new Error('not finished')
    const { result } = entry
    expect(first.router.state.location.pathname).toBe('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 30` })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Result' })).toHaveAttribute('aria-selected', 'true')
    const tiles = within(screen.getByText('Coins awarded').closest('dl')!)
    expect(tiles.getByText('Rewards').nextElementSibling).toHaveTextContent('100%')
    expect(tiles.getByText('Coins awarded').nextElementSibling).toHaveTextContent(`${result.coinsAwarded} coins`)
    expect(tiles.getByText('XP awarded').nextElementSibling).toHaveTextContent(`${result.xpAwarded} XP`)
    expect(screen.getByText(/Week 1, Sunday/)).toBeInTheDocument()
    // No "Why" tab any more (owner request, 1 November 2026).
    expect(screen.queryByRole('tab', { name: 'Why' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Full results' }))
    expect(first.router.state.location.search).toBe('?tab=standings')
    expect(screen.getByRole('region', { name: 'Full results · 30 runners' })).toBeInTheDocument()
    const table = within(screen.getByRole('table', { name: 'Full results of Forest First Steps' }))
    expect(table.getAllByRole('row')).toHaveLength(31)
    const you = table.getByRole('rowheader', { name: 'Demo Runner (you)' }).closest('tr')!
    expect(you).toHaveAttribute('aria-current', 'true')
    expect(within(you).getAllByRole('cell')[0]).toHaveTextContent(String(result.position))
    // Leaving Full results works even where scrollIntoView returns a promise (newer Chrome): the
    // effect that scrolls to the runner's row once crashed the screen (owner report, 6 November 2026).
    expect(scrollIntoView).toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: 'Splits' }))
    await user.click(screen.getByRole('tab', { name: 'Full results' }))
    await user.click(screen.getByRole('tab', { name: 'Result' }))
    expect(screen.getByText('Coins awarded')).toBeInTheDocument()
    delete (Element.prototype as Partial<Element>).scrollIntoView
    expect(save).toMatchObject({ coins: 25 + result.coinsAwarded, athlete: { xp: 100 + result.xpAwarded, fatigue: 10.95 } })
    expect(save.activeRace).toBeNull()
    expect(save.week).toMatchObject({ number: 2, currentDayIndex: 0 })
    first.unmount()

    // Reopening the result never awards again.
    await renderApp('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 30` })).toBeInTheDocument()
    expect(readSave()!.state).toEqual(save)
  })

  it('shows the race on Sunday in Training and runs it from there', async () => {
    const user = userEvent.setup()
    const entered = withEntry(newGame(), 'RACE-001', 0)
    seedCareer(entered.state)
    const monday = await renderApp('/training')
    await user.click(screen.getByRole('button', { name: /^Sunday, Race: Forest First Steps, planned/ }))
    expect(screen.getByText(/Race day: Forest First Steps replaces this day’s session/)).toBeInTheDocument()
    monday.unmount()

    seedCareer(onSunday(entered.state))
    const sunday = await renderApp('/training')
    expect(screen.getByRole('heading', { name: 'Race: Forest First Steps' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Prepare race' }))
    await runToFinish(user)
    expect(sunday.router.state.location.pathname).toBe('/races/results/entry-1')
    await user.click(screen.getByRole('link', { name: 'Back to races' }))
    await user.click(screen.getByRole('link', { name: /^Forest First Steps/ }))
    expect(screen.getByText('Your results')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter race' })).toBeInTheDocument()
  })

  it('runs a race step by step: preparation, aid stations with decisions, resume after a reload, splits', async () => {
    const user = userEvent.setup()
    // Mountain Ascent (RACE-007): 4 segments, 3 aid stations. One gel in stock, no bar.
    const entered = withEntry({ ...withAthlete(newGame(), { xp: 5000 }), consumables: { gel: 1, bar: 0 } }, 'RACE-007', 0)
    seedCareer(onSunday(entered.state))
    const first = await renderApp('/races/run/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Race preparation' })).toBeInTheDocument()
    // Two tabs (owner request, 4 November 2026): the equipment worn is in the second.
    await user.click(screen.getByRole('tab', { name: 'Equipment' }))
    expect(screen.getByText('Nothing equipped.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Strategy' }))
    expect(screen.getByText('Course · 4 segments, 3 aid stations')).toBeInTheDocument()
    // The gel is taken by default (in stock); there is no bar to take.
    expect(screen.getByRole('button', { name: /^Take energy gel/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^No cereal bar/ })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: 'Hard' }))
    expect(screen.getByText(/^2% faster, 60% more fatigue/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start race' }))

    // Aid station 1: report, then the stop and intensity for segment 2.
    expect(await screen.findByText(/Aid station 1 of 3/)).toBeInTheDocument()
    let save = readSave()!.state
    expect(save.consumables).toEqual({ gel: 0, bar: 0 })
    expect(save.activeRace).toMatchObject({ nutrition: { gel: true, bar: false }, splits: [{ intensity: 'hard' }] })
    const report = within(screen.getByRole('region', { name: 'Aid station report' }))
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(save.activeRace!.splits[0]!.position)} of 30` })).toBeInTheDocument()
    expect(report.getByText('Energy')).toBeInTheDocument()
    expect(report.getByText('Nutrition').nextElementSibling).toHaveTextContent('Gel')
    expect(report.getByText('Next: segment 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Slow 2:50 min' }))
    await user.click(screen.getByRole('button', { name: 'Easy' }))
    await user.click(screen.getByRole('button', { name: 'Slow stop, continue' }))
    expect(await screen.findByText(/Aid station 2 of 3/)).toBeInTheDocument()
    save = readSave()!.state
    expect(save.activeRace!.splits.map((s) => [s.intensity, s.stop ?? null])).toEqual([
      ['hard', 'slow'],
      ['easy', null],
    ])
    first.unmount()

    // Reloading mid-race resumes at the same aid station; race day points back to it.
    const again = await renderApp('/races/RACE-007')
    expect(screen.getByText(/Race in progress\./)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Continue race' }))
    expect(await screen.findByText(/Aid station 2 of 3/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quick 20 s' }))
    await user.click(screen.getByRole('button', { name: 'Quick stop, continue' }))
    await user.click(await screen.findByRole('button', { name: 'Normal stop, run to the finish' }))
    await screen.findByRole('tab', { name: 'Result' })
    expect(again.router.state.location.pathname).toBe('/races/results/entry-1')

    await user.click(screen.getByRole('tab', { name: 'Splits' }))
    const table = within(screen.getByRole('table', { name: 'Splits by segment' }))
    expect(table.getAllByRole('row')).toHaveLength(5)
    expect(table.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Hard', 'Easy', 'Easy', 'Easy'])
    expect(screen.getByText('Nutrition: gel.')).toBeInTheDocument()
    const finished = readSave()!.state.raceEntries[0]!
    if (finished.status !== 'finished') throw new Error('not finished')
    expect(finished.result.splits!.map((s) => s.stop ?? null)).toEqual(['slow', 'quick', 'normal', null])
    expect(readSave()!.state.activeRace).toBeNull()
  })

  it('shows race day on the Dashboard on Sunday', async () => {
    const entered = withEntry(newGame(), 'RACE-001', 0)
    seedCareer(onSunday(entered.state))
    await renderApp('/')
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Today · Race: Forest First Steps')
    expect(screen.getByRole('link', { name: 'Go to race' })).toHaveAttribute('href', '/races/RACE-001')
  })

  it('warns before an injuring race and explains reduced rewards', async () => {
    const user = userEvent.setup()
    // Level 6 (2 above Forest First Steps) and Fatigue 90: +11 race Fatigue reaches 100.
    seedCareer(onSunday(withAthlete(newGame(), { xp: 1000, fatigue: 90 })))
    await renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    await user.click(screen.getByRole('link', { name: 'Prepare race — injury risk' }))
    await runToFinish(user)
    expect(await screen.findByText('18 XP (injured)')).toBeInTheDocument()
    expect(screen.getByText('Rewards').nextElementSibling).toHaveTextContent('40%')
    expect(screen.getByText('Injured').nextElementSibling).toHaveTextContent('Fitness −15 · 5 forced rest days')
    expect(readSave()!.state.forcedRestDays).toBe(5)
  })

  it('moves the race to the next Sunday when Sunday is a forced rest day', async () => {
    const user = userEvent.setup()
    const sunday = onSunday(level2())
    seedCareer({
      ...sunday,
      forcedRestDays: 1,
      week: { ...sunday.week, days: sunday.week.days.map((d, i) => (i === 6 ? { ...d, session: 'rest' as const } : d)) },
    })
    await renderApp('/races/RACE-001')
    expect(screen.getByText('Sunday, week 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    expect(screen.getByText(/Sunday is a forced rest day, so the race moves to Sunday of week 2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start race/ })).not.toBeInTheDocument()
  })

  it('shows not-found and not-raced-yet states for result links', async () => {
    seedCareer()
    const view = await renderApp('/races/results/entry-7')
    expect(screen.getByRole('heading', { level: 1, name: 'Result not found' })).toBeInTheDocument()
    view.unmount()
    const pending = withEntry(newGame(), 'RACE-001', 0)
    seedCareer(pending.state)
    await renderApp('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Not raced yet' })).toBeInTheDocument()
  })
})
