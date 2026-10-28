import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PROFILES } from '../../domain/athlete/profiles'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { T0 } from '../../test/gameFixtures'
import { M1_SAVE } from '../../test/legacySaves'
import { readSave, renderApp } from '../../test/renderApp'

function profileRadio(name: string) {
  return screen.getByRole('radio', { name: new RegExp(`^${name}`) })
}

describe('new career', () => {
  it('asks a new player to choose a profile on every route, without saving anything', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Races' }))
    expect(router.state.location.pathname).toBe('/races')
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('shows the four profiles with their six attributes and 96-point totals', () => {
    renderApp('/')
    const group = screen.getByRole('group', { name: 'Starting profile' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(4)
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true)

    const climber = profileRadio('Climber').closest('label')!
    expect(climber).toHaveTextContent('Endurance16Climbing20Speed13Technical18Recovery14Consistency15')
    expect(climber).toHaveTextContent('Strengths: Climbing, Technical. Weaknesses: Speed, Recovery.')
    expect(within(group).getAllByText('Total 96 points')).toHaveLength(4)
    expect(profileRadio('Endurance').closest('label')).toHaveTextContent(
      'Endurance20Climbing15Speed14Technical13Recovery18Consistency16',
    )
  })

  it('requires a selection before starting', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const start = screen.getByRole('button', { name: 'Select a profile to start' })
    expect(start).toHaveAttribute('aria-disabled', 'true')
    await user.click(start)
    expect(screen.getByRole('alert')).toHaveTextContent('Select a starting profile first.')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it.each(['Climber', 'Sprinter', 'All-rounder', 'Endurance'] as const)(
    'starts a %s career only after confirmation, with the approved initial state',
    async (label) => {
      const user = userEvent.setup()
      renderApp('/')
      await user.click(profileRadio(label))
      expect(profileRadio(label)).toBeChecked()
      expect(profileRadio(label).closest('label')).toHaveTextContent('Selected')
      expect(localStorage.getItem(SAVE_KEY)).toBeNull()

      await user.click(screen.getByRole('button', { name: `Start career as ${label}` }))

      expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
      const save = readSave()!
      const profile = Object.values(PROFILES).find((p) => p.label === label)!
      expect(save.schemaVersion).toBe(2)
      expect(save.state.athlete).toEqual({
        name: 'Demo Runner',
        profile: profile.id,
        xp: 0,
        fitness: 20,
        fatigue: 0,
        attributes: profile.attributes,
        spentAttributePoints: 0,
      })
      expect(save.state.fitnessDecayReference).toBe(T0)
    },
  )

  it('lets the profile be chosen with the keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/')
    profileRadio('Climber').focus()
    await user.keyboard('{ArrowDown}')
    expect(profileRadio('Sprinter')).toBeChecked()
    await user.keyboard('{Enter}')
    expect(readSave()!.state.athlete.profile).toBe('sprinter')
  })

  it('opens the Dashboard after starting, whichever route showed the selection', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/career')
    await user.click(profileRadio('Sprinter'))
    await user.click(screen.getByRole('button', { name: 'Start career as Sprinter' }))
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('keeps the new career after a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/')
    await user.click(profileRadio('Endurance'))
    await user.click(screen.getByRole('button', { name: 'Start career as Endurance' }))
    first.unmount()

    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Endurance', { selector: 'span[class*="badge"]' })).toBeInTheDocument()
  })
})

describe('incompatible save', () => {
  it('blocks every route with a warning for an M1 save and does not change it', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    renderApp('/training')
    expect(screen.getByRole('heading', { level: 1, name: "Your saved career can't continue" })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('created with an earlier version')
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()

    for (const name of ['Dashboard', 'Career', 'Equipment']) {
      await user.click(screen.getByRole('link', { name }))
      expect(screen.getByRole('heading', { level: 1, name: "Your saved career can't continue" })).toBeInTheDocument()
    }
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)
  })

  it('Exit leaves the old save untouched, and the warning returns on the next visit', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.getByRole('heading', { name: 'Save left untouched' })).toHaveFocus()
    expect(screen.getByText(/You can close this page/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await user.click(screen.getByRole('button', { name: 'Back to options' }))
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
    first.unmount()

    renderApp('/')
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)
  })

  it('Restart requires acknowledgement and writes nothing until a profile is confirmed', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    expect(screen.getByRole('heading', { name: 'Confirm restart' })).toHaveFocus()
    const proceed = screen.getByRole('button', { name: 'Continue to profile selection' })
    expect(proceed).toHaveAttribute('aria-disabled', 'true')
    await user.click(proceed)
    expect(screen.getByRole('alert')).toHaveTextContent('Tick the box')
    expect(screen.queryByRole('heading', { name: 'Choose your athlete' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /permanently replaced/ }))
    await user.click(proceed)
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toBeInTheDocument()
    expect(screen.getByText(/will replace your previous saved career/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await user.click(profileRadio('Climber'))
    await user.click(screen.getByRole('button', { name: 'Start career as Climber' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(readSave()).toMatchObject({ schemaVersion: 2, state: { athlete: { profile: 'climber', xp: 0 } } })
  })

  it('Cancel on the confirmation step returns to the warning', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('cannot be bypassed by reloading during profile selection', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue to profile selection' }))
    first.unmount()

    renderApp('/')
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
  })

  it('does not show the warning again after the reset flow is completed', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue to profile selection' }))
    await user.click(profileRadio('Sprinter'))
    await user.click(screen.getByRole('button', { name: 'Start career as Sprinter' }))
    first.unmount()

    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restart Career' })).not.toBeInTheDocument()
  })

  it.each([
    ['damaged data', '{"schemaVersion":2,"state":{"athlete":', 'damaged or incomplete'],
    ['an unsupported version', JSON.stringify({ schemaVersion: 7, state: {} }), 'different version'],
  ])('shows the warning for %s without deleting it', (_, raw, text) => {
    localStorage.setItem(SAVE_KEY, raw)
    renderApp('/')
    expect(screen.getByRole('alert')).toHaveTextContent(text)
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  })
})
