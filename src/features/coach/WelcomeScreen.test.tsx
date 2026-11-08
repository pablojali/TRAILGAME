import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createInitialGameState, type GameState } from '../../game-engine/gameState'
import { parseGameState } from '../../repositories/gameRepository'
import { mergeClientFields } from '../../server/careerOps'
import { newGame, T0 } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'
import { coachLook, coachPortrait } from './coach'

/** A career from before the coach: no coach progress saved. */
function withoutCoach(state: GameState): GameState {
  const copy = { ...state }
  delete copy.coach
  return copy
}

/** A career just created: the coach's welcome is still to see. */
function freshCareer(): GameState {
  return createInitialGameState('all-rounder', T0, { name: 'Alex', sex: 'male' })
}

const savedCoach = () => readSave()?.state.coach

describe('Trail Coach welcome', () => {
  it('greets a new career full screen, without navigation, and walks through the three screens to the Dashboard', async () => {
    const user = userEvent.setup()
    seedCareer(freshCareer())
    const { router } = await renderApp('/training')

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Trail Manager!' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Your coach' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Let's go" }))
    expect(screen.getByRole('heading', { level: 1, name: 'Your journey' })).toBeInTheDocument()
    expect(screen.getByText('Compete in trail races')).toBeInTheDocument()
    await waitFor(() => expect(savedCoach()).toEqual({ welcomeStep: 1, welcomeDone: false }))

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/You don't need to learn everything today/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start my career' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    await waitFor(() => expect(savedCoach()).toEqual({ welcomeStep: 2, welcomeDone: true }))
  })

  it('resumes at the screen the player left after a reload', async () => {
    const user = userEvent.setup()
    seedCareer(freshCareer())
    const first = await renderApp('/')
    await user.click(screen.getByRole('button', { name: "Let's go" }))
    await waitFor(() => expect(savedCoach()?.welcomeStep).toBe(1))
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Your journey' })).toBeInTheDocument()
  })

  it('Skip marks it done: it never shows again', async () => {
    const user = userEvent.setup()
    seedCareer(freshCareer())
    const first = await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    await waitFor(() => expect(savedCoach()?.welcomeDone).toBe(true))
    first.unmount()

    await renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('is not shown to careers from before the coach (no coach progress saved)', async () => {
    seedCareer(withoutCoach(newGame()))
    await renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome to Trail Manager!' })).not.toBeInTheDocument()
  })
})

describe('coach progress in saves', () => {
  it('starts pending for a new career and survives a save round trip; invalid or missing means none', () => {
    const state = freshCareer()
    expect(state.coach).toEqual({ welcomeStep: 0, welcomeDone: false })
    expect(parseGameState(JSON.parse(JSON.stringify(state)), T0)?.coach).toEqual({ welcomeStep: 0, welcomeDone: false })
    expect(parseGameState({ ...JSON.parse(JSON.stringify(state)), coach: { welcomeStep: -1, welcomeDone: 'no' } }, T0)?.coach).toBeUndefined()
    expect(parseGameState(JSON.parse(JSON.stringify(withoutCoach(state))), T0)?.coach).toBeUndefined()
  })

  it('the server takes the player\'s progress, but a welcome done stays done', () => {
    const server = freshCareer()
    const client = { ...server, coach: { welcomeStep: 1, welcomeDone: false } }
    expect(mergeClientFields(server, client, T0).coach).toEqual({ welcomeStep: 1, welcomeDone: false })
    const done = { ...server, coach: { welcomeStep: 2, welcomeDone: true } }
    expect(mergeClientFields(done, client, T0).coach).toEqual({ welcomeStep: 1, welcomeDone: true })
    expect(mergeClientFields(withoutCoach(server), client, T0).coach).toBeUndefined()
  })
})

describe('coach look', () => {
  it('matches the runner: tone 1 dark, tones 2 and 4 Asian, tone 3 light', () => {
    expect(coachLook('tone-1')).toBe('dark')
    expect(coachLook('tone-2')).toBe('asian')
    expect(coachLook('tone-3')).toBe('light')
    expect(coachLook('tone-4')).toBe('asian')
  })

  it('has a portrait for every sex and look', () => {
    for (const sex of ['female', 'male'] as const) {
      for (const skin of ['tone-1', 'tone-2', 'tone-3', 'tone-4'] as const) {
        expect(coachPortrait(sex, skin)).toMatch(/\.webp/)
      }
    }
  })
})
