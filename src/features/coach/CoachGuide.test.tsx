import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createInitialGameState, type GameState, type RaceEntry } from '../../game-engine/gameState'
import { T0 } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'
import { currentMoment, MOMENT_IDS } from './moments'

/** A new career past the welcome, with the given coach moments already seen. */
function career(seen: string[] = [], step?: number): GameState {
  const state = createInitialGameState('all-rounder', T0, { name: 'Alex', sex: 'female' })
  return { ...state, coach: { welcomeStep: 1, welcomeDone: true, seen, ...(step === undefined ? {} : { step }) } }
}

const coachPanel = () => screen.getByRole('dialog', { name: /./ })
const savedCoach = () => readSave()?.state.coach

describe('Trail Coach moments', () => {
  it('tours the Dashboard (attributes, Fitness and Fatigue), then only Training leads on', async () => {
    const user = userEvent.setup()
    seedCareer(career())
    const { router } = await renderApp('/')

    expect(await screen.findByRole('dialog', { name: 'Your attributes' })).toBeInTheDocument()
    await user.click(within(coachPanel()).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Fitness and Fatigue' })).toBeInTheDocument()
    await waitFor(() => expect(savedCoach()?.step).toBe(1))
    await user.click(within(coachPanel()).getByRole('button', { name: 'Next' }))

    const plan = screen.getByRole('dialog', { name: "Let's plan your week" })
    expect(within(plan).queryByRole('button', { name: /Next|Got it/ })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Training' }))

    // On Training: three short steps, then the screen is free.
    expect(router.state.location.pathname).toBe('/training')
    expect(await screen.findByRole('dialog', { name: 'Your week' })).toBeInTheDocument()
    await user.click(within(coachPanel()).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Choose a session' })).toBeInTheDocument()
    await user.click(within(coachPanel()).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Complete the day' })).toBeInTheDocument()
    await user.click(within(coachPanel()).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(savedCoach()).toMatchObject({ seen: ['dashboard', 'training'], step: 0 }))
  })

  it('inside the refuge: improving it, then the starter shoes put on, then Home (owner request, 19 November 2026)', async () => {
    const user = userEvent.setup()
    seedCareer(career())
    const { router } = await renderApp('/base-camp?view=interior')

    // The refuge is empty: Customize, the free gear stand put in, then the gear button it brings.
    expect(await screen.findByRole('dialog', { name: 'Make it yours' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Gear' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    expect(await screen.findByRole('dialog', { name: 'Your gear stand' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Gear stand$/ }))
    await waitFor(() => expect(readSave()?.state.camp?.using).toEqual(['gear-stand']))
    expect(await screen.findByRole('dialog', { name: 'Your gear' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Gear' }))

    expect(router.state.location.pathname).toBe('/equipment')
    expect(await screen.findByRole('dialog', { name: 'Your shoes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Shoes/ }))
    expect(await screen.findByRole('dialog', { name: 'Your first pair' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Starter/ }))
    expect(await screen.findByRole('dialog', { name: 'Put them on' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Equip/ }))

    expect(await screen.findByRole('dialog', { name: 'Ready to start!' })).toBeInTheDocument()
    await waitFor(() => expect(readSave()?.state.equipment).toContain('starter-shoes'))
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Dashboard' }))
    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('dialog', { name: 'Your attributes' })).toBeInTheDocument()
  })

  it('resumes the step after a reload', async () => {
    seedCareer(career([], 1))
    await renderApp('/')
    expect(await screen.findByRole('dialog', { name: 'Fitness and Fatigue' })).toBeInTheDocument()
  })

  it('Skip tips ends every moment for good', async () => {
    const user = userEvent.setup()
    seedCareer(career())
    const first = await renderApp('/')
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Skip tips' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(savedCoach()?.seen).toEqual([...MOMENT_IDS]))
    first.unmount()
    await renderApp('/training')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('after the first week points to Races, then explains the race list', async () => {
    const user = userEvent.setup()
    const state = career(['dashboard', 'training'])
    seedCareer({ ...state, week: { ...state.week, number: 2 } })
    await renderApp('/')
    expect(await screen.findByRole('dialog', { name: 'First week done!' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Races' }))
    expect(await screen.findByRole('dialog', { name: 'Choose a race' })).toBeInTheDocument()
  })

  it('is never shown to careers from before the coach', async () => {
    const state = career()
    delete state.coach
    seedCareer(state)
    await renderApp('/')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('which moment', () => {
  const finished = { status: 'finished' } as unknown as RaceEntry
  const base = career(['dashboard', 'training', 'race-list', 'race-prep'])

  it('after the first race: Career, but not while the race or its result is on screen', () => {
    const raced = { ...base, raceEntries: [finished] }
    expect(currentMoment(raced, '/races/results/entry-1')).toBeNull()
    expect(currentMoment(raced, '/races/run/entry-1')).toBeNull()
    expect(currentMoment(raced, '/')?.id).toBe('first-race')
    expect(currentMoment({ ...raced, coach: { ...raced.coach!, seen: [...raced.coach!.seen!, 'first-race'] } }, '/career')?.id).toBe('career')
    expect(currentMoment(base, '/')).toBeNull()
  })

  it('nothing before the welcome is done', () => {
    expect(currentMoment({ ...base, coach: { welcomeStep: 0, welcomeDone: false } }, '/')).toBeNull()
  })
})
