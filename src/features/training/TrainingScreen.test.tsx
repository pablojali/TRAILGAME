import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newGame, T0, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

const HOUR = 60 * 60 * 1000
type User = ReturnType<typeof userEvent.setup>

function strip() {
  return within(screen.getByRole('list', { name: /plan$/ })).getAllByRole('button')
}

/** The selected day's detail, shown directly under the week strip. */
function detail() {
  const section = document.getElementById('day-detail')
  if (!section) throw new Error('Day detail not rendered')
  return section
}

/** Returns an effect as "delta | before → after". */
function effect(name: 'XP' | 'Fitness' | 'Fatigue') {
  const term = within(detail()).getByText(name, { selector: 'dt' })
  const [delta, result] = Array.from(term.nextElementSibling!.children).map((el) => el.textContent)
  return `${delta} | ${result}`
}

function feedback() {
  return screen.getAllByRole('status').find((el) => /complete:|Injured!/.test(el.textContent ?? ''))
}

async function completeToday(user: User) {
  // Wait out the double-tap pause left by a previous completion.
  await within(detail()).findByRole('button', { name: /^(Complete|Take rest)/ }, { timeout: 1500 })
  await user.click(within(detail()).getByRole('button', { name: /^(Complete|Take rest)/ }))
}

describe('TrainingScreen — week strip and day detail', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('shows the week Monday–Sunday first, with today highlighted', () => {
    renderApp('/training')
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
    expect(strip().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Monday, Easy run, today',
      'Tuesday, Intervals, planned',
      'Wednesday, Rest, planned',
      'Thursday, Hills, planned',
      'Friday, Rest, planned',
      'Saturday, Long run, planned',
      'Sunday, Rest, planned',
    ])
    expect(strip()[0]).toHaveAttribute('aria-current', 'date')
    expect(strip()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(feedback()).toBeUndefined()
  })

  it("shows today's full detail directly, with no Details button or popup", () => {
    renderApp('/training')
    expect(detail()).toHaveTextContent('Monday · Today')
    expect(within(detail()).getByRole('heading', { level: 2, name: 'Easy run' })).toBeInTheDocument()
    expect(within(detail()).getByLabelText('Session for Monday')).toHaveDisplayValue('Easy run')
    expect(detail()).toHaveTextContent('Relaxed aerobic running.')
    expect(effect('XP')).toBe('+9 | 0 → 9')
    expect(effect('Fitness')).toBe('+0.5 | 20.0 → 20.5')
    expect(detail()).toHaveTextContent('Trains Endurance +0.1 (16.0 → 16.1)')
    expect(effect('Fatigue')).toBe('+5 | 0 → 5')
    expect(within(detail()).getByRole('button', { name: 'Complete Easy run' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(detail()).not.toHaveTextContent(/km|min|intensity/i)
  })

  it('shows another day directly when its tab is tapped, without actions', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(strip()[3]!)
    expect(strip()[3]).toHaveAttribute('aria-pressed', 'true')
    expect(within(detail()).getByRole('heading', { level: 2, name: 'Hills' })).toBeInTheDocument()
    expect(detail()).toHaveTextContent('Thursday · Planned')
    expect(detail()).toHaveTextContent('Repeated climbs and descents.')
    expect(detail()).toHaveTextContent('Planned: XP +14 · Fitness +0.5 · Fatigue +12 · Climbing +0.1')
    expect(detail()).toHaveTextContent('Only today’s session can be changed or completed.')
    expect(within(detail()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(detail()).queryByRole('button')).not.toBeInTheDocument()

    await user.click(strip()[0]!)
    expect(detail()).toHaveTextContent('Monday · Today')
  })

  it('offers every session type for today and previews the revised effects', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    const select = within(detail()).getByLabelText('Session for Monday')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Easy run',
      'Intervals',
      'Hills',
      'Long run',
      'Strength',
      'Trail technique',
      'Rest',
    ])
    await user.selectOptions(select, 'Trail technique')
    expect(effect('XP')).toBe('+11 | 0 → 11')
    expect(strip()[0]).toHaveAccessibleName('Monday, Trail technique, today')
    expect(within(detail()).getByRole('button', { name: 'Complete Trail technique' })).toBeInTheDocument()
  })

  it('previews Rest as −2 Fitness and −8 Fatigue', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 10 }))
    const user = userEvent.setup()
    renderApp('/training')
    await user.selectOptions(within(detail()).getByLabelText('Session for Monday'), 'Rest')
    expect(effect('XP')).toBe('0 | 0 → 0')
    expect(effect('Fitness')).toBe('−2 | 20.0 → 18.0')
    expect(detail()).not.toHaveTextContent('Trains')
    expect(effect('Fatigue')).toBe('−8 | 10 → 2')
    expect(within(detail()).getByRole('button', { name: 'Take rest day (Mon)' })).toBeInTheDocument()
  })
})

describe('TrainingScreen — completing sessions', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('completes today once and advances to the next day', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)

    expect(feedback()).toHaveTextContent('Monday complete: Easy run')
    expect(feedback()).toHaveTextContent('XP +9 · Fitness +0.5 · Fatigue +5')
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, completed')
    expect(strip()[1]).toHaveAttribute('aria-current', 'date')
    expect(detail()).toHaveTextContent('Tuesday · Today')
    expect(readSave()!.state.athlete).toMatchObject({ xp: 9, fitness: 20.5, fatigue: 5 })
  })

  it('shows the result of a completed day when its tab is tapped', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)
    await user.click(strip()[0]!)
    expect(detail()).toHaveTextContent('Result: XP +9 · Fitness +0.5 · Fatigue +5')
    expect(within(detail()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not complete two days from an accidental double tap', async () => {
    renderApp('/training')
    const complete = within(detail()).getByRole('button', { name: 'Complete Easy run' })
    fireEvent.click(complete)
    // The same button now belongs to the next day, but pauses briefly.
    expect(complete).toHaveTextContent('Saved ✓')
    expect(complete).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(complete)
    expect(readSave()!.state.athlete.xp).toBe(9)
    expect(readSave()!.state.week.currentDayIndex).toBe(1)

    // After the pause the next day can be completed normally.
    await act(() => new Promise((resolve) => setTimeout(resolve, 750)))
    expect(within(detail()).getByRole('button', { name: 'Complete Intervals' })).not.toHaveAttribute('aria-disabled')
  })

  it('announces a level up with the attribute points earned', async () => {
    seedCareer(withAthlete(newGame(), { xp: 91 }))
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)
    expect(feedback()).toHaveTextContent('Level up! Now Level 2. +2 attribute points.')
    expect(feedback()).toHaveTextContent('New look unlocked: Red T-shirt.')
    expect(screen.getByRole('link', { name: 'Change look' })).toHaveAttribute('href', '/appearance')
    await user.click(within(feedback()!).getByRole('link', { name: 'Allocate points' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toBeInTheDocument()
  })

  it('rolls over to a new week after Sunday and keeps progression', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    for (let day = 0; day < 7; day++) await completeToday(user)
    expect(feedback()).toHaveTextContent('Week 1 complete. Week 2 has started: Monday, Easy run.')
    expect(screen.getByRole('list', { name: 'Week 2 plan' })).toBeInTheDocument()
    expect(strip().filter((b) => b.getAttribute('aria-label')!.endsWith('completed'))).toHaveLength(0)
    expect(readSave()!.state.athlete).toMatchObject({ xp: 57, fitness: 22.75 })
  })

  it('persists edits and executions across a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/training')
    await completeToday(user)
    await user.selectOptions(within(detail()).getByLabelText('Session for Tuesday'), 'Hills')
    first.unmount()

    renderApp('/training')
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, completed')
    expect(strip()[1]).toHaveAccessibleName('Tuesday, Hills, today')
  })

  it('resets the inactivity reference on every played day, Rest included', async () => {
    const user = userEvent.setup()
    renderApp('/training')

    vi.setSystemTime(T0 + 5 * HOUR)
    await completeToday(user)
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 5 * HOUR)

    await user.selectOptions(within(detail()).getByLabelText('Session for Tuesday'), 'Rest')
    vi.setSystemTime(T0 + 9 * HOUR)
    await user.click(await within(detail()).findByRole('button', { name: 'Take rest day (Tue)' }, { timeout: 1500 }))
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 9 * HOUR)
  })

  it('shows recovery Rest: Fitness kept after a training day, −2 for a second Rest in a row', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    // Default plan: Wednesday Rest after Tuesday Intervals; plan Thursday as Rest too.
    await user.click(screen.getByRole('button', { name: /^Wednesday/ }))
    expect(within(detail()).getByText(/Planned:/).parentElement).toHaveTextContent('Fitness 0')
    await user.click(screen.getByRole('button', { name: /^Monday/ }))
    await completeToday(user)
    await completeToday(user)
    expect(within(detail()).getByText(/Recovery rest after a training day: Fitness kept\./)).toBeInTheDocument()
    await completeToday(user)
    expect(readSave()!.state.athlete.fitness).toBe(20 + 0.5 + 0.75)
    await user.selectOptions(within(detail()).getByLabelText('Session for Thursday'), 'Rest')
    expect(await within(detail()).findByText(/A second rest in a row: Fitness −2\./)).toBeInTheDocument()
  })

  it('applies due decay before executing a session', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    vi.setSystemTime(T0 + 3 * 24 * HOUR + HOUR)
    await completeToday(user)
    // 20 − 2 (three full days, the first one free) + 0.5 (Easy run).
    expect(readSave()!.state.athlete.fitness).toBe(18.5)
    expect(screen.getByText('Fitness −2: 2 days without playing, after the first free day.')).toBeInTheDocument()
  })
})

describe('TrainingScreen — injury', () => {
  it('warns in the day detail before an injuring session', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 92 }))
    const user = userEvent.setup()
    renderApp('/training')
    expect(effect('XP')).toBe('0 | 0 → 0')
    expect(effect('Fitness')).toBe('−15 | 20.0 → 5.0')
    expect(detail()).not.toHaveTextContent('Trains')
    expect(within(detail()).getByRole('alert')).toHaveTextContent(
      'Injury warning: Fatigue would reach 97 (above 95). Training anyway: no XP, −15 Fitness, 5 forced rest days.',
    )
    expect(within(detail()).getByRole('button', { name: 'Complete anyway — injury' })).toBeInTheDocument()

    // Switching to Rest removes the risk.
    await user.selectOptions(within(detail()).getByLabelText('Session for Monday'), 'Rest')
    expect(within(detail()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not warn when the session ends at exactly 95 Fatigue', () => {
    seedCareer(withAthlete(newGame(), { fatigue: 90 }))
    renderApp('/training')
    expect(within(detail()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(detail()).getByRole('button', { name: 'Complete Easy run' })).toBeInTheDocument()
  })

  it('injures the runner when trained anyway and locks 5 rest days', async () => {
    seedCareer(withAthlete(newGame(), { xp: 91, fitness: 40, fatigue: 92 }))
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(within(detail()).getByRole('button', { name: 'Complete anyway — injury' }))

    expect(feedback()).toHaveTextContent('Injured! Monday: Easy run')
    expect(feedback()).toHaveTextContent('XP 0 · Fitness −15 · Fatigue +5 · 5 forced rest days')
    expect(feedback()).not.toHaveTextContent('Level up')
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, injured')
    expect(strip().slice(1, 6).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Tuesday, Rest, today, forced rest',
      'Wednesday, Rest, planned, forced rest',
      'Thursday, Rest, planned, forced rest',
      'Friday, Rest, planned, forced rest',
      'Saturday, Rest, planned, forced rest',
    ])
    expect(readSave()!.state).toMatchObject({ athlete: { xp: 91, fitness: 25, fatigue: 97 }, forcedRestDays: 5 })

    // During forced rest the session is locked and each Rest day counts down (and costs 2 Fitness).
    expect(within(detail()).getByLabelText('Session for Tuesday')).toBeDisabled()
    expect(detail()).toHaveTextContent('Injured: 5 forced rest days left. Session locked.')
    await completeToday(user)
    expect(detail()).toHaveTextContent('Injured: 4 forced rest days left. Session locked.')
    expect(readSave()!.state.athlete.fitness).toBe(23)
  })
})
