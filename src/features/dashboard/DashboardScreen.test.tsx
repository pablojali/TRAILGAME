import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DECAY_PERIOD_MS } from '../../game-engine/fitnessDecay'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { newGame, T0, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

const DAY = DECAY_PERIOD_MS

/** Value shown for a stat in the Condition column (Level, XP, Fitness, Fatigue). */
function stat(label: string) {
  const condition = screen.getByRole('region', { name: 'Condition' })
  return within(condition).getByText(label, { selector: 'dt' }).nextElementSibling!.textContent
}

/** Attribute values from the left column, read from their meters. */
function attributeValues() {
  const column = screen.getByRole('region', { name: 'Attributes' })
  return within(column)
    .getAllByRole('meter')
    .map((m) => `${m.getAttribute('aria-label')} ${m.getAttribute('aria-valuenow')}`)
}

function identity() {
  return screen.getByRole('heading', { level: 2, name: / - .* \(Lv \d\)/ }).textContent
}

describe('DashboardScreen — first screen', () => {
  it('shows the runner with name, profile and level above, attributes left and condition right', () => {
    seedCareer(newGame('climber'))
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(identity()).toBe('Demo Runner - Climber (Lv 1)')
    expect(screen.getByText('Week 1 · Monday')).toBeInTheDocument()
    expect(attributeValues()).toEqual([
      'Endurance 16',
      'Climbing 20',
      'Speed 13',
      'Technical 18',
      'Recovery 14',
      'Consistency 15',
    ])
    expect(stat('Level')).toBe('1')
    expect(stat('XP')).toBe('0')
    expect(stat('Fitness')).toBe('20')
    expect(stat('Fatigue')).toBe('0')
    expect(screen.getByRole('meter', { name: 'Fitness' })).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByRole('meter', { name: 'Progress to Level 2' })).toHaveAttribute('aria-valuetext', '0 of 100 XP')
  })

  it('shows the Dashboard runner without equipment, in the runner sex, not the creation art', () => {
    seedCareer(newGame('sprinter', T0, { name: 'Leo', sex: 'male' }))
    renderApp('/')
    const runner = screen.getByRole('img', { name: /runner/ })
    expect(runner).toHaveAccessibleName('Leo, male runner, no equipment')
    // Creation illustrations are labelled with the profile; the Dashboard never shows them.
    expect(screen.queryByRole('img', { name: /Sprinter, male runner/ })).not.toBeInTheDocument()
  })

  it('draws the saved appearance as layers: body by sex and tone, chosen top, no shoes until equipped', () => {
    seedCareer(
      newGame('sprinter', T0, { name: 'Leo', sex: 'male', appearance: { hair: 'natural', skin: 'tone-3', outfit: 'white-tshirt' } }),
    )
    const view = renderApp('/')
    const runner = screen.getByRole('img', { name: 'Leo, male runner, no equipment' })
    const avatar = runner.querySelector('svg')!
    expect(avatar).toHaveAttribute('data-skin', 'tone-3')
    expect([...avatar.querySelectorAll('image')].map((i) => i.getAttribute('data-layer'))).toEqual(['body', 'white-tshirt'])
    expect(avatar.querySelector('[data-layer="body"]')!.getAttribute('href')).toMatch(/male-3/)
    view.unmount()

    seedCareer({ ...newGame('sprinter', T0, { name: 'Leo', sex: 'male' }), equipment: ['starter-shoes'] })
    renderApp('/')
    const shod = screen.getByRole('img', { name: 'Leo, male runner, wearing starter shoes' }).querySelector('svg')!
    expect([...shod.querySelectorAll('image')].map((i) => i.getAttribute('data-layer'))).toEqual(['body', 'starter-shoes'])
  })

  it('derives every value from the saved game state', () => {
    const state = withAthlete(newGame('sprinter', T0, { name: 'Marta', sex: 'female' }), {
      xp: 260,
      fitness: 71,
      fatigue: 33,
      spentAttributePoints: 1,
    })
    state.athlete.attributes.endurance += 1
    state.week.number = 3
    state.week.currentDayIndex = 2
    state.week.days[0]!.outcome = { xpGained: 9, fitnessChange: 2, fatigueChange: 5 }
    state.week.days[1]!.outcome = { xpGained: 16, fitnessChange: 3, fatigueChange: 14 }
    state.week.days[2]!.session = 'hills'
    seedCareer(state)
    renderApp('/')

    expect(identity()).toBe('Marta - Sprinter (Lv 3)')
    expect(screen.getByText('Week 3 · Wednesday')).toBeInTheDocument()
    expect(stat('Level')).toBe('3')
    expect(stat('XP')).toBe('260')
    expect(stat('Fitness')).toBe('71')
    expect(stat('Fatigue')).toBe('33')
    expect(attributeValues()[0]).toBe('Endurance 14')
    expect(screen.getByRole('meter', { name: 'Progress to Level 4' })).toHaveAttribute('aria-valuetext', '260 of 450 XP')
    // Level 3 earned 4 points; 1 is spent.
    expect(screen.getByText('unspent attribute points', { exact: false })).toHaveTextContent('3 unspent attribute points')
    expect(screen.getByRole('link', { name: 'Allocate points' })).toHaveAttribute('href', '/attributes')
    expect(screen.getByRole('heading', { name: 'Today · Wed' })).toBeInTheDocument()
    expect(screen.getByText('XP +14').parentElement).toHaveTextContent('XP +14 · Fitness +3 · Fatigue +12')
    expect(screen.getByText('25 XP earned this week')).toBeInTheDocument()
  })

  it('shows level 50 as the maximum level', () => {
    seedCareer(withAthlete(newGame(), { xp: 63_700 }))
    renderApp('/')
    expect(stat('Level')).toBe('50')
    expect(screen.getByText('Max level')).toBeInTheDocument()
    expect(screen.queryByRole('meter', { name: /Progress to Level/ })).not.toBeInTheDocument()
  })

  it.each([
    [69, '69'],
    [70, '70 High'],
    [100, '100 High'],
  ])('marks fatigue %i as %j', (fatigue, shown) => {
    seedCareer(withAthlete(newGame(), { fatigue }))
    renderApp('/')
    expect(stat('Fatigue')).toBe(shown)
  })
})

describe('DashboardScreen — cards below', () => {
  it('shows attribute points, today, the week and the demo reset', () => {
    seedCareer(newGame('climber'))
    renderApp('/')
    expect(screen.getByRole('heading', { name: 'Attribute points' })).toBeInTheDocument()
    expect(screen.getByText('unspent attribute points', { exact: false })).toHaveTextContent('0 unspent attribute points')
    expect(screen.getByRole('link', { name: 'View attributes' })).toHaveAttribute('href', '/attributes')
    expect(screen.getByRole('heading', { name: 'Today · Mon' })).toBeInTheDocument()
    expect(screen.getByText('Easy run')).toBeInTheDocument()
    expect(screen.getByText('XP +9').parentElement).toHaveTextContent('XP +9 · Fitness +2 · Fatigue +5')
    expect(screen.getByRole('heading', { name: 'Week 1' })).toBeInTheDocument()
    expect(screen.getByText('0 XP earned this week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Complete Easy run' }))
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(stat('XP')).toBe('9')
    expect(stat('Fitness')).toBe('22')
    expect(stat('Fatigue')).toBe('5')
    expect(screen.getByText('Week 1 · Tuesday')).toBeInTheDocument()
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
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(document.getElementById('main-content')).toHaveFocus()
  })
})

describe('DashboardScreen — Fitness decay', () => {
  it('applies Fitness decay on load, announces it and saves it once', () => {
    seedCareer(newGame())
    vi.setSystemTime(T0 + 3 * DAY + 5000)
    const first = renderApp('/')
    expect(stat('Fitness')).toBe('17')
    expect(screen.getByText('Fitness −3: 3 full days without a training session.')).toBeInTheDocument()
    expect(readSave()!.state).toMatchObject({ athlete: { fitness: 17 }, fitnessDecayReference: T0 + 3 * DAY })
    first.unmount()

    // Reopening later the same day does not apply the same periods again.
    vi.setSystemTime(T0 + 3 * DAY + 60_000)
    renderApp('/')
    expect(stat('Fitness')).toBe('17')
    expect(screen.queryByText(/without a training session\./)).not.toBeInTheDocument()
  })

  it('does not decay before a full day has passed', () => {
    seedCareer(newGame())
    vi.setSystemTime(T0 + DAY - 1)
    renderApp('/')
    expect(stat('Fitness')).toBe('20')
  })

  it('applies decay when the app becomes visible again', async () => {
    seedCareer(newGame())
    renderApp('/')
    expect(stat('Fitness')).toBe('20')
    vi.setSystemTime(T0 + 2 * DAY)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(stat('Fitness')).toBe('18')
    expect(readSave()!.state.athlete.fitness).toBe(18)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Fitness −2/)).not.toBeInTheDocument()
  })
})

describe('placeholder screens', () => {
  it.each(['/career'])('%s remains a placeholder', (path) => {
    seedCareer()
    renderApp(path)
    expect(screen.getByRole('heading', { name: 'Planned for a later milestone' })).toBeInTheDocument()
  })
})
