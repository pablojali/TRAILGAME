import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { raceCurrentDay } from '../../game-engine/races'
import { currentRef, newGame, onSunday, T0, withAthlete, withEntry } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

const strong = { speed: 40, endurance: 40, climbing: 40, technical: 40, recovery: 40, consistency: 40 }

/** Enters and runs a race on Sunday with the given form; returns the state after the race. */
function race(state: GameState, raceId: string, fitness: number): GameState {
  // A very fit runner is also strong (attributes 40): since 2 November 2026 the field is wider.
  const attributes = fitness >= 100 ? strong : newGame().athlete.attributes
  const entered = withEntry(withAthlete(state, { fitness, fatigue: 0, attributes }), raceId)
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
    // Year 1, no results yet. Ranking is the first tab (owner request, 7 November 2026); no challenge reached.
    expect(screen.getByRole('heading', { level: 2, name: 'Year 1' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Year 1 progress' })).toHaveAttribute('aria-valuetext', 'Week 1 of 52')
    expect(screen.getByText('Best finish').nextElementSibling).toHaveTextContent('—')
    expect(screen.getAllByRole('tab').slice(0, 4).map((tab) => tab.textContent)).toEqual(['Ranking', 'Challenges', 'Trophies', 'History'])
    expect(screen.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Challenges' }))
    expect(screen.getByRole('meter', { name: 'Race Starter, level 1' })).toHaveAttribute('aria-valuetext', '0 of 1')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Trophies' }))
    expect(within(screen.getByRole('table')).getByRole('row', { name: 'Total 0 0 0 0' })).toBeInTheDocument()
  })

  it('shows the medal table and race history, newest first, each opening its result', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'Challenges' }))
    expect(screen.getByRole('meter', { name: 'Race Starter, level 2' })).toHaveAttribute('aria-valuetext', '2 of 5')
    expect(screen.getByRole('meter', { name: 'Champion, level 2' })).toHaveAttribute('aria-valuetext', '1 of 3')

    await user.click(screen.getByRole('tab', { name: 'Trophies' }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: 'Difficulty I 1 0 0 2' })).toBeInTheDocument()
    expect(within(table).getByRole('row', { name: 'Total 1 0 0 2' })).toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Gold' })).toBeInTheDocument()

    // Bests made way for the Ranking tab (owner request, 5 November 2026).
    expect(screen.queryByRole('tab', { name: 'Bests' })).not.toBeInTheDocument()

    // History: newest first, each row links to its result.
    await user.click(screen.getByRole('tab', { name: 'History' }))
    const history = screen.getByRole('heading', { name: 'Race history' }).closest('article')!
    const rows = within(history).getAllByRole('link')
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      `/races/results/${second.id}`,
      `/races/results/${first.id}`,
    ])
    expect(rows[1]).toHaveTextContent('Forest First Steps')
    expect(rows[1]).toHaveTextContent('1st of 30')
    await user.click(rows[1]!)
    expect(screen.getByRole('heading', { level: 1, name: '1st of 30' })).toBeInTheDocument()
  })
})
