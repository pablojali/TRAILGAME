import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { enterRace } from '../../game-engine/races'
import { ordinal } from './raceText'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

/** A level-3 career (250 XP) with the given coins. */
function level3(coins: number): GameState {
  return { ...withAthlete(newGame(), { xp: 250 }), coins }
}

function card(name: string) {
  return screen.getByRole('link', { name: new RegExp(`^${name}`) })
}

describe('Race Hub', () => {
  it('lists all 12 races grouped by category, with level and coin balance', () => {
    seedCareer()
    renderApp('/races')
    expect(screen.getByRole('heading', { level: 1, name: 'Races' })).toBeInTheDocument()
    expect(screen.getByText('Level 1')).toBeInTheDocument()
    expect(screen.getByText('0 coins')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Open',
      'Trail',
      'Mountain',
      'Elite',
    ])
    expect(screen.getAllByRole('link', { name: /km/ })).toHaveLength(12)
    expect(card('Ridge Runner')).toHaveAccessibleName(
      'Ridge Runner 12 km · 550 m D+ · Rec. Lv 3 Early entry · 250 coins',
    )
  })

  it('shows free Open races, standard fees at level and Early entry below it, never locked', () => {
    seedCareer(level3(0))
    renderApp('/races')
    expect(within(card('Forest First Steps')).getByText('Free')).toBeInTheDocument()
    expect(within(card('Pine Loop Challenge')).getByText('Free')).toBeInTheDocument()
    expect(within(card('Ridge Runner')).getByText('100 coins')).toBeInTheDocument()
    expect(within(card('Wildwood Ascent')).getByText('Early entry · 250 coins')).toBeInTheDocument()
    expect(within(card('Beyond the Skyline')).getByText('Early entry · 1,400 coins')).toBeInTheDocument()
    expect(card('Beyond the Skyline')).toHaveAttribute('href', '/races/RACE-012')
  })

  it('is reachable from the Dashboard', async () => {
    const user = userEvent.setup()
    seedCareer()
    const { router } = renderApp('/')
    await user.click(screen.getByRole('link', { name: 'Race Hub' }))
    expect(router.state.location.pathname).toBe('/races')
  })
})

describe('Race Detail', () => {
  it('shows the course, both fees with the applicable one, and potential prizes', () => {
    seedCareer(level3(0))
    renderApp('/races/RACE-007')
    expect(screen.getByRole('heading', { level: 1, name: 'Summit Quest' })).toBeInTheDocument()
    expect(screen.getByText('Mountain race')).toBeInTheDocument()
    expect(screen.getByText('22 km')).toBeInTheDocument()
    expect(screen.getByText('1,300 m')).toBeInTheDocument()
    expect(screen.getByText('Steep climbs, rocky descents')).toBeInTheDocument()
    const fees = within(screen.getByRole('heading', { name: 'Entry fee' }).closest('article')!).getAllByRole('listitem')
    expect(fees[0]).toHaveTextContent('Standard (level 6 or higher)250 coins')
    expect(fees[1]).toHaveTextContent('Early entry (below level 6)600 coinsYour fee')
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

  it('explains reduced and zero rewards for easy races', () => {
    seedCareer(withAthlete(newGame(), { xp: 450 })) // level 4
    const view = renderApp('/races/RACE-004')
    expect(screen.getByText('At your level: 75% of prizes and XP.')).toBeInTheDocument()
    view.unmount()
    renderApp('/races/RACE-001')
    expect(screen.getByText(/At your level: 0% of prizes and XP — this race is too easy/)).toBeInTheDocument()
  })

  it('blocks entry without enough coins and shows the shortfall', async () => {
    const user = userEvent.setup()
    seedCareer(level3(40))
    renderApp('/races/RACE-004')
    const enter = screen.getByRole('button', { name: 'Enter race' })
    expect(enter).toHaveAttribute('aria-disabled', 'true')
    expect(enter).toHaveAccessibleDescription('Not enough coins: you need 60 coins more (balance 40 coins).')
    await user.click(enter)
    expect(screen.queryByRole('heading', { name: 'Confirm entry' })).not.toBeInTheDocument()
    expect(readSave()!.state.coins).toBe(40)
  })

  it('confirms a free entry, records it once and keeps it after a reload', async () => {
    const user = userEvent.setup()
    seedCareer()
    const first = renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    expect(screen.getByRole('heading', { name: 'Confirm entry to Forest First Steps' })).toHaveFocus()
    expect(screen.getByText('Balance after entry').nextSibling).toHaveTextContent('0 coins')
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    expect(screen.getByText('Entry confirmed. Entry fee paid: free entry.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Start race' })).toBeInTheDocument()
    expect(readSave()!.state.raceEntries).toHaveLength(1)
    first.unmount()

    renderApp('/races/RACE-001')
    expect(screen.getByText('Entry fee paid: free entry.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enter race' })).not.toBeInTheDocument()
    expect(readSave()!.state.raceEntries).toHaveLength(1)
  })

  it('shows fee, balance and remaining balance, and deducts the fee only on confirm, once', async () => {
    const user = userEvent.setup()
    seedCareer(level3(300))
    renderApp('/races/RACE-004')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    expect(screen.getByText('Entry fee', { selector: 'dt' }).nextSibling).toHaveTextContent('100 coins')
    expect(screen.getByText('Your balance').nextSibling).toHaveTextContent('300 coins')
    expect(screen.getByText('Balance after entry').nextSibling).toHaveTextContent('200 coins')
    expect(readSave()!.state.coins).toBe(300)

    const pay = screen.getByRole('button', { name: 'Pay 100 coins and enter' })
    await user.dblClick(pay)
    expect(readSave()!.state.coins).toBe(200)
    expect(readSave()!.state.raceEntries).toMatchObject([{ raceId: 'RACE-004', feePaid: 100, entryType: 'standard' }])
  })

  it('charges the early-entry fee below the recommended level', async () => {
    const user = userEvent.setup()
    seedCareer(level3(1500))
    renderApp('/races/RACE-010')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Pay 1,400 coins and enter' }))
    expect(readSave()!.state).toMatchObject({ coins: 100, raceEntries: [{ entryType: 'early', feePaid: 1400 }] })
  })

  it('Cancel charges nothing', async () => {
    const user = userEvent.setup()
    seedCareer(level3(300))
    renderApp('/races/RACE-004')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Enter race' })).toBeInTheDocument()
    expect(readSave()!.state).toMatchObject({ coins: 300, raceEntries: [] })
  })

  it('shows a not-found screen for an unknown race', () => {
    seedCareer()
    renderApp('/races/RACE-999')
    expect(screen.getByRole('heading', { level: 1, name: 'Race not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to races' })).toHaveAttribute('href', '/races')
  })
})

describe('Race day and results', () => {
  async function enterAndStart(user: ReturnType<typeof userEvent.setup>, raceId = 'RACE-001') {
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: /^Confirm free entry|^Pay / }))
    expect(screen.getByText(/Racing takes today’s training day: Monday’s Easy run is not done/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Start race/ }))
    expect(raceId).toBeTruthy()
  }

  it('runs a race once, shows the result with rewards and explanation, and keeps it after a reload', async () => {
    const user = userEvent.setup()
    seedCareer()
    const first = renderApp('/races/RACE-001')
    expect(screen.queryByText(/Racing takes/)).not.toBeInTheDocument()
    await enterAndStart(user)

    const save = readSave()!.state
    const entry = save.raceEntries[0]!
    if (entry.status !== 'finished') throw new Error('not finished')
    const { result } = entry
    expect(first.router.state.location.pathname).toBe('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 50` })).toBeInTheDocument()
    expect(screen.getByText(/than a typical runner in this field/)).toBeInTheDocument()
    expect(screen.getByText(/each measured on its own \(they don’t add up\)/)).toBeInTheDocument()
    if (!result.factors.some((f) => f.id === 'day-form')) {
      expect(screen.getByText(/^Day form [−+]\d+\.\d% \((a good day|an off day)\): fixed for this entry/)).toBeInTheDocument()
    }
    const rewards = within(screen.getByRole('heading', { name: 'Rewards' }).closest('article')!)
    expect(rewards.getByText('Entry fee (paid at entry)').nextSibling).toHaveTextContent('Free')
    expect(rewards.getByText('Reward multiplier').nextSibling).toHaveTextContent('100%')
    expect(rewards.getByText('Coins awarded').nextSibling).toHaveTextContent(`${result.coinsAwarded} coins`)
    expect(rewards.getByText('XP awarded').nextSibling).toHaveTextContent(`${result.xpAwarded} XP`)
    expect(rewards.getByText('Net coin change').nextSibling).toHaveTextContent(`+${result.coinsAwarded} coins`)
    expect(save).toMatchObject({ coins: result.coinsAwarded, athlete: { xp: result.xpAwarded, fatigue: 10 } })
    first.unmount()

    // Reopening the result never awards again.
    renderApp('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: `${ordinal(result.position)} of 50` })).toBeInTheDocument()
    expect(readSave()!.state).toEqual(save)
  })

  it('shows the race on the Training calendar and in the race’s results, and allows a new entry', async () => {
    const user = userEvent.setup()
    seedCareer()
    const view = renderApp('/races/RACE-001')
    await enterAndStart(user)
    view.unmount()

    renderApp('/training')
    const monday = screen.getByRole('button', { name: /^Monday, Race: Forest First Steps, completed/ })
    await user.click(monday)
    expect(screen.getByText(/Raced instead of Easy run/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View result' })).toHaveAttribute('href', '/races/results/entry-1')
    await user.click(screen.getByRole('link', { name: 'Races' }))
    await user.click(screen.getByRole('link', { name: /^Forest First Steps/ }))
    expect(screen.getByRole('heading', { name: 'Your results' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter race' })).toBeInTheDocument()
  })

  it('warns before an injuring race and explains reduced rewards', async () => {
    const user = userEvent.setup()
    // Level 3 (2 above Forest First Steps) and Fatigue 90: +10 race Fatigue reaches 100.
    seedCareer(withAthlete(newGame(), { xp: 250, fatigue: 90 }))
    renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    expect(screen.getByRole('note')).toHaveTextContent('Injury warning: Fatigue would reach 100 (above 95)')
    await user.click(screen.getByRole('button', { name: 'Start race anyway — injury' }))
    expect(screen.getByText('0 (injured)')).toBeInTheDocument()
    expect(screen.getByText(/Rewards reduced to 40%: you were level 3, 2 above the recommended level 1/)).toBeInTheDocument()
    expect(screen.getByText(/Injured: Fatigue went above 95/)).toBeInTheDocument()
    expect(readSave()!.state.forcedRestDays).toBe(5)
  })

  it('locks racing during forced rest', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), forcedRestDays: 2, week: { ...newGame().week, days: newGame().week.days.map((d, i) => (i < 2 ? { ...d, session: 'rest' } : d)) } })
    renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    await user.click(screen.getByRole('button', { name: 'Confirm free entry' }))
    expect(screen.getByText(/Injured: 2 forced rest days left/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start race/ })).not.toBeInTheDocument()
  })

  it('shows not-found and not-raced-yet states for result links', () => {
    seedCareer()
    const view = renderApp('/races/results/entry-7')
    expect(screen.getByRole('heading', { level: 1, name: 'Result not found' })).toBeInTheDocument()
    view.unmount()
    const pending = enterRace(newGame(), 'RACE-001', 0, 0)
    if (!pending.ok) throw new Error(pending.error)
    seedCareer(pending.state)
    renderApp('/races/results/entry-1')
    expect(screen.getByRole('heading', { level: 1, name: 'Not raced yet' })).toBeInTheDocument()
  })
})
