import { describe, expect, it } from 'vitest'
import { artUrl } from './assets'
import { backLayers, drawnFrames, frameArt, strideFrames, topRow } from './backSprites'
import { depthAlpha, FAR_Z, gapToZ, makeCamera, NEAR_Z, PLAYER_Z, project, RUNNER_HEIGHT } from './projection'
import { advanceGait, frameIndex, runnerPose, STANDING, strideAt, strideHz } from './runnerRig'
import { GAP_MAX, GAP_MIN, PLAYER_APPEARANCE, RaceSimulation } from './simulation'
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

  it('frames the player with the head where asked and the bottom edge cutting the legs', () => {
    const framing = { headTop: 0.7, cutAt: 0.55 }
    const cam = makeCamera(400, 800, framing)
    expect(project(cam, 0, cam.playerZ, RUNNER_HEIGHT).y).toBeCloseTo(0.7 * 800)
    expect(project(cam, 0, cam.playerZ, 0.55).y).toBeCloseTo(800)
    // A bigger runner on screen means a closer player.
    expect(makeCamera(400, 800, { headTop: 0.5, cutAt: 0.55 }).playerZ).toBeLessThan(cam.playerZ)
    expect(gapToZ(-10, cam.playerZ)).toBe(cam.playerZ + 10)
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

describe('race back view: runner art', () => {
  const files = new Set(['runner/bodies/men_body_tone2_f1', 'runner/bodies/men_body_tone2_f2', 'runner/clothing/lvl1_women_shirt', 'runner/heads/lvl1_men_head_tone2'])
  const has = (key: string) => files.has(key)

  it('shares the stride evenly among the frames, in order, and shows the fists at the waist when standing', () => {
    const quarter = Math.PI / 2
    expect([1, 2, 3, 4].map((q) => frameIndex(strideAt(q * quarter), 4))).toEqual([0, 1, 2, 3])
    expect([0, 1, 2, 3, 4, 5].map((n) => frameIndex(n / 6, 6))).toEqual([0, 1, 2, 3, 4, 5])
    expect(runnerPose(quarter, 1).stride).toBeCloseTo(0)
    expect(runnerPose(quarter, 0).stride).toBeNull()
    expect(frameIndex(null, 4)).toBe(1)
    expect(frameIndex(null, 6)).toBe(2)
    expect(frameIndex(0.7, 1)).toBe(0)
  })

  it('mirrors a half stride of 2 or 3 drawn frames, and uses 4 or more as the whole stride', () => {
    const body = 'runner/bodies/men_body_tone2'
    expect(drawnFrames(body, has)).toBe(2)
    expect(strideFrames(2)).toBe(4)
    expect(strideFrames(3)).toBe(6)
    expect(strideFrames(4)).toBe(4)
    expect(strideFrames(0)).toBe(1)
    expect(frameArt(body, 0, 4, has)).toEqual({ key: `${body}_f1`, mirror: false })
    expect(frameArt(body, 1, 4, has)).toEqual({ key: `${body}_f2`, mirror: false })
    expect(frameArt(body, 2, 4, has)).toEqual({ key: `${body}_f1`, mirror: true })
    expect(frameArt(body, 3, 4, has)).toEqual({ key: `${body}_f2`, mirror: true })
    const three = (key: string) => /_f[123]$/.test(key)
    expect([3, 4, 5].map((f) => frameArt('b', f, 6, three))).toEqual([1, 2, 3].map((n) => ({ key: `b_f${n}`, mirror: true })))
    expect(frameArt('runner/clothing/lvl1_women_shirt', 3, 4, has)).toEqual({ key: 'runner/clothing/lvl1_women_shirt', mirror: false })
    expect(frameArt('runner/clothing/none', 0, 4, has)).toBeNull()
  })

  it('draws the shoes over the body and under the shirt, one picture per frame, mirrored like the body', () => {
    const files = new Set(['runner/bodies/women_body_tone1_f1', 'runner/footwear/lvl1_women_shoes_f1', 'runner/footwear/lvl1_women_shoes_f2', 'runner/clothing/lvl2_women_shirt_f1'])
    const has = (key: string) => files.has(key)
    const look = { sex: 'women' as const, skin: 'tone-1', hair: 'none', shirt: 'lvl2_women_shirt', shorts: 'black', shoes: 'lvl1_women_shoes', pack: null }
    expect(backLayers(look, has)).toEqual(['runner/bodies/women_body_tone1', 'runner/footwear/lvl1_women_shoes', 'runner/clothing/lvl2_women_shirt'])
    expect(frameArt('runner/footwear/lvl1_women_shoes', 2, 4, has)).toEqual({ key: 'runner/footwear/lvl1_women_shoes_f1', mirror: true })
  })

  it('stacks body, shirt, pack and hair, lends another tone while one has no body, and leaves out what has no art', () => {
    const look = { sex: 'men' as const, skin: 'tone-4', hair: 'lvl1_men_head_tone2', shirt: 'lvl1_women_shirt', shorts: 'black', shoes: 'grey', pack: 'lvl1_men_back' }
    expect(backLayers(look, has)).toEqual(['runner/bodies/men_body_tone2', 'runner/clothing/lvl1_women_shirt', 'runner/heads/lvl1_men_head_tone2'])
    expect(backLayers({ ...look, sex: 'women' }, has)?.[0]).toBe('runner/bodies/men_body_tone2')
    expect(backLayers(look, () => false)).toBeNull()
  })

  it('finds the top of the head as the first row with an opaque pixel', () => {
    const width = 3
    const height = 4
    const data = new Uint8ClampedArray(width * height * 4)
    expect(topRow(data, width, height)).toBe(-1)
    data[(2 * width + 1) * 4 + 3] = 255
    data[(3 * width + 0) * 4 + 3] = 255
    expect(topRow(data, width, height)).toBe(2)
  })

  it('bounces lowest when the heel is up (frame 1) and highest in between', () => {
    expect(runnerPose(Math.PI / 2, 1).bob).toBeCloseTo(0)
    expect(runnerPose(Math.PI, 1).bob).toBeGreaterThan(0.04)
  })

  it('reads the owner\'s three drawn frames as a stride of six', () => {
    for (const tone of [1, 2, 3, 4]) expect(strideFrames(drawnFrames(`runner/bodies/men_body_tone${tone}`, (key) => artUrl(key) !== undefined))).toBe(6)
  })

  it('finds the owner\'s first body in the art folder', () => {
    expect(backLayers({ sex: 'men', skin: 'tone-2', hair: 'natural', shirt: 'none', shorts: 'black', shoes: 'grey', pack: null })).toEqual(['runner/bodies/men_body_tone2'])
    expect(backLayers(PLAYER_APPEARANCE)).toEqual(['runner/bodies/men_body_tone3', 'runner/clothing/lvl3_men_shirt', 'runner/heads/lvl1_men_head_tone3'])
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

  it('starts with the whole cast: one rival for each sex and skin tone, all close ahead', () => {
    const runners = new RaceSimulation().state().runners
    expect(runners).toHaveLength(8)
    expect(new Set(runners.map((r) => `${r.appearance.sex}-${r.appearance.skin}`)).size).toBe(8)
    for (const r of runners) {
      expect(r.gapMetros).toBeLessThan(0)
      expect(r.gapMetros).toBeGreaterThan(-45)
    }
    const woman = runners.find((r) => r.appearance.sex === 'women')!
    expect(backLayers(woman.appearance)).toContain('runner/footwear/lvl1_women_shoes')
  })

  it('runs a mixed field: half the rivals are women, each in the tank top of their sex', () => {
    const sim = new RaceSimulation(3, 4)
    const looks = sim.state().runners.map((r) => r.appearance)
    expect(looks.map((l) => l.sex)).toEqual(['men', 'women', 'men', 'women'])
    for (const look of looks) {
      const layers = backLayers(look)
      expect(layers?.[0]).toBe(`runner/bodies/${look.sex}_body_${look.skin.replace('-', '')}`)
      expect(layers).toContain(`runner/clothing/lvl${look.sex === 'women' ? '2_women' : '3_men'}_shirt`)
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
