import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DECAY_PERIOD_MS } from '../../game-engine/fitnessDecay'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { newGame, T0, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

const DAY = DECAY_PERIOD_MS

function tile(label: string) {
  return screen.getByText(label, { selector: 'span' }).nextElementSibling!.textContent
}

function attributeValues() {
  const card = screen.getByRole('heading', { name: 'Attributes' }).closest('article')!
  return within(card)
    .getAllByRole('listitem')
    .map((li) => li.firstElementChild!.textContent)
}

describe('DashboardScreen', () => {
  it('shows the initial state of the chosen profile', () => {
    seedCareer(newGame('climber'))
    renderApp('/')
    expect(screen.getByText('Week 1 · Day 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Demo Runner' })).toBeInTheDocument()
    expect(screen.getByText('Climber', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('0 XP · 100 XP to Level 2')).toBeInTheDocument()
    expect(tile('Level')).toBe('1')
    expect(tile('XP')).toBe('0')
    expect(tile('Fitness')).toBe('20/100')
    expect(tile('Fatigue')).toBe('0/100')
    expect(screen.getByRole('meter', { name: 'Fitness' })).toHaveAttribute('aria-valuenow', '20')
    expect(attributeValues()).toEqual([
      'Endurance16',
      'Climbing20',
      'Speed13',
      'Technical18',
      'Recovery14',
      'Consistency15',
    ])
    expect(screen.getByRole('meter', { name: 'Climbing' })).toHaveAttribute('aria-valuetext', '20 of 100')
    expect(screen.getByText('unspent attribute points', { exact: false })).toHaveTextContent('0 unspent attribute points')
    expect(screen.getByRole('link', { name: 'View attributes' })).toHaveAttribute('href', '/attributes')
    expect(screen.getByRole('heading', { name: 'Today · Day 1' })).toBeInTheDocument()
    expect(screen.getByText('Easy run')).toBeInTheDocument()
    expect(screen.getByText('XP +9').parentElement).toHaveTextContent('XP +9 · Fitness +2 · Fatigue +5')
  })

  it('derives every value from the saved game state', () => {
    const state = withAthlete(newGame('sprinter'), { xp: 260, fitness: 71, fatigue: 33, spentAttributePoints: 1 })
    state.athlete.attributes.endurance += 1
    state.week.number = 3
    state.week.currentDayIndex = 2
    state.week.days[0]!.outcome = { xpGained: 9, fitnessChange: 2, fatigueChange: 5 }
    state.week.days[1]!.outcome = { xpGained: 16, fitnessChange: 3, fatigueChange: 14 }
    state.week.days[2]!.session = 'hills'
    seedCareer(state)
    renderApp('/')

    expect(screen.getByText('Week 3 · Day 3 of 7')).toBeInTheDocument()
    expect(screen.getByText('Sprinter', { selector: 'span' })).toBeInTheDocument()
    expect(tile('Level')).toBe('3')
    expect(tile('XP')).toBe('260')
    expect(tile('Fitness')).toBe('71/100')
    expect(tile('Fatigue')).toBe('33/100')
    expect(screen.getByText('260 XP · 190 XP to Level 4')).toBeInTheDocument()
    expect(attributeValues()[0]).toBe('Endurance14')
    // Level 3 earned 4 points; 1 is spent.
    expect(screen.getByText('unspent attribute points', { exact: false })).toHaveTextContent('3 unspent attribute points')
    expect(screen.getByRole('link', { name: 'Allocate points' })).toHaveAttribute('href', '/attributes')
    expect(screen.getByText('XP +14').parentElement).toHaveTextContent('XP +14 · Fitness +3 · Fatigue +12')
    expect(screen.getByText('25 XP earned this week')).toBeInTheDocument()
  })

  it('shows level 5 as the maximum level', () => {
    seedCareer(withAthlete(newGame(), { xp: 700 }))
    renderApp('/')
    expect(tile('Level')).toBe('5')
    expect(screen.getByText('700 XP · Maximum level reached')).toBeInTheDocument()
  })

  it('applies Fitness decay on load, announces it and saves it once', () => {
    seedCareer(newGame())
    vi.setSystemTime(T0 + 3 * DAY + 5000)
    const first = renderApp('/')
    expect(tile('Fitness')).toBe('17/100')
    expect(screen.getByText('Fitness −3: 3 full days without a training session.')).toBeInTheDocument()
    expect(readSave()!.state).toMatchObject({ athlete: { fitness: 17 }, fitnessDecayReference: T0 + 3 * DAY })
    first.unmount()

    // Reopening later the same day does not apply the same periods again.
    vi.setSystemTime(T0 + 3 * DAY + 60_000)
    renderApp('/')
    expect(tile('Fitness')).toBe('17/100')
    expect(screen.queryByText(/without a training session\./)).not.toBeInTheDocument()
  })

  it('does not decay before a full day has passed', () => {
    seedCareer(newGame())
    vi.setSystemTime(T0 + DAY - 1)
    renderApp('/')
    expect(tile('Fitness')).toBe('20/100')
  })

  it('applies decay when the app becomes visible again', async () => {
    seedCareer(newGame())
    renderApp('/')
    expect(tile('Fitness')).toBe('20/100')
    vi.setSystemTime(T0 + 2 * DAY)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(tile('Fitness')).toBe('18/100')
    expect(readSave()!.state.athlete.fitness).toBe(18)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Fitness −2/)).not.toBeInTheDocument()
  })

  it('links to the Training screen', async () => {
    const user = userEvent.setup()
    seedCareer()
    const { router } = renderApp('/')
    await user.click(screen.getByRole('link', { name: 'Go to training' }))
    expect(router.state.location.pathname).toBe('/training')
  })

  it('reflects training done on the Training screen', async () => {
    const user = userEvent.setup()
    seedCareer()
    renderApp('/training')
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(tile('XP')).toBe('9')
    expect(tile('Fitness')).toBe('22/100')
    expect(tile('Fatigue')).toBe('5/100')
    expect(screen.getByText('Week 1 · Day 2 of 7')).toBeInTheDocument()
  })

  it('reset demo asks for confirmation, then clears the save and returns to profile selection', async () => {
    const user = userEvent.setup()
    seedCareer(withAthlete(newGame(), { xp: 120 }))
    renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Reset demo' })).toHaveFocus()
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toBeInTheDocument()
    expect(screen.queryByText(/will replace your previous saved career/)).not.toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(document.getElementById('main-content')).toHaveFocus()
  })
})

describe('placeholder screens', () => {
  it.each(['/career', '/equipment', '/races'])('%s remains a placeholder', (path) => {
    seedCareer()
    renderApp(path)
    expect(screen.getByRole('heading', { name: 'Planned for a later milestone' })).toBeInTheDocument()
  })
})
