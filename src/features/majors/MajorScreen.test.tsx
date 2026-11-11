import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MajorAction } from '../../repositories/supabase/majorClient'
import type { PlayerMajor } from '../../server/majorOps'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

const { call, race } = vi.hoisted(() => ({ call: vi.fn(), race: vi.fn() }))
vi.mock('../../repositories/supabase/majorClient', () => ({
  getMajorService: () => ({ call, race, mediaUrl: (path: string) => `https://media/${path}` }),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const hour = 3_600_000

function major(overrides: Partial<PlayerMajor> = {}): PlayerMajor {
  return {
    id: ID, name: 'Major de Noviembre', description: 'El primero', raceId: 'RACE-002',
    scheduledStartAt: new Date(Date.now() + 26 * hour).toISOString(), status: 'REGISTRATION_OPEN',
    registrationOpenAt: new Date(Date.now() - hour).toISOString(), readyOpenAt: new Date(Date.now() + 25 * hour).toISOString(),
    decisionWindowS: 90, runningS: 150, participantLimit: 50, bands: null, publishedAt: '', cancelReason: null,
    bannerPath: null, clips: {},
    categories: [
      { idx: 1, name: 'Banda 1', minLevel: 1, maxLevel: 8 },
      { idx: 2, name: 'Banda 2', minLevel: 9, maxLevel: null },
    ],
    entrants: { 1: { main: 12, waitlist: 0 } },
    registration: null,
    ...overrides,
  }
}

describe('Sunday Major for the player (phase 2)', () => {
  beforeEach(() => {
    call.mockReset()
    race.mockReset()
  })

  it('shows the next Major above the races, registers, saves the plan and confirms READY', async () => {
    const user = userEvent.setup()
    seedCareer(withAthlete({ ...newGame(), consumables: { gel: 1, bar: 0 } }, { xp: 0 }))
    let current = major()
    call.mockImplementation(async (request: MajorAction = { action: "majors" }) => {
      if (request.action === 'register') current = { ...current, registration: { categoryIdx: 1, level: 1, list: 'main', status: 'REGISTERED', registeredAt: '', readyAt: null, plan: null } }
      if (request.action === 'save-plan') current = { ...current, registration: { ...current.registration!, plan: request.plan } }
      if (request.action === 'ready') current = { ...current, registration: { ...current.registration!, status: 'READY', readyAt: 'now' } }
      return { ok: true, majors: [current] }
    })

    await renderApp('/races')
    await user.click(await screen.findByRole('link', { name: /Major de Noviembre/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Major de Noviembre' })).toBeInTheDocument()
    expect(screen.getByText('Registration open')).toBeInTheDocument()
    expect(screen.getByText('Riverside Trail · 8 km · +220 m')).toBeInTheDocument()
    // The player's category (level 1) is marked.
    const categories = within(screen.getByRole('list', { name: 'Your category' }))
    expect(categories.getByText('Banda 1 · levels 1–8').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(categories.getByText('12/50 registered · 0 waiting')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Register (free)' }))
    expect(call).toHaveBeenCalledWith({ action: 'register', id: ID })
    expect(await screen.findByText("You're registered")).toBeInTheDocument()
    expect(screen.getByText(/READY opens/)).toBeInTheDocument()

    // The plan: a style fills the segments, a stop changed by hand, the gel taken.
    await user.click(screen.getByRole('tab', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Aggressive' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stop at aid station 1' }), 'quick')
    await user.click(screen.getByRole('button', { name: /^Energy gel/ }))
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    const saved = call.mock.calls.find(([r]) => r.action === 'save-plan')![0].plan
    expect(saved).toMatchObject({ style: 'aggressive', gel: true, bar: false, segments: [{ stop: 'quick' }, { stop: null }] })
    expect(await screen.findByText('Plan saved.')).toBeInTheDocument()

    // Withdrawing is offered until the start.
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
  })

  it('offers READY in its window and shows a locked grid and an absence', async () => {
    const user = userEvent.setup()
    seedCareer()
    let current = major({
      readyOpenAt: new Date(Date.now() - 60_000).toISOString(),
      registration: { categoryIdx: 1, level: 1, list: 'main', status: 'REGISTERED', registeredAt: '', readyAt: null, plan: null },
    })
    call.mockImplementation(async (request: MajorAction = { action: "majors" }) => {
      if (request.action === 'ready') current = { ...current, registration: { ...current.registration!, status: 'READY', readyAt: 'now' } }
      return { ok: true, majors: [current] }
    })
    const first = await renderApp(`/majors/${ID}`)
    expect(await screen.findByText('READY window open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "I'm READY" }))
    expect(call).toHaveBeenCalledWith({ action: 'ready', id: ID })
    expect(await screen.findByRole('button', { name: 'Update READY' })).toBeInTheDocument()
    first.unmount()

    current = { ...major({ status: 'LOCKED' }), registration: { ...current.registration!, status: 'ABSENT' } }
    await renderApp(`/majors/${ID}`)
    expect(await screen.findByText('Grid locked')).toBeInTheDocument()
    expect(screen.getByText("Absent: you weren't READY at the start")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I'm READY" })).not.toBeInTheDocument()
  })

  it('shows the server’s refusal', async () => {
    const user = userEvent.setup()
    seedCareer()
    call.mockImplementation(async (request: MajorAction = { action: "majors" }) => (request.action === 'register' ? { ok: false, error: 'closed' } : { ok: true, majors: [major()] }))
    await renderApp(`/majors/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Register (free)' }))
    expect(await screen.findByText('Registration is closed.')).toBeInTheDocument()
  })

  it('shows the live race on the grid: the aid-station decision with its countdown, the plan if none, and the standings', async () => {
    const user = userEvent.setup()
    seedCareer()
    const racing = major({ status: 'RUNNING', registration: { categoryIdx: 1, level: 1, list: 'main', status: 'RACING', registeredAt: '', readyAt: 'x', plan: null } })
    call.mockImplementation(async () => ({ ok: true, majors: [racing] }))
    let myDecision: { stop: string; intensity: string; source: string } | null = null
    const row = (slot: number, position: number, timeS: number, extra = {}) => ({ slot, position, timeS, gapS: timeS - 1300, name: `Rival ${slot}.`, country: 'FR', me: false, intensity: 'target', auto: false, ...extra })
    race.mockImplementation(async (request: { action: string; stop?: string; intensity?: string }) => {
      if (request.action === 'decide') myDecision = { stop: request.stop!, intensity: request.intensity!, source: 'PLAYER' }
      return {
        ok: true,
        now: new Date().toISOString(),
        race: {
          category: { idx: 1, name: 'Banda 1', phase: 'PA', segment: 0, segments: 2, phaseEndsAt: new Date(Date.now() + 60_000).toISOString() },
          standings: [row(2, 1, 1300), row(1, 2, 1310, { name: 'Demo Runner', me: true }), row(3, 3, 1330, { name: 'Bea' })],
          me: { slot: 1, elapsedS: 1310, energy: 72, fatigue: 28, next: 'target', splits: [] },
          myDecision,
          planned: { stop: 'normal', intensity: 'target' },
          runningS: 150,
          windowS: 90,
        },
      }
    })
    await renderApp(`/majors/${ID}`)
    expect(await screen.findByText('Aid station 1 · your decision')).toBeInTheDocument()
    expect(screen.getByText(/left$/)).toBeInTheDocument()
    expect(screen.getByText('Ahead · Rival 2.')).toBeInTheDocument()
    expect(screen.getByText('+0:10')).toBeInTheDocument()
    expect(screen.getByText("If you don't decide: Normal stop · Target pace (your plan).")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Slow' }))
    await user.click(screen.getByRole('button', { name: 'Easy' }))
    await user.click(screen.getByRole('button', { name: 'Confirm decision' }))
    expect(race).toHaveBeenCalledWith({ action: 'decide', id: ID, segment: 0, stop: 'slow', intensity: 'easy' })
    expect(await screen.findByText('Sent: Slow stop · Easy. You can change it until the window closes.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Standings' }))
    const table = within(screen.getByRole('list', { name: 'Standings' }))
    expect(table.getAllByRole('listitem')).toHaveLength(3)
    expect(table.getByText('Demo Runner').closest('li')).toHaveAttribute('aria-current', 'true')
    // NPCs are not identifiable: no tag on anyone else's row.
    expect(table.queryByText('NPC')).toBeNull()
    expect(within(table.getByText('Bea').closest('li')!).queryByText('auto')).toBeNull()
  })
})
