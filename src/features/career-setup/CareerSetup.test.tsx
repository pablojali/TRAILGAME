import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defaultAppearance } from '../../domain/athlete/appearance'
import type { ProfileId, Sex } from '../../domain/athlete/athlete'
import { PROFILE_IDS, PROFILES } from '../../domain/athlete/profiles'
import { SAVE_KEY } from '../../repositories/gameRepository'
import { T0 } from '../../test/gameFixtures'
import { M1_SAVE } from '../../test/legacySaves'
import { readSave, renderApp } from '../../test/renderApp'

type User = ReturnType<typeof userEvent.setup>

function chooseButton() {
  return screen.getByRole('button', { name: /^Choose / })
}

function slides() {
  return within(screen.getByRole('region', { name: /Starting profiles/ })).getAllByRole('group')
}

function selectedSlide() {
  return slides().find((s) => s.getAttribute('aria-current') === 'true')!
}

/** Profile step → appearance step, keeping the default appearance. */
async function chooseAndContinue(user: User) {
  await user.click(chooseButton())
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

/** Runs the whole creation flow with the given choices. */
async function createCareer(user: User, profile: ProfileId, sex: Sex, name: string) {
  await user.click(screen.getByRole('radio', { name: sex === 'male' ? 'Male' : 'Female' }))
  await user.click(screen.getByRole('button', { name: `Show ${PROFILES[profile].label}` }))
  await user.click(screen.getByRole('button', { name: `Choose ${PROFILES[profile].label}` }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText('Runner name'), name)
  await user.click(screen.getByRole('button', { name: 'Start career' }))
}

describe('career creation — profile step', () => {
  it('shows the creation flow on every route, without navigation and without saving', () => {
    for (const path of ['/', '/training', '/races', '/attributes']) {
      const view = renderApp(path)
      expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
      view.unmount()
    }
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('preselects Female and the first profile, with a confirm button naming it', () => {
    renderApp('/')
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked()
    expect(slides()).toHaveLength(4)
    expect(selectedSlide()).toHaveAccessibleName('Climber, 1 of 4')
    expect(chooseButton()).toHaveTextContent('Choose Climber')
    expect(screen.getByRole('button', { name: 'Show Climber' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows each profile with name, description, six bars, strengths, weaknesses and 96 points', () => {
    renderApp('/')
    const [climber, , allRounder] = slides()
    const card = within(climber!)
    expect(card.getByRole('heading', { name: 'Climber' })).toBeInTheDocument()
    expect(card.getByText(PROFILES.climber.description)).toBeInTheDocument()
    expect(card.getAllByRole('meter')).toHaveLength(6)
    expect(card.getByRole('meter', { name: 'Climbing' })).toHaveAttribute('aria-valuetext', '20 points')
    expect(card.getByText('Climbing').closest('li')).toHaveTextContent('▲ Climbing (strength)20')
    expect(card.getByText('Speed').closest('li')).toHaveTextContent('▼ Speed (weakness)13')
    expect(card.getByText('Endurance').closest('li')).toHaveTextContent(/^Endurance16$/)
    expect(card.getByText('96 points')).toBeInTheDocument()
    expect(climber).not.toHaveTextContent('Strengths:')
    // All-rounder has no strengths or weaknesses.
    expect(allRounder).not.toHaveTextContent(/▲|▼/)
  })

  it.each(PROFILE_IDS)('the %s card shows its exact starting attributes', (id) => {
    renderApp('/')
    const card = slides()[PROFILE_IDS.indexOf(id)]!
    for (const meter of within(card).getAllByRole('meter')) {
      const label = meter.getAttribute('aria-label')!.toLowerCase() as keyof typeof PROFILES.climber.attributes
      expect(meter).toHaveAttribute('aria-valuenow', String(PROFILES[id].attributes[label]))
    }
  })

  it('switches profile with the dots', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Show Endurance' }))
    expect(selectedSlide()).toHaveAccessibleName('Endurance, 4 of 4')
    expect(chooseButton()).toHaveTextContent('Choose Endurance')
    expect(screen.getByRole('button', { name: 'Show Endurance' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Show Climber' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches profile with the arrow keys and by tapping another card', async () => {
    const user = userEvent.setup()
    renderApp('/')
    screen.getByRole('region', { name: /Starting profiles/ }).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(chooseButton()).toHaveTextContent('Choose All-rounder')
    await user.keyboard('{ArrowLeft}')
    expect(chooseButton()).toHaveTextContent('Choose Sprinter')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(chooseButton()).toHaveTextContent('Choose Climber')

    await user.click(slides()[3]!)
    expect(chooseButton()).toHaveTextContent('Choose Endurance')
  })

  it('changes every runner image when the sex changes', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const art = () => slides().map((s) => within(s).getByRole('img'))
    // Climber has final artwork; the other profiles still show labelled placeholders.
    expect(art().map((img) => img.getAttribute('aria-label') ?? img.getAttribute('alt'))).toEqual([
      'Climber, female runner',
      'Sprinter, female runner (placeholder art)',
      'All-rounder, female runner (placeholder art)',
      'Endurance, female runner (placeholder art)',
    ])
    expect(art()[0]).toHaveAttribute('src', expect.stringContaining('/creation/female/climber.webp'))

    await user.click(screen.getByRole('radio', { name: 'Male' }))
    expect(art()[0]).toHaveAccessibleName('Climber, male runner')
    expect(art()[0]).toHaveAttribute('src', expect.stringContaining('/creation/male/climber.webp'))
    expect(art().slice(1).every((img) => img.getAttribute('aria-label')!.includes(', male runner'))).toBe(true)
    // Selection is unaffected.
    expect(chooseButton()).toHaveTextContent('Choose Climber')
  })
})

describe('career creation — appearance step', () => {
  function avatar() {
    return screen.getByRole('img', { name: /^Avatar preview/ })
  }

  it('opens after choosing a profile, with the same sex choice, a preview and focus on the heading', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(chooseButton())

    expect(screen.getByRole('heading', { level: 1, name: 'Customize your runner' })).toHaveFocus()
    expect(screen.getByText('New career · Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
    expect(avatar()).toHaveAccessibleName('Avatar preview: male, short, skin tone 2, basic kit')
    expect(screen.getByRole('tab', { name: 'Hair' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('radio', { name: /Short|Buzz cut|Curly/ })).toHaveLength(3)
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('changes hair, skin and sex on the preview; hair keeps its position when the sex changes', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(chooseButton())
    await user.click(screen.getByRole('radio', { name: 'Braid' }))
    await user.click(screen.getByRole('tab', { name: 'Skin' }))
    expect(screen.getAllByRole('radio', { name: /Skin tone/ })).toHaveLength(4)
    // The placeholder silhouette cannot show the tone, so the preview says so.
    expect(screen.getByText('Skin tone shows with the final art.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Skin tone 4' }))
    expect(avatar()).toHaveAccessibleName('Avatar preview: female, braid, skin tone 4, basic kit')

    await user.click(screen.getByRole('radio', { name: 'Male' }))
    expect(avatar()).toHaveAccessibleName('Avatar preview: male, curly, skin tone 4, basic kit')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
  })

  it('offers only the basic kit as outfit, and no shoes', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(chooseButton())
    await user.click(screen.getByRole('tab', { name: 'Outfit' }))
    expect(screen.getByRole('radio', { name: 'Basic kit' })).toBeChecked()
    expect(screen.getAllByRole('radio', { name: /kit/ })).toHaveLength(1)
    expect(screen.queryByText(/shoe/i)).not.toBeInTheDocument()
  })

  it('switches tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(chooseButton())
    screen.getByRole('tab', { name: 'Hair' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Skin' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Skin' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Outfit' })).toHaveFocus()
  })

  it('saves the chosen appearance with the new career', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(chooseButton())
    await user.click(screen.getByRole('radio', { name: 'Buzz cut' }))
    await user.click(screen.getByRole('tab', { name: 'Skin' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 1' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('img')).toHaveAccessibleName('Your runner: Climber, male')
    await user.type(screen.getByLabelText('Runner name'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    expect(readSave()!.state.athlete.appearance).toEqual({ hair: 'buzz', skin: 'tone-1', outfit: 'basic' })
  })
})

describe('career creation — name step', () => {
  it('opens after the appearance step, with a preview and focus on the heading', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('button', { name: 'Show Sprinter' }))
    await user.click(screen.getByRole('button', { name: 'Choose Sprinter' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Name your runner' })).toHaveFocus()
    expect(screen.getByText('New career · Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('Sprinter · Male')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName('Your runner: Sprinter, male')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('Back returns step by step with the same choices', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('button', { name: 'Show All-rounder' }))
    await user.click(screen.getByRole('button', { name: 'Choose All-rounder' }))
    await user.click(screen.getByRole('radio', { name: 'Curly' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Customize your runner' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Curly' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Choose your athlete' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
    expect(chooseButton()).toHaveTextContent('Choose All-rounder')
  })

  it.each(['', '   '])('rejects the empty name %j and saves nothing', async (name) => {
    const user = userEvent.setup()
    renderApp('/')
    await chooseAndContinue(user)
    if (name) await user.type(screen.getByLabelText('Runner name'), name)
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name for your runner.')
    expect(screen.getByLabelText('Runner name')).toHaveAttribute('aria-invalid', 'true')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('limits the name to 16 characters and trims spaces', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await chooseAndContinue(user)
    const input = screen.getByLabelText('Runner name')
    expect(input).toHaveAttribute('maxLength', '16')
    expect(input).toHaveAccessibleDescription('1–16 characters.')
    await user.type(input, '  Marta  ')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    expect(readSave()!.state.athlete.name).toBe('Marta')
  })

  it.each(
    PROFILE_IDS.flatMap((profile) => (['female', 'male'] as const).map((sex) => [profile, sex] as const)),
  )('creates a %s %s career with the approved initial state', async (profile, sex) => {
    const user = userEvent.setup()
    renderApp('/')
    await createCareer(user, profile, sex, 'Alex')

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: `Alex - ${PROFILES[profile].label} · Lv 1` })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    const save = readSave()!
    expect(save.schemaVersion).toBe(2)
    expect(save.state.athlete).toEqual({
      name: 'Alex',
      sex,
      appearance: defaultAppearance(sex),
      profile,
      xp: 0,
      fitness: 20,
      fatigue: 0,
      attributes: PROFILES[profile].attributes,
      spentAttributePoints: 0,
    })
    expect(save.state.fitnessDecayReference).toBe(T0)
  })

  it('opens the Dashboard after starting, whichever route showed the flow', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/career')
    await createCareer(user, 'endurance', 'female', 'Ana')
    expect(router.state.location.pathname).toBe('/')
  })

  it('keeps the new career after a reload', async () => {
    const user = userEvent.setup()
    const first = renderApp('/')
    await createCareer(user, 'endurance', 'male', 'Leo')
    first.unmount()

    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Leo - Endurance · Lv 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Leo, male runner/ })).toBeInTheDocument()
    expect(readSave()!.state.athlete.sex).toBe('male')
  })
})

describe('incompatible save', () => {
  it('blocks every route with a warning for an M1 save, hides navigation and does not change it', () => {
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    for (const path of ['/', '/training', '/career', '/equipment']) {
      const view = renderApp(path)
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

  it('Restart requires acknowledgement and writes nothing until the new career is started', async () => {
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
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await chooseAndContinue(user)
    expect(screen.getByText(/will replace your previous saved career/)).toBeInTheDocument()
    expect(localStorage.getItem(SAVE_KEY)).toBe(M1_SAVE)

    await user.type(screen.getByLabelText('Runner name'), 'Marta')
    await user.click(screen.getByRole('button', { name: 'Start career' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(readSave()).toMatchObject({
      schemaVersion: 2,
      state: { athlete: { name: 'Marta', sex: 'female', profile: 'climber', xp: 0 } },
    })
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

  it('cannot be bypassed by reloading during creation', async () => {
    const user = userEvent.setup()
    localStorage.setItem(SAVE_KEY, M1_SAVE)
    const first = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Restart Career' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue to profile selection' }))
    await user.click(chooseButton())
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
    await createCareer(user, 'sprinter', 'male', 'Leo')
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
