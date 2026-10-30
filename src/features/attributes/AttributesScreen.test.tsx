import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PROFILES } from '../../domain/athlete/profiles'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

function value(label: string) {
  return screen.getByText(label, { selector: 'span' }).nextElementSibling!.textContent
}

function pointsLeft() {
  return screen.getByText(/to spend$/).previousElementSibling!.textContent
}

function addButton(label: string) {
  return screen.getByRole('button', { name: `Add 1 point to ${label}` })
}

describe('AttributesScreen', () => {
  it('shows the six attributes and no points for a new career', async () => {
    seedCareer(newGame('endurance'))
    const user = userEvent.setup()
    await renderApp('/attributes')
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toBeInTheDocument()
    expect(pointsLeft()).toBe('0')
    expect(value('Endurance')).toBe('20.0')
    expect(value('Technical')).toBe('13.0')
    for (const label of ['Endurance', 'Climbing', 'Speed', 'Technical', 'Recovery', 'Consistency']) {
      expect(addButton(label)).toHaveAttribute('aria-disabled', 'true')
    }
    await user.click(addButton('Speed'))
    expect(screen.getByText('No attribute points left to spend.')).toBeInTheDocument()
    expect(readSave()!.state.athlete.attributes).toEqual(PROFILES.endurance.attributes)
  })

  it('spends one point per click, gives feedback and persists', async () => {
    seedCareer(withAthlete(newGame('climber'), { xp: 260 }))
    const user = userEvent.setup()
    const first = await renderApp('/attributes')
    expect(pointsLeft()).toBe('4')

    await user.click(addButton('Speed'))
    expect(value('Speed')).toBe('14.0')
    expect(pointsLeft()).toBe('3')
    expect(screen.getByText('Speed increased to 14.0. 3 points left.')).toBeInTheDocument()

    await user.click(addButton('Speed'))
    await user.click(addButton('Recovery'))
    expect(screen.getByText('Recovery increased to 15.0. 1 point left.')).toBeInTheDocument()
    expect(readSave()!.state.athlete).toMatchObject({
      spentAttributePoints: 3,
      attributes: { ...PROFILES.climber.attributes, speed: 15, recovery: 15 },
    })
    first.unmount()

    await renderApp('/attributes')
    expect(pointsLeft()).toBe('1')
    expect(value('Speed')).toBe('15.0')
  })

  it('disables every increase once the points run out', async () => {
    seedCareer(withAthlete(newGame(), { xp: 100 }))
    const user = userEvent.setup()
    await renderApp('/attributes')
    await user.click(addButton('Climbing'))
    await user.click(addButton('Climbing'))
    expect(pointsLeft()).toBe('0')
    expect(addButton('Climbing')).toHaveAttribute('aria-disabled', 'true')
    await user.click(addButton('Climbing'))
    expect(value('Climbing')).toBe('18.0')
    expect(readSave()!.state.athlete.spentAttributePoints).toBe(2)
  })

  it('never spends more points than available, even with rapid repeated clicks', async () => {
    seedCareer(withAthlete(newGame(), { xp: 100 }))
    await renderApp('/attributes')
    const button = addButton('Speed')
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() =>
      expect(readSave()!.state.athlete).toMatchObject({
        spentAttributePoints: 2,
        attributes: { ...PROFILES['all-rounder'].attributes, speed: 18 },
      }),
    )
    expect(pointsLeft()).toBe('0')
  })

  // The 100 cap and keeping points when every attribute is at 100 are covered in
  // src/game-engine/attributes.test.ts: a valid M2 save can earn at most 8 points, so 100 is
  // not reachable through the UI.

  it('works with the keyboard', async () => {
    seedCareer(withAthlete(newGame(), { xp: 100 }))
    const user = userEvent.setup()
    await renderApp('/attributes')
    addButton('Endurance').focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(value('Endurance')).toBe('18.0')
    // Focus stays on the (now inactive) button rather than being lost.
    expect(addButton('Endurance')).toHaveFocus()
    expect(addButton('Endurance')).toHaveAttribute('aria-disabled', 'true')
  })

  it('is reachable from the Dashboard', async () => {
    seedCareer(withAthlete(newGame(), { xp: 100 }))
    const user = userEvent.setup()
    await renderApp('/')
    await user.click(screen.getByRole('link', { name: /attribute points? to spend/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Attributes' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to Dashboard' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})
