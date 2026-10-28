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

function card() {
  return screen.getByRole('button', { name: /Details ›/ })
}

function dialog() {
  return screen.getByRole('dialog')
}

async function openDetail(user: User) {
  await user.click(card())
  return dialog()
}

/** Returns an effect preview in the detail sheet as "delta | before → after". */
function effect(name: 'XP' | 'Fitness' | 'Fatigue') {
  const value = within(dialog()).getByText(name, { selector: 'dt' }).nextElementSibling!
  const [delta, result] = Array.from(value.children).map((el) => el.textContent)
  return `${delta} | ${result}`
}

function feedback() {
  return screen.getAllByRole('status').find((el) => el.textContent?.includes('complete:'))
}

async function completeToday(user: User) {
  await openDetail(user)
  await user.click(within(dialog()).getByRole('button', { name: /^(Complete|Take rest)/ }))
}

describe('TrainingScreen — week strip and activity card', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('shows the week Monday–Sunday first, with today highlighted', () => {
    renderApp('/training')
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
    expect(strip().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Monday, Easy run, today',
      'Tuesday, Intervals, planned',
      'Wednesday, Strength, planned',
      'Thursday, Rest, planned',
      'Friday, Hills, planned',
      'Saturday, Long run, planned',
      'Sunday, Rest, planned',
    ])
    expect(strip()[0]).toHaveAttribute('aria-current', 'date')
    expect(strip()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(feedback()).toBeUndefined()
  })

  it("shows today's activity with only the existing data: type, description and effects", () => {
    renderApp('/training')
    expect(card()).toHaveTextContent('Monday · Today')
    expect(card()).toHaveTextContent('Easy run')
    expect(card()).toHaveTextContent('Relaxed aerobic running.')
    expect(card()).toHaveTextContent('XP +9 · Fitness +2 · Fatigue +5')
    expect(card()).not.toHaveTextContent(/km|min|intensity/i)
  })

  it('shows another day in the card when it is tapped', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(strip()[4]!)
    expect(strip()[4]).toHaveAttribute('aria-pressed', 'true')
    expect(card()).toHaveTextContent('Friday · Planned')
    expect(card()).toHaveTextContent('Hills')
    expect(card()).toHaveTextContent('Planned: XP +14 · Fitness +3 · Fatigue +12')
    await user.click(strip()[0]!)
    expect(card()).toHaveTextContent('Monday · Today')
  })
})

describe('TrainingScreen — detail sheet', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('opens from the activity card and closes with the close button, returning focus', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    const sheet = await openDetail(user)
    expect(sheet).toHaveAccessibleName('Monday · Easy run')
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(card()).toHaveFocus()
  })

  it('closes by tapping outside', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    await user.click(screen.getByTestId('sheet-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes with the back button and is reflected in the URL', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/training')
    await openDetail(user)
    expect(router.state.location.search).toBe('?detail')
    await act(() => router.navigate(-1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/training')
    expect(router.state.location.search).toBe('')
  })

  it('keeps keyboard focus inside the sheet', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    const sheet = await openDetail(user)
    const last = within(sheet).getByRole('button', { name: 'Complete Easy run' })
    last.focus()
    await user.tab()
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('offers every session type for today and previews the revised effects', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    const select = within(dialog()).getByLabelText('Session for Monday')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Easy run',
      'Intervals',
      'Hills',
      'Long run',
      'Strength',
      'Trail technique',
      'Rest',
    ])
    expect(effect('XP')).toBe('+9 | 0 → 9')
    expect(effect('Fitness')).toBe('+2 | 20 → 22')
    expect(effect('Fatigue')).toBe('+5 | 0 → 5')

    await user.selectOptions(select, 'Trail technique')
    expect(effect('XP')).toBe('+11 | 0 → 11')
    expect(dialog()).toHaveAccessibleName('Monday · Trail technique')
    expect(strip()[0]).toHaveAccessibleName('Monday, Trail technique, today')
    expect(within(dialog()).getByRole('button', { name: 'Complete Trail technique' })).toBeInTheDocument()
  })

  it('previews Rest as an 8-point fatigue reduction', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 10 }))
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    await user.selectOptions(within(dialog()).getByLabelText('Session for Monday'), 'Rest')
    expect(effect('Fatigue')).toBe('−8 | 10 → 2')
    expect(within(dialog()).getByRole('button', { name: 'Take rest day (Mon)' })).toBeInTheDocument()
  })

  it('shows planned effects for upcoming days, without actions', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await user.click(strip()[5]!)
    const sheet = await openDetail(user)
    expect(sheet).toHaveAccessibleName('Saturday · Long run')
    expect(sheet).toHaveTextContent('Planned effects: XP +18 · Fitness +3 · Fatigue +16')
    expect(sheet).toHaveTextContent('Only today’s session can be changed or completed.')
    expect(within(sheet).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /^(Complete|Take rest)/ })).not.toBeInTheDocument()
  })
})

describe('TrainingScreen — completing sessions', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('completes today once from the sheet and advances to the next day', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(feedback()).toHaveTextContent('Monday complete: Easy run')
    expect(feedback()).toHaveTextContent('XP +9 · Fitness +2 · Fatigue +5')
    expect(feedback()).toHaveTextContent('Next: Tuesday, Intervals.')
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, completed')
    expect(strip()[1]).toHaveAttribute('aria-current', 'date')
    expect(card()).toHaveTextContent('Tuesday · Today')
    expect(readSave()!.state.athlete).toMatchObject({ xp: 9, fitness: 22, fatigue: 5 })
  })

  it('shows the result of a completed day without actions', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)
    await user.click(strip()[0]!)
    const sheet = await openDetail(user)
    expect(sheet).toHaveTextContent('Result: XP +9 · Fitness +2 · Fatigue +5')
    expect(within(sheet).queryByRole('button', { name: /^(Complete|Take rest)/ })).not.toBeInTheDocument()
  })

  it('does not complete the same day twice from repeated clicks', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    const complete = within(dialog()).getByRole('button', { name: 'Complete Easy run' })
    fireEvent.click(complete)
    fireEvent.click(complete)
    expect(readSave()!.state.athlete.xp).toBe(9)
    expect(readSave()!.state.week.currentDayIndex).toBe(1)
  })

  it('announces a level up with the attribute points earned', async () => {
    seedCareer(withAthlete(newGame(), { xp: 91 }))
    const user = userEvent.setup()
    renderApp('/training')
    await completeToday(user)
    expect(feedback()).toHaveTextContent('Level up! Now Level 2. +2 attribute points.')
    await user.click(within(feedback()!).getByRole('link', { name: 'Allocate points' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toBeInTheDocument()
  })

  it('rolls over to a new week after Sunday and keeps progression', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    for (let day = 0; day < 7; day++) await completeToday(user)
    expect(feedback()).toHaveTextContent('Week 1 complete. Week 2 has started. Next: Monday, Easy run.')
    expect(screen.getByRole('list', { name: 'Week 2 plan' })).toBeInTheDocument()
    expect(strip().filter((b) => b.getAttribute('aria-label')!.endsWith('completed'))).toHaveLength(0)
    expect(readSave()!.state.athlete.xp).toBe(68)
  })

  it('persists edits and executions across a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/training')
    await completeToday(user)
    await openDetail(user)
    await user.selectOptions(within(dialog()).getByLabelText('Session for Tuesday'), 'Hills')
    first.unmount()

    renderApp('/training')
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, completed')
    expect(strip()[1]).toHaveAccessibleName('Tuesday, Hills, today')
  })

  it('resets the inactivity reference on a non-rest session but not on Rest', async () => {
    const user = userEvent.setup()
    renderApp('/training')

    vi.setSystemTime(T0 + 5 * HOUR)
    await completeToday(user)
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 5 * HOUR)

    await openDetail(user)
    await user.selectOptions(within(dialog()).getByLabelText('Session for Tuesday'), 'Rest')
    vi.setSystemTime(T0 + 9 * HOUR)
    await user.click(within(dialog()).getByRole('button', { name: 'Take rest day (Tue)' }))
    expect(readSave()!.state.fitnessDecayReference).toBe(T0 + 5 * HOUR)
  })

  it('applies due decay before executing a session', async () => {
    const user = userEvent.setup()
    renderApp('/training')
    vi.setSystemTime(T0 + 2 * 24 * HOUR + HOUR)
    await completeToday(user)
    // 20 − 2 (two full days) + 2 (Easy run).
    expect(readSave()!.state.athlete.fitness).toBe(20)
    expect(screen.getByText('Fitness −2: 2 full days without a training session.')).toBeInTheDocument()
  })
})

describe('TrainingScreen — injury', () => {
  it('warns on the card and in the sheet before an injuring session', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 92 }))
    const user = userEvent.setup()
    renderApp('/training')
    expect(card()).toHaveTextContent('Injury risk: open to review before training.')
    expect(card()).toHaveTextContent('XP 0 · Fitness −15 · Fatigue +5')

    await openDetail(user)
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Injury warning: this session would raise Fatigue to 97, above 95. If you train anyway, your runner is injured: no XP, −15 Fitness and 5 forced rest days.',
    )
    expect(within(dialog()).getByRole('button', { name: 'Complete anyway — injury' })).toBeInTheDocument()

    // Switching to Rest removes the risk.
    await user.selectOptions(within(dialog()).getByLabelText('Session for Monday'), 'Rest')
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not warn when the session ends at exactly 95 Fatigue', async () => {
    seedCareer(withAthlete(newGame(), { fatigue: 90 }))
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Complete Easy run' })).toBeInTheDocument()
  })

  it('injures the runner when trained anyway and forces 5 rest days', async () => {
    seedCareer(withAthlete(newGame(), { xp: 91, fitness: 40, fatigue: 92 }))
    const user = userEvent.setup()
    renderApp('/training')
    await openDetail(user)
    await user.click(within(dialog()).getByRole('button', { name: 'Complete anyway — injury' }))

    expect(feedback()).toHaveTextContent('Injured! No XP, −15 Fitness and 5 forced rest days.')
    expect(feedback()).not.toHaveTextContent('Level up')
    expect(screen.getByText('Injured: 5 forced rest days left.')).toBeInTheDocument()
    expect(strip()[0]).toHaveAccessibleName('Monday, Easy run, injured')
    expect(strip().slice(1, 6).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Tuesday, Rest, today, forced rest',
      'Wednesday, Rest, planned, forced rest',
      'Thursday, Rest, planned, forced rest',
      'Friday, Rest, planned, forced rest',
      'Saturday, Rest, planned, forced rest',
    ])
    expect(readSave()!.state).toMatchObject({ athlete: { xp: 91, fitness: 25, fatigue: 97 }, forcedRestDays: 5 })

    // During forced rest the session cannot be changed, and Rest counts the days down.
    await openDetail(user)
    expect(within(dialog()).getByLabelText('Session for Tuesday')).toBeDisabled()
    expect(dialog()).toHaveTextContent('Forced rest after an injury: this session cannot be changed.')
    await user.click(within(dialog()).getByRole('button', { name: 'Take rest day (Tue)' }))
    expect(screen.getByText('Injured: 4 forced rest days left.')).toBeInTheDocument()
  })
})
