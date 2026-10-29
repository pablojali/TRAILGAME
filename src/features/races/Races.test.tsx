import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
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
    expect(screen.getByText(/Result pending/)).toBeInTheDocument()
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
