import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defaultAppearance } from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import { PROFILES } from '../../domain/athlete/profiles'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { T0 } from '../../test/gameFixtures'
import { M1_SAVE } from '../../test/legacySaves'
import { readSave, renderApp } from '../../test/renderApp'

type User = ReturnType<typeof userEvent.setup>

/** First step (sex and appearance) → name step, keeping the default appearance. */
async function chooseAndContinue(user: User) {
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

/** Runs the whole creation flow with the given choices (every runner is an All-rounder). */
async function createCareer(user: User, sex: Sex, name: string) {
  await user.click(screen.getByRole('radio', { name: sex === 'male' ? 'Male' : 'Female' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText('Runner name'), name)
  await user.selectOptions(screen.getByLabelText('Country'), 'AR')
  await user.click(screen.getByRole('button', { name: 'Start career' }))
  await started()
  await skipWelcome(user)
}

/** A new career meets the coach first (Trail Coach M1); skipping opens the Dashboard. */
async function skipWelcome(user: User) {
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Trail Manager!' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Skip' }))
}

/** The career is started asynchronously (by the server when one is configured). */
async function started() {
  await waitFor(() => expect(screen.queryByText('Starting…')).toBeNull())
}

describe('career creation — first step', () => {
  it('shows the creation flow on every route, without navigation and without saving', async () => {
    for (const path of ['/', '/training', '/races', '/attributes']) {
      const view = await renderApp(path)
      expect(screen.getByRole('heading', { level: 1, name: 'Create your runner' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
      view.unmount()
    }
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('has no profile choice: every runner starts as an All-rounder with every attribute at 16', async () => {
    await renderApp('/')
    expect(screen.getByText('New career · Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText(/Every runner starts as an All-rounder, with every attribute at 16/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Choose / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked()
    expect(Object.values(PROFILES['all-rounder'].attributes)).toEqual([16, 16, 16, 16, 16, 16])
  })
})

describe('career creation — appearance step', () => {
  function avatar() {
    return screen.getByRole('img', { name: /^Avatar preview/ })
  }

  it('opens first, with the sex choice and a preview', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Create your runner' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
    expect(avatar()).toHaveAccessibleName('Avatar preview: male, basic, skin tone 2, no shirt')
    expect(screen.getByRole('tab', { name: 'Skin' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('radio', { name: /Skin tone/ })).toHaveLength(4)
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('shows one body per skin tone for each sex and keeps a valid tone when the sex changes', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    expect(screen.getAllByRole('radio', { name: /Skin tone/ })).toHaveLength(3)
    expect(avatar().querySelector('[data-layer="body"]')!.getAttribute('href')).toMatch(/female-2/)

    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 4' }))
    expect(avatar()).toHaveAccessibleName('Avatar preview: male, basic, skin tone 4, no shirt')
    expect(avatar().querySelector('[data-layer="body"]')!.getAttribute('href')).toMatch(/male-4/)

    // Women have 3 bodies: tone 4 becomes tone 3.
    await user.click(screen.getByRole('radio', { name: 'Female' }))
    expect(avatar()).toHaveAccessibleName('Avatar preview: female, basic, skin tone 3, no shirt')
  })

  it('offers the basic head and the Level 1 heads of the skin tone, zoomed in on the face', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    expect(avatar()).not.toHaveAttribute('data-focus')
    await user.click(screen.getByRole('tab', { name: 'Hair' }))
    expect(avatar()).toHaveAttribute('data-focus', 'face')
    // Women, tone 2 (default): the basic head and Hairstyles 1 and 2.
    const hairPanel = screen.getByRole('tabpanel')
    expect(within(hairPanel).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'natural',
      'head-l1-01',
      'head-l1-02',
    ])
    expect(screen.getByRole('radio', { name: 'Basic' })).toBeChecked()
    // The note about hairstyles unlocking later shows only when locked heads exist (none in the current art).
    expect(screen.queryByText(/New hairstyles unlock as you level up/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Hairstyle 1' }))
    expect(avatar().querySelector('image[data-layer="head"]')!.getAttribute('href')).toMatch(/lvl1_women_head_01_tone2/)
    // The head follows the skin tone.
    await user.click(screen.getByRole('tab', { name: 'Skin' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 1' }))
    expect(avatar()).toHaveAccessibleName('Avatar preview: female, hairstyle 1, skin tone 1, no shirt')
    expect(avatar().querySelector('image[data-layer="head"]')!.getAttribute('href')).toMatch(/lvl1_women_head_01_tone1/)
  })

  it('offers no shirt (default) or the Level 1 shirt, and no shoes', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('tab', { name: 'Clothing' }))
    expect(screen.getByRole('radio', { name: 'No shirt' })).toBeChecked()
    expect(avatar().querySelectorAll('image')).toHaveLength(1)
    await user.click(screen.getByRole('radio', { name: 'Blue tank top' }))
    expect([...avatar().querySelectorAll('image')].map((i) => i.getAttribute('data-layer'))).toEqual(['body', 'shirt-l1-01'])
    expect(screen.queryByText(/shoe/i)).not.toBeInTheDocument()
    // Other shirts unlock with levels: a new runner (Level 1) does not see them yet.
    expect(screen.queryByRole('radio', { name: /Coral tank top/ })).not.toBeInTheDocument()
    expect(screen.getByText(/New shirts unlock as you level up/)).toBeInTheDocument()
  })

  it('switches tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    screen.getByRole('tab', { name: 'Skin' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Hair' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Hair' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Clothing' })).toHaveFocus()
  })

  it('saves the chosen appearance with the new career', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 1' }))
    await user.click(screen.getByRole('tab', { name: 'Clothing' }))
    await user.click(screen.getByRole('radio', { name: 'Charcoal T-shirt' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('img')).toHaveAccessibleName('Your runner: All-rounder, male')
    await user.type(screen.getByLabelText('Runner name'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    await started()
    expect(readSave()!.state.athlete.appearance).toEqual({ hair: 'natural', skin: 'tone-1', outfit: 'shirt-l1-01' })
    expect(readSave()!.state.equipment).toEqual([])
  })
})

describe('career creation — name step', () => {
  it('opens after the appearance step, with a preview and focus on the heading', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Name your runner' })).toHaveFocus()
    expect(screen.getByText('New career · Step 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('All-rounder · Male')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName('Your runner: All-rounder, male')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('Back returns to the first step with the same choices', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 3' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Create your runner' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Skin tone 3' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
  })

  it.each(['', '   '])('rejects the empty name %j and saves nothing', async (name) => {
    const user = userEvent.setup()
    await renderApp('/')
    await chooseAndContinue(user)
    if (name) await user.type(screen.getByLabelText('Runner name'), name)
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name for your runner.')
    expect(screen.getByLabelText('Runner name')).toHaveAttribute('aria-invalid', 'true')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('limits the name to 16 characters and trims spaces', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await chooseAndContinue(user)
    const input = screen.getByLabelText('Runner name')
    expect(input).toHaveAttribute('maxLength', '16')
    expect(input).toHaveAccessibleDescription('1–16 characters.')
    await user.type(input, '  Marta  ')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    await started()
    expect(readSave()!.state.athlete.name).toBe('Marta')
  })

  it.each(['female', 'male'] as const)('creates a %s All-rounder career with the approved initial state', async (sex) => {
    const user = userEvent.setup()
    await renderApp('/')
    await createCareer(user, sex, 'Alex')
    const profile = 'all-rounder'

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    // The country's flag beside the name (owner request, 4 November 2026).
    expect(screen.getByRole('heading', { level: 2, name: 'Alex Argentina - All-rounder' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    const save = readSave()!
    expect(save.schemaVersion).toBe(2)
    expect(save.state.athlete).toEqual({
      name: 'Alex',
      sex,
      appearance: defaultAppearance(),
      country: 'AR',
      profile,
      xp: 0,
      fitness: 20,
      fatigue: 0,
      attributes: { endurance: 16, climbing: 16, speed: 16, technical: 16, recovery: 16, consistency: 16 },
      spentAttributePoints: 0,
    })
    expect(save.state.fitnessDecayReference).toBe(T0)
    // The welcome was skipped: saved as done, never shown again.
    expect(save.state.coach).toEqual({ welcomeStep: 0, welcomeDone: true })
  })

  it('asks for the country, guessed from the browser language, and requires one', async () => {
    const user = userEvent.setup()
    await renderApp('/')
    await chooseAndContinue(user)
    // jsdom's language is en-US.
    expect(screen.getByLabelText('Country')).toHaveValue('US')
    await user.selectOptions(screen.getByLabelText('Country'), 'ES')
    await user.type(screen.getByLabelText('Runner name'), 'Marta')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    await started()
    expect(readSave()!.state.athlete.country).toBe('ES')
  })

  it('opens the Dashboard after starting, whichever route showed the flow', async () => {
    const user = userEvent.setup()
    const { router } = await renderApp('/career')
    await createCareer(user, 'female', 'Ana')
    expect(router.state.location.pathname).toBe('/')
  })

  it('keeps the new career after a reload', async () => {
    const user = userEvent.setup()
    const first = await renderApp('/')
    await createCareer(user, 'male', 'Leo')
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Leo Argentina - All-rounder' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Leo, male runner/ })).toBeInTheDocument()
    expect(readSave()!.state.athlete.sex).toBe('male')
  })
})

describe('incompatible save', () => {
  it('blocks every route with a warning for an M1 save, hides navigation and does not change it', async () => {
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    for (const path of ['/', '/training', '/career', '/equipment']) {
      const view = await renderApp(path)
      expect(screen.getByRole('heading', { level: 1, name: "Your saved career can't continue" })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('created with an earlier version')
      expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
      view.unmount()
    }
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)
  })

  it('Exit leaves the old save untouched, and the warning returns on the next visit', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.getByRole('heading', { name: 'Save left untouched' })).toHaveFocus()
    expect(screen.getByText(/You can close this page/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await user.click(screen.getByRole('button', { name: 'Back to options' }))
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)
  })

  it('Restart requires acknowledgement and writes nothing until the new career is started', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    await renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    expect(screen.getByRole('heading', { name: 'Confirm restart' })).toHaveFocus()
    const proceed = screen.getByRole('button', { name: 'Continue to create a runner' })
    expect(proceed).toHaveAttribute('aria-disabled', 'true')
    await user.click(proceed)
    expect(screen.getByRole('alert')).toHaveTextContent('Tick the box')
    expect(screen.queryByRole('heading', { name: 'Create your runner' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /permanently replaced/ }))
    await user.click(proceed)
    expect(screen.getByRole('heading', { level: 1, name: 'Create your runner' })).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await chooseAndContinue(user)
    expect(screen.getByText(/will replace your previous saved career/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await user.type(screen.getByLabelText('Runner name'), 'Marta')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    await started()
    await skipWelcome(user)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(readSave()).toMatchObject({
      schemaVersion: 2,
      state: { athlete: { name: 'Marta', sex: 'female', profile: 'all-rounder', xp: 0 } },
    })
  })

  it('Cancel on the confirmation step returns to the warning', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('cannot be bypassed by reloading during creation', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue to create a runner' }))
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('button', { name: 'Restart Career' })).toBeInTheDocument()
  })

  it('does not show the warning again after the reset flow is completed', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue to create a runner' }))
    await createCareer(user, 'male', 'Leo')
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restart Career' })).not.toBeInTheDocument()
  })

  it.each([
    ['damaged data', '{"schemaVersion":2,"state":{"athlete":', 'damaged or incomplete'],
    ['an unsupported version', JSON.stringify({ schemaVersion: 7, state: {} }), 'different version'],
  ])('shows the warning for %s without deleting it', async (_, raw, text) => {
    localStorage.setItem(SAVE_KEY, raw)
    await renderApp('/')
    expect(screen.getByRole('alert')).toHaveTextContent(text)
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  })
})
