import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { ordinal } from './raceText'
import { newGame, onSunday, withAthlete, withEntry } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer, settled } from '../../test/renderApp'

/** A level-11 career (3,250 XP, Ridge Runner's recommended level) with the given coins. */
function level11(coins: number): GameState {
  return { ...withAthlete(newGame(), { xp: 3_250 }), coins }
}

/** A level-2 career (100 XP): the lowest level that may enter Forest First Steps (recommended 4). */
function level2(): GameState {
  return withAthlete(newGame(), { xp: 100 })
}

function card(name: string) {
  return screen.getByRole('link', { name: new RegExp(`^${name}`) })
}

describe('Race Hub', () => {
  it('shows one category at a time in tabs, with level and coin balance', async () => {
    const user = userEvent.setup()
    seedCareer()
    const { router } = await renderApp('/races')
    expect(screen.getByRole('heading', { level: 1, name: 'Races' })).toBeInTheDocument()
    expect(screen.getByText('Level 1').parentElement).toHaveTextContent('Level 1·25 coins')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Open', 'Trail', 'Mountain', 'Elite'])
    // Level 1: the Open tab first, with its three races.
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('link', { name: /km/ })).toHaveLength(3)
    await user.click(screen.getByRole('tab', { name: 'Trail' }))
    expect(router.state.location.search).toBe('?category=trail')
    expect(screen.getAllByRole('link', { name: /km/ })).toHaveLength(3)
    // Level 1: Ridge Runner opens at Level 9 (2 below its recommended level).
    expect(card('Ridge Runner')).toHaveAccessibleName('Ridge Runner 12 km · 550 m D+ · Rec. Lv 11 From Lv 9')
  })

  it('shows Free for races the runner may enter and the opening level for the others', async () => {
    const user = userEvent.setup()
    seedCareer(level11(0))
    await renderApp('/races')
    // Level 11: the Trail tab first (the first category with a race at or above the level).
    expect(screen.getByRole('tab', { name: 'Trail' })).toHaveAttribute('aria-selected', 'true')
    expect(within(card('Ridge Runner')).getByText('Free')).toBeInTheDocument()
    // Stone Path Classic (recommended 14) opens at 12; Wildwood Ascent (18) at 16.
    expect(within(card('Stone Path Classic')).getByText('From Lv 12')).toBeInTheDocument()
    expect(within(card('Wildwood Ascent')).getByText('From Lv 16')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Open' }))
    expect(within(card('Forest First Steps')).getByText('Free')).toBeInTheDocument()
    expect(within(card('Pine Loop Challenge')).getByText('Free')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Elite' }))
    expect(within(card('Beyond the Skyline')).getByText('From Lv 48')).toBeInTheDocument()
    expect(card('Beyond the Skyline')).toHaveAttribute('href', '/races/RACE-012')
  })

  it('opens the tab of a pending entry and keeps the tab in the URL', async () => {
    const entered = withEntry(level11(500), 'RACE-007', 0)
    seedCareer(entered.state)
    const first = await renderApp('/races')
    expect(screen.getByRole('tab', { name: 'Mountain' })).toHaveAttribute('aria-selected', 'true')
    first.unmount()
    await renderApp('/races?category=elite')
    expect(screen.getByRole('tab', { name: 'Elite' })).toHaveAttribute('aria-selected', 'true')
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
    expect(screen.getByText('Mountain race')).toBeInTheDocument()
    expect(screen.getByText('22 km')).toBeInTheDocument()
    expect(screen.getByText('1,300 m')).toBeInTheDocument()
    expect(screen.getByText('Steep climbs, rocky descents')).toBeInTheDocument()
    const entry = within(screen.getByRole('heading', { name: 'Entry' }).closest('article')!)
    // Summit Quest (recommended 21) opens at Level 19: the level-11 runner cannot enter yet.
    expect(entry.getByRole('listitem')).toHaveTextContent('Open from level 19Free')
    expect(entry.getByText(/Entry is free\. A race opens 2 levels below its recommended level \(21\)/)).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      '1st700 coins',
      '2nd490 coins',
      '3rd350 coins',
      '4th–10th175 coins',
      '11th or lower70 coins',
    ])
    expect(screen.getByText(/reduced when your level is above the recommended level/)).toBeInTheDocument()
    expect(screen.getByText(/At your level: 100% of prizes and XP/)).toBeInTheDocument()
  })

  it('explains reduced and zero rewards for easy races', async () => {
    seedCareer(withAthlete(newGame(), { xp: 3_850 })) // level 12
    const view = await renderApp('/races/RACE-004')
    expect(screen.getByText('At your level: 75% of prizes and XP.')).toBeInTheDocument()
    view.unmount()
    await renderApp('/races/RACE-001')
    expect(screen.getByText(/At your level: 0% of prizes and XP — this race is too easy/)).toBeInTheDocument()
  })

  it('blocks entry below the race\'s minimum level and says when it opens', async () => {
    const user = userEvent.setup()
    seedCareer(newGame())
    await renderApp('/races/RACE-001')
    const enter = screen.getByRole('button', { name: 'Enter race' })
    expect(enter).toHaveAttribute('aria-disabled', 'true')
    expect(enter).toHaveAccessibleDescription('Opens at level 2 (you: 1).')
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
    expect(screen.getByText(/The race takes today’s training day: Sunday’s Rest is not done/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Start race/ }))
    // The race is confirmed asynchronously (by the server when one is configured).
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
    const user = userEvent.setup()
    seedCareer(onSunday(level2()))
    const first = await renderApp('/races/RACE-001')
    await enterAndStart(user)

    const save = readSave()!.state
    const entry = save.raceEntries[0]!
    if (entry.status !== 'finished') throw new Error('not finished')
    const { result } = entry
    expect(first.router.state.location.pathname).toBe('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 50` })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Result' })).toHaveAttribute('aria-selected', 'true')
    const rewards = within(screen.getByRole('heading', { name: 'Rewards' }).closest('article')!)
    expect(rewards.getByText('Entry fee (paid at entry)').nextSibling).toHaveTextContent('Free')
    expect(rewards.getByText('Reward multiplier').nextSibling).toHaveTextContent('100%')
    expect(rewards.getByText('Coins awarded').nextSibling).toHaveTextContent(`${result.coinsAwarded} coins`)
    expect(rewards.getByText('XP awarded').nextSibling).toHaveTextContent(`${result.xpAwarded} XP`)
    expect(rewards.getByText('Net coin change').nextSibling).toHaveTextContent(`+${result.coinsAwarded} coins`)
    expect(screen.getByText(/Week 1, Sunday/)).toBeInTheDocument()

    // The explanation and the full results are one tab away.
    await user.click(screen.getByRole('tab', { name: 'Why' }))
    expect(screen.getByText(/than a typical runner in this field/)).toBeInTheDocument()
    expect(screen.getByText(/each measured on its own \(they don’t add up\)/)).toBeInTheDocument()
    if (!result.factors.some((f) => f.id === 'day-form')) {
      expect(screen.getByText(/^Day form [−+]\d+\.\d% \((a good day|an off day)\): fixed for this entry/)).toBeInTheDocument()
    }
    await user.click(screen.getByRole('tab', { name: 'Full results' }))
    expect(first.router.state.location.search).toBe('?tab=standings')
    expect(screen.getByRole('region', { name: 'Full results · 50 runners' })).toBeInTheDocument()
    const table = within(screen.getByRole('table', { name: 'Full results of Forest First Steps' }))
    expect(table.getAllByRole('row')).toHaveLength(51)
    const you = table.getByRole('rowheader', { name: 'Demo Runner (you)' }).closest('tr')!
    expect(you).toHaveAttribute('aria-current', 'true')
    expect(within(you).getAllByRole('cell')[0]).toHaveTextContent(String(result.position))
    expect(save).toMatchObject({ coins: 25 + result.coinsAwarded, athlete: { xp: 100 + result.xpAwarded, fatigue: 10 } })
    expect(save.week).toMatchObject({ number: 2, currentDayIndex: 0 })
    first.unmount()

    // Reopening the result never awards again.
    await renderApp('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 50` })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Start race' }))
    await screen.findByRole('tab', { name: 'Result' })
    expect(sunday.router.state.location.pathname).toBe('/races/results/entry-1')
    await user.click(screen.getByRole('link', { name: 'Back to races' }))
    await user.click(screen.getByRole('link', { name: /^Forest First Steps/ }))
    expect(screen.getByRole('heading', { name: 'Your results' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter race' })).toBeInTheDocument()
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
    // Level 6 (2 above Forest First Steps) and Fatigue 90: +10 race Fatigue reaches 100.
    seedCareer(onSunday(withAthlete(newGame(), { xp: 1000, fatigue: 90 })))
    await renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    await settled()
    expect(screen.getByRole('note')).toHaveTextContent('Injury warning: Fatigue would reach 100 (above 95)')
    await user.click(screen.getByRole('button', { name: 'Start race anyway — injury' }))
    expect(await screen.findByText('0 (injured)')).toBeInTheDocument()
    expect(screen.getByText(/Rewards reduced to 40%: you were level 6, 2 above the recommended level 4/)).toBeInTheDocument()
    expect(screen.getByText(/Injured: Fatigue went above 95/)).toBeInTheDocument()
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
