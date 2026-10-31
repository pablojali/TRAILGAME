import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { raceCurrentDay } from '../../game-engine/races'
import { currentRef, newGame, onSunday, T0, withAthlete, withEntry } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

/** Enters and runs a race on Sunday with the given form; returns the state after the race. */
function race(state: GameState, raceId: string, fitness: number): GameState {
  const entered = withEntry(withAthlete(state, { fitness, fatigue: 0 }), raceId)
  const sunday = onSunday(entered.state)
  const raced = raceCurrentDay(sunday, currentRef(sunday), entered.entry.id, T0)
  if (!raced.ok) throw new Error(raced.error)
  return raced.value.state
}

describe('Career', () => {
  it('explains that medals and results come with the first race', async () => {
    seedCareer()
    await renderApp('/career')
    expect(screen.getByRole('heading', { level: 1, name: 'Career' })).toBeInTheDocument()
    expect(screen.getByText(/No races yet/)).toBeInTheDocument()
    // Season 1, no results yet; achievements first, none reached.
    expect(screen.getByRole('heading', { level: 2, name: 'Season 1' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Season 1 progress' })).toHaveAttribute('aria-valuetext', 'Week 1 of 52')
    expect(screen.getByText('Best finish').nextElementSibling).toHaveTextContent('—')
    expect(screen.getByRole('tab', { name: 'Achievements' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('meter', { name: 'Race Starter, level 1' })).toHaveAttribute('aria-valuetext', '0 of 1')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Trophies' }))
    expect(within(screen.getByRole('table')).getByRole('row', { name: 'Total 0 0 0 0' })).toBeInTheDocument()
  })

  it('shows the medal table, personal bests and race history, newest first, each opening its result', async () => {
    const user = userEvent.setup()
    // A very fit runner wins Forest First Steps, then an unfit one runs it again.
    let state = race(newGame(), 'RACE-001', 100)
    state = race(state, 'RACE-001', 0)
    const [first, second] = state.raceEntries
    if (first?.status !== 'finished' || second?.status !== 'finished') throw new Error('not raced')
    expect(first.result.position).toBe(1)
    expect(second.result.position).toBeGreaterThan(10)
    seedCareer(state)
    await renderApp('/career')

    // Season: two races, one medal, best finish 1st. Achievements: Race Starter level 1 reached.
    expect(screen.getByText(/2 races · 1 medal/)).toBeInTheDocument()
    expect(screen.getByText('Best finish').nextElementSibling).toHaveTextContent('#1')
    expect(screen.getByRole('meter', { name: 'Race Starter, level 2' })).toHaveAttribute('aria-valuetext', '2 of 5')
    expect(screen.getByRole('meter', { name: 'Champion, level 2' })).toHaveAttribute('aria-valuetext', '1 of 3')

    await user.click(screen.getByRole('tab', { name: 'Trophies' }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: 'Open 1 0 0 2' })).toBeInTheDocument()
    expect(within(table).getByRole('row', { name: 'Total 1 0 0 2' })).toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Gold' })).toBeInTheDocument()

    // Personal best: the win, and the faster time (the same race).
    await user.click(screen.getByRole('tab', { name: 'Bests' }))
    expect(screen.getByRole('link', { name: 'Best position in Forest First Steps: 1st' })).toHaveAttribute(
      'href',
      `/races/results/${first.id}`,
    )
    expect(screen.getByText(/· Open · 2 runs/)).toBeInTheDocument()

    // History: newest first, each row links to its result.
    await user.click(screen.getByRole('tab', { name: 'History' }))
    const history = screen.getByRole('heading', { name: 'Race history' }).closest('article')!
    const rows = within(history).getAllByRole('link')
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      `/races/results/${second.id}`,
      `/races/results/${first.id}`,
    ])
    expect(rows[1]).toHaveTextContent('Forest First Steps')
    expect(rows[1]).toHaveTextContent('1st of 50')
    await user.click(rows[1]!)
    expect(screen.getByRole('heading', { level: 1, name: '1st of 50' })).toBeInTheDocument()
  })
})
