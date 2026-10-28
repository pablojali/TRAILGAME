import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newGame, T0, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

const HOUR = 60 * 60 * 1000

/** Returns an effect preview as "delta | before → after". */
function effect(name: 'XP' | 'Fitness' | 'Fatigue') {
  const value = screen.getByText(name, { selector: 'dt' }).nextElementSibling!
  const [delta, result] = Array.from(value.children).map((el) => el.textContent)
  return `${delta} | ${result}`
}

function dayItems() {
  return within(screen.getByRole('region', { name: /plan$/ })).getAllByRole('listitem')
}

function feedback() {
  return screen.getAllByRole('status').find((el) => el.textContent?.includes('complete:'))
}

describe('TrainingScreen', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('shows the approved seven-day plan with day 1 as today', () => {
    renderApp('/training')
    const days = dayItems()
    expect(days.map((d) => d.textContent)).toEqual([
      'Day 1Easy runToday',
      'Day 2IntervalsUpcoming',
      'Day 3StrengthUpcoming',
      'Day 4RestUpcoming',
      'Day 5HillsUpcoming',
      'Day 6Long runUpcoming',
      'Day 7RestUpcoming',
    ])
    expect(days[0]).toHaveAttribute('aria-current', 'step')
    expect(feedback()).toBeUndefined()
  })

  it('offers every session type, including Trail technique', () => {
    renderApp('/training')
    const options = within(screen.getByLabelText('Session for day 1')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Easy run',
      'Intervals',
      'Hills',
      'Long run',
      'Strength',
      'Trail technique',
      'Rest',
    ])
  })

  it('previews the revised effects of the selected session', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    expect(effect('XP')).toBe('+9 | 0 → 9')
    expect(effect('Fitness')).toBe('+2 | 20 → 22')
    expect(effect('Fatigue')).toBe('+5 | 0 → 5')

    await user.selectOptions(screen.getByLabelText('Session for day 1'), 'Long run')
    expect(effect('XP')).toBe('+18 | 0 → 18')
    expect(effect('Fitness')).toBe('+3 | 20 → 23')
    expect(effect('Fatigue')).toBe('+16 | 0 → 16')

    await user.selectOptions(screen.getByLabelText('Session for day 1'), 'Trail technique')
    expect(effect('XP')).toBe('+11 | 0 → 11')
    expect(effect('Fitness')).toBe('+2 | 20 → 22')
    expect(effect('Fatigue')).toBe('+6 | 0 → 6')
    expect(screen.getByRole('button', { name: 'Complete day 1: Trail technique' })).toBeInTheDocument()
  })

  it('previews rest as a fatigue reduction clamped at zero', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 10 }))
    const user = userEvent.setup()
    renderApp('/training')
    await user.selectOptions(screen.getByLabelText('Session for day 1'), 'Rest')
    expect(effect('XP')).toBe('0 | 0 → 0')
    expect(effect('Fitness')).toBe('0 | 20 → 20')
    expect(effect('Fatigue')).toBe('−10 | 10 → 0')
    expect(screen.getByRole('button', { name: 'Take rest day 1' })).toBeInTheDocument()
  })

  it('executes the current day once and advances to the next day', async () => {
    const user = userEvent.setup()
    renderApp('/training')

    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))

    expect(feedback()).toHaveTextContent('Week 1, day 1 complete: Easy run')
    expect(feedback()).toHaveTextContent('XP +9 · Fitness +2 · Fatigue +5')
    expect(feedback()).toHaveTextContent('Next: Day 2, Intervals.')
    const days = dayItems()
    expect(days[0]).toHaveTextContent('Completed · +9 XP')
    expect(days[1]).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByLabelText('Session for day 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /day 1/ })).not.toBeInTheDocument()
    expect(effect('XP')).toBe('+16 | 9 → 25')
    expect(readSave()!.state.athlete).toMatchObject({ xp: 9, fitness: 22, fatigue: 5 })
  })

  it('announces a level up with the attribute points earned', async () => {
    seedCareer(withAthlete(newGame(), { xp: 91 }))
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    expect(feedback()).toHaveTextContent('Level up! Now Level 2. +2 attribute points.')
    await user.click(within(feedback()!).getByRole('link', { name: 'Allocate points' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByText('attribute points to spend')).toBeInTheDocument()
  })

  it('rolls over to a new week after day 7 and keeps progression', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    for (let day = 1; day <= 7; day++) {
      await user.click(screen.getByRole('button', { name: new RegExp(`day ${day}`) }))
    }
    expect(feedback()).toHaveTextContent('Week 1 complete. Week 2 has started. Next: Day 1, Easy run.')
    expect(screen.getByRole('heading', { name: 'Week 2 plan' })).toBeInTheDocument()
    expect(dayItems().filter((d) => d.textContent?.includes('Completed'))).toHaveLength(0)
    expect(effect('XP')).toBe('+9 | 68 → 77')
    expect(effect('Fitness')).toBe('+2 | 33 → 35')
  })

  it('persists edits and executions across a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/training')
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    await user.selectOptions(screen.getByLabelText('Session for day 2'), 'Hills')
    first.unmount()

    renderApp('/training')
    expect(dayItems()[0]).toHaveTextContent('Completed · +9 XP')
    expect(screen.getByLabelText('Session for day 2')).toHaveDisplayValue('Hills')
    expect(effect('XP')).toBe('+14 | 9 → 23')
  })

  it('resets the inactivity reference on a non-rest session but not on Rest', async () => {
    const user = userEvent.setup()
    renderApp('/training')

    vi.setSystemTime(T0 + 5 * HOUR)
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 5 * HOUR)

    await user.selectOptions(screen.getByLabelText('Session for day 2'), 'Rest')
    vi.setSystemTime(T0 + 9 * HOUR)
    await user.click(screen.getByRole('button', { name: 'Take rest day 2' }))
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 5 * HOUR)
  })

  it('applies due decay before executing a session', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    vi.setSystemTime(T0 + 2 * 24 * HOUR + HOUR)
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    // 20 − 2 (two full days) + 2 (Easy run).
    expect(readSave()!.state.athlete.fitness).toBe(20)
    expect(screen.getByText('Fitness −2: 2 full days without a training session.')).toBeInTheDocument()
  })
})
