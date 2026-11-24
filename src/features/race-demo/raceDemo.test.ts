import { describe, expect, it } from 'vitest'
import { depthAlpha, FAR_Z, gapToZ, makeCamera, NEAR_Z, PLAYER_Z, project } from './projection'
import { advanceGait, runnerPose, STANDING, strideHz } from './runnerRig'
import { GAP_MAX, GAP_MIN, RaceSimulation } from './simulation'
import type { RaceViewRunner } from './types'
import { DecorPool, laneOf, syncRunners, type ShownRunner } from './world'

const look = { skin: 'tone-1', hair: 'short-dark', shirt: 'red', shorts: 'black', shoes: 'white', pack: null }

describe('race back view: projection', () => {
  const camera = makeCamera(400, 800)

  it('draws farther things smaller and nearer the horizon', () => {
    const near = project(camera, 1, 5)
    const far = project(camera, 1, 50)
    expect(far.scale).toBeLessThan(near.scale)
    expect(far.y).toBeLessThan(near.y)
    expect(far.y).toBeGreaterThan(camera.horizonY)
    // Sideways offsets shrink towards the vanishing point.
    expect(far.x - 200).toBeLessThan(near.x - 200)
  })

  it('puts a rival ahead farther away than the player, and one behind closer to the camera', () => {
    expect(gapToZ(-10)).toBe(PLAYER_Z + 10)
    expect(gapToZ(1)).toBeLessThan(PLAYER_Z)
  })

  it('fades things in from the horizon and out before the lens, so nothing pops', () => {
    expect(depthAlpha(FAR_Z)).toBe(0)
    expect(depthAlpha(FAR_Z * 0.5)).toBe(1)
    expect(depthAlpha(NEAR_Z)).toBe(0)
    expect(depthAlpha(FAR_Z * 0.9)).toBeGreaterThan(0)
  })
})

describe('race back view: scenery pool', () => {
  it('keeps the same pieces and sends the ones passed back towards the horizon', () => {
    const pool = new DecorPool()
    const pieces = [...pool.items]
    for (let odometer = 0; odometer < 500; odometer += 0.7) {
      pool.update(odometer)
      for (const item of pool.items) expect(item.at - odometer).toBeGreaterThan(NEAR_Z * 0.5 - 0.01)
    }
    expect(pool.items).toHaveLength(pieces.length)
    pool.items.forEach((item, i) => expect(item).toBe(pieces[i]))
  })
})

describe('race back view: rivals', () => {
  const runner = (id: string, gapMetros: number): RaceViewRunner => ({ id, gapMetros, appearance: look })

  it('fades a new rival in and a removed one out, then forgets it', () => {
    const shown = new Map<string, ShownRunner>()
    syncRunners(shown, [runner('a', -30)], 0.1)
    expect(shown.get('a')!.presence).toBeGreaterThan(0)
    expect(shown.get('a')!.presence).toBeLessThan(1)
    for (let i = 0; i < 10; i++) syncRunners(shown, [runner('a', -30)], 0.1)
    expect(shown.get('a')!.presence).toBe(1)
    syncRunners(shown, [], 0.1)
    expect(shown.get('a')!.leaving).toBe(true)
    for (let i = 0; i < 10; i++) syncRunners(shown, [], 0.1)
    expect(shown.has('a')).toBe(false)
  })

  it('eases a jump in the gap instead of jumping', () => {
    const shown = new Map<string, ShownRunner>()
    syncRunners(shown, [runner('a', -50)], 1 / 60)
    syncRunners(shown, [runner('a', 0)], 1 / 60)
    const gap = shown.get('a')!.gap
    expect(gap).toBeLessThan(-45)
    for (let i = 0; i < 240; i++) syncRunners(shown, [runner('a', 0)], 1 / 60)
    expect(Math.abs(shown.get('a')!.gap)).toBeLessThan(0.1)
  })

  it('keeps every rival off the centre of the trail, on a steady side', () => {
    for (const id of ['a', 'b', 'rival-1', 'rival-22']) {
      expect(Math.abs(laneOf(id))).toBeGreaterThanOrEqual(0.45)
      expect(laneOf(id)).toBe(laneOf(id))
    }
  })
})

describe('race back view: runner animation', () => {
  it('stands still at speed 0 and swings the arms in opposition when running', () => {
    expect(strideHz(0)).toBe(0)
    const gait = { phase: 0, intensity: 0 }
    for (let i = 0; i < 60; i++) advanceGait(gait, 0, 1 / 60)
    const still = runnerPose(gait.phase, gait.intensity)
    for (const key of ['bob', 'sway', 'roll', 'armL', 'armR'] as const) expect(Math.abs(still[key])).toBe(Math.abs(STANDING[key]))
    expect(still.legL.lift + still.legR.lift).toBe(0)
    const pose = runnerPose(Math.PI / 2, 1)
    expect(pose.armL).toBeCloseTo(-pose.armR)
    expect(pose.legR.lift).toBeGreaterThan(0)
    expect(pose.legL.lift).toBe(0)
  })
})

describe('race back view: simulated race', () => {
  it('adds and removes rivals, and keeps their gaps in range', () => {
    const sim = new RaceSimulation(3, 2)
    expect(sim.ids).toHaveLength(2)
    for (let i = 0; i < 8; i++) sim.add()
    expect(sim.state().runners).toHaveLength(10)
    sim.remove()
    sim.remove('rival-1')
    expect(sim.ids).toHaveLength(8)
    expect(sim.ids).not.toContain('rival-1')
    for (let i = 0; i < 60 * 120; i++) sim.step(1 / 60)
    for (const r of sim.state().runners) {
      expect(r.gapMetros).toBeGreaterThanOrEqual(GAP_MIN)
      expect(r.gapMetros).toBeLessThanOrEqual(GAP_MAX)
    }
  })

  it('holds a rival at the gap the debug slider sets, until it is let go', () => {
    const sim = new RaceSimulation(3, 1)
    const [id] = sim.ids
    sim.setGap(id!, -4)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.gapOf(id!)).toBe(-4)
    sim.setGap(id!, null)
    sim.speed = 6
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.gapOf(id!)).toBeGreaterThan(-4)
  })
})
