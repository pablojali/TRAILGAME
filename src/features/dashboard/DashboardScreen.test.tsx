import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../game-engine/gameState'
import { SAVE_KEY, SCHEMA_VERSION } from '../../repositories/gameRepository'
import { renderApp } from '../../test/renderApp'

function tile(label: string) {
  return screen.getByText(label, { selector: 'span' }).nextElementSibling!.textContent
}

function seedSave(mutate: (state: ReturnType<typeof createInitialGameState>) => void) {
  const state = createInitialGameState()
  mutate(state)
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: '', state }))
}

describe('DashboardScreen', () => {
  it('shows the initial All-rounder demo state', () => {
    renderApp('/')
    expect(screen.getByText('Week 1 · Day 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Demo Runner' })).toBeInTheDocument()
    expect(screen.getByText('All-rounder')).toBeInTheDocument()
    expect(screen.getByText('0 XP · 100 XP to Level 2')).toBeInTheDocument()
    expect(tile('Level')).toBe('1')
    expect(tile('XP')).toBe('0')
    expect(tile('Fitness')).toBe('50/100')
    expect(tile('Fatigue')).toBe('10/100')
    expect(screen.getByRole('meter', { name: 'Fitness' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('meter', { name: 'Fatigue' })).toHaveAttribute('aria-valuetext', '10 of 100')
    expect(screen.getByRole('heading', { name: 'Today · Day 1' })).toBeInTheDocument()
    expect(screen.getByText('Easy run')).toBeInTheDocument()
    expect(screen.getByText('0 of 7', { exact: false })).toHaveTextContent('0 of 7')
  })

  it('derives every value from the saved game state', () => {
    seedSave((state) => {
      state.athlete.xp = 260
      state.athlete.fitness = 71
      state.athlete.fatigue = 33
      state.week.number = 3
      state.week.currentDayIndex = 2
      state.week.days[0]!.outcome = { xpGained: 10, fitnessChange: 3, fatigueChange: 5 }
      state.week.days[1]!.outcome = { xpGained: 18, fitnessChange: 5, fatigueChange: 14 }
      state.week.days[2]!.session = 'hills'
    })
    renderApp('/')
    expect(screen.getByText('Week 3 · Day 3 of 7')).toBeInTheDocument()
    expect(tile('Level')).toBe('3')
    expect(tile('XP')).toBe('260')
    expect(tile('Fitness')).toBe('71/100')
    expect(tile('Fatigue')).toBe('33/100')
    expect(screen.getByText('260 XP · 190 XP to Level 4')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Progress to Level 4' })).toHaveAttribute(
      'aria-valuetext',
      '260 of 450 XP',
    )
    expect(screen.getByRole('heading', { name: 'Today · Day 3' })).toBeInTheDocument()
    expect(screen.getByText('Hills')).toBeInTheDocument()
    expect(screen.getByText('XP +16').parentElement).toHaveTextContent('XP +16 · Fitness +5 · Fatigue +12')
    expect(screen.getByText('28 XP earned this week')).toBeInTheDocument()
  })

  it('shows the maximum level without a next threshold', () => {
    seedSave((state) => {
      state.athlete.xp = 450
    })
    renderApp('/')
    expect(tile('Level')).toBe('4')
    expect(screen.getByText('450 XP · Maximum level reached')).toBeInTheDocument()
  })

  it('links to the Training screen', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/')
    await user.click(screen.getByRole('link', { name: 'Go to training' }))
    expect(router.state.location.pathname).toBe('/training')
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
  })

  it('reflects training done on the Training screen', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(tile('XP')).toBe('10')
    expect(tile('Fitness')).toBe('53/100')
    expect(tile('Fatigue')).toBe('15/100')
    expect(screen.getByText('Week 1 · Day 2 of 7')).toBeInTheDocument()
    expect(screen.getByText('10 XP earned this week')).toBeInTheDocument()
  })

  it('resets the demo after confirmation and clears the save', async () => {
    const user = userEvent.setup()
    seedSave((state) => {
      state.athlete.xp = 120
      state.athlete.fatigue = 60
    })
    renderApp('/')
    expect(tile('XP')).toBe('120')

    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(tile('XP')).toBe('120')
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Reset demo' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Reset demo' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(tile('XP')).toBe('0')
    expect(tile('Fatigue')).toBe('10/100')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(screen.getByText(/Demo reset\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset demo' })).toHaveFocus()
  })

  it('recovers from a corrupted save with a notice instead of crashing', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, '{"schemaVersion":1,"state":{"athlete":')
    renderApp('/')
    expect(tile('XP')).toBe('0')
    expect(screen.getByText(/saved game could not be loaded/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/saved game could not be loaded/)).not.toBeInTheDocument()
  })

  it('recovers from a save with an unsupported schema version', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ schemaVersion: 99, savedAt: '', state: createInitialGameState() }),
    )
    renderApp('/')
    expect(tile('Level')).toBe('1')
    expect(screen.getByText(/saved game could not be loaded/)).toBeInTheDocument()
  })
})

describe('placeholder screens', () => {
  it.each(['/career', '/equipment', '/races'])('%s remains a placeholder', (path) => {
    renderApp(path)
    expect(screen.getByRole('heading', { name: 'Planned for a later milestone' })).toBeInTheDocument()
  })
})
