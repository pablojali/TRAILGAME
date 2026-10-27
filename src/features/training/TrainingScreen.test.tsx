import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { renderApp } from '../../test/renderApp'

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
  it('shows the seven-day plan with day 1 as today', () => {
    renderApp('/training')
    const days = dayItems()
    expect(days).toHaveLength(7)
    expect(days[0]).toHaveAttribute('aria-current', 'step')
    expect(days[0]).toHaveTextContent('Day 1Easy runToday')
    expect(days[1]).toHaveTextContent('Day 2IntervalsUpcoming')
    expect(days[6]).toHaveTextContent('Day 7RestUpcoming')
    expect(feedback()).toBeUndefined()
  })

  it('offers a selector for every session type', () => {
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

  it('previews the effects of the selected session', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    expect(effect('XP')).toBe('+10 | 0 → 10')
    expect(effect('Fitness')).toBe('+3 | 50 → 53')
    expect(effect('Fatigue')).toBe('+5 | 10 → 15')

    await user.selectOptions(screen.getByLabelText('Session for day 1'), 'Long run')
    expect(effect('XP')).toBe('+20 | 0 → 20')
    expect(effect('Fitness')).toBe('+6 | 50 → 56')
    expect(effect('Fatigue')).toBe('+16 | 10 → 26')
    expect(dayItems()[0]).toHaveTextContent('Long run')
    expect(screen.getByRole('button', { name: 'Complete day 1: Long run' })).toBeInTheDocument()
  })

  it('previews rest as a fatigue reduction clamped at zero', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await user.selectOptions(screen.getByLabelText('Session for day 1'), 'Rest')
    expect(effect('XP')).toBe('0 | 0 → 0')
    expect(effect('Fitness')).toBe('0 | 50 → 50')
    expect(effect('Fatigue')).toBe('−10 | 10 → 0')
    expect(screen.getByRole('button', { name: 'Take rest day 1' })).toBeInTheDocument()
  })

  it('executes the current day once and advances to the next day', async () => {
    const user = userEvent.setup()
    renderApp('/training')

    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))

    expect(feedback()).toHaveTextContent('Week 1, day 1 complete: Easy run')
    expect(feedback()).toHaveTextContent('XP +10 · Fitness +3 · Fatigue +5')
    expect(feedback()).toHaveTextContent('Next: Day 2, Intervals.')

    const days = dayItems()
    expect(days[0]).toHaveTextContent('Completed · +10 XP')
    expect(days[0]).not.toHaveAttribute('aria-current')
    expect(days[1]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Session for day 2')).toHaveDisplayValue('Intervals')
    expect(screen.queryByLabelText('Session for day 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /day 1/ })).not.toBeInTheDocument()
    // The preview now starts from the updated athlete.
    expect(effect('XP')).toBe('+18 | 10 → 28')
  })

  it('announces a level up', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    // Default plan grants 76 XP per week; week 2 day 2 (76 + 10 + 18 = 104) crosses 100 XP.
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole('button', { name: /^(Complete|Take rest)/ }))
    }
    expect(feedback()).not.toHaveTextContent('Level up')
    await user.click(screen.getByRole('button', { name: /^(Complete|Take rest)/ }))
    expect(feedback()).toHaveTextContent('Week 2, day 2 complete: Intervals')
    expect(feedback()).toHaveTextContent('Level up! Now Level 2.')
  })

  it('rolls over to a new week after day 7 and keeps progression', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    for (let day = 1; day <= 7; day++) {
      await user.click(screen.getByRole('button', { name: new RegExp(`day ${day}`) }))
    }
    expect(feedback()).toHaveTextContent('Week 1, day 7 complete: Rest')
    expect(feedback()).toHaveTextContent('Week 1 complete. Week 2 has started. Next: Day 1, Easy run.')
    expect(screen.getByRole('heading', { name: 'Week 2 plan' })).toBeInTheDocument()
    expect(dayItems()[0]).toHaveAttribute('aria-current', 'step')
    expect(dayItems().filter((d) => d.textContent?.includes('Completed'))).toHaveLength(0)
    expect(effect('XP')).toBe('+10 | 76 → 86')
  })

  it('persists edits and executions across a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/training')
    await user.click(screen.getByRole('button', { name: 'Complete day 1: Easy run' }))
    await user.selectOptions(screen.getByLabelText('Session for day 2'), 'Hills')
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()
    first.unmount()

    renderApp('/training')
    expect(dayItems()[0]).toHaveTextContent('Completed · +10 XP')
    expect(screen.getByLabelText('Session for day 2')).toHaveDisplayValue('Hills')
    expect(effect('XP')).toBe('+16 | 10 → 26')
  })
})
