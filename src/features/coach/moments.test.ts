import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../game-engine/gameState'
import { T0 } from '../../test/gameFixtures'
import { currentMoment, MOMENTS, parseCoachMoments } from './moments'

const HEADER = 'moment,step,trigger,after,unless,targets,tap,title,text,title_es,text_es\n'

describe('coach moments table (owner table, 9 November 2026)', () => {
  it('reads the owner table: moments in order, steps, targets, taps and texts with English as fallback', () => {
    expect(MOMENTS.map((m) => m.id)).toEqual(['dashboard', 'training', 'first-week', 'race-list', 'race-prep', 'first-race', 'career'])
    const dashboard = MOMENTS[0]!
    expect(dashboard.trigger).toBe('open-dashboard')
    expect(dashboard.steps.map((s) => [s.targets, s.click])).toEqual([[['attributes'], false], [['condition'], false], [['nav-training', 'go-training'], true]])
    expect(dashboard.steps[0]!.title.es).toBe('Tus atributos')
    const [own] = parseCoachMoments(`${HEADER}hello,1,open-equipment,,,,,Hi,Text,,\n`)
    expect(own!.steps[0]!.title).toMatchObject({ en: 'Hi', es: 'Hi', de: 'Hi' })
  })

  it('refuses what the game could not show', () => {
    const bad = (rows: string) => () => parseCoachMoments(HEADER + rows)
    expect(bad('a,1,never,,,,,T,X,,\n')).toThrow('unknown trigger "never"')
    expect(bad('a,1,open-dashboard,,,shoes,,T,X,,\n')).toThrow('unknown target "shoes"')
    expect(bad('a,1,open-dashboard,,,,yes,T,X,,\n')).toThrow('needs a target')
    expect(bad('a,1,open-dashboard,,,,,T,X,,\na,3,,,,,,T,X,,\n')).toThrow('out of order')
    expect(bad('a,1,open-dashboard,b,,,,T,X,,\n')).toThrow('unknown moment "b"')
    expect(bad('a,1,open-dashboard,,,,,,X,,\n')).toThrow('English title and text')
  })

  it('shows the first moment not seen whose trigger fits, after and unless included; pending never shows', () => {
    const moments = parseCoachMoments(
      `${HEADER}soon,1,pending,,,,,T,X,,\nshop,1,open-equipment,intro,,,,T,X,,\nintro,1,open-equipment,,shop,,,T,X,,\n`,
    )
    const career = (seen: string[]) => ({ ...createInitialGameState('all-rounder', T0, { name: 'A', sex: 'male' }), coach: { welcomeStep: 1, welcomeDone: true, seen } })
    expect(currentMoment(career([]), '/equipment', moments)?.id).toBe('intro')
    expect(currentMoment(career(['intro']), '/equipment', moments)?.id).toBe('shop')
    expect(currentMoment(career(['shop']), '/equipment', moments)).toBeNull()
    expect(currentMoment(career([]), '/', moments)).toBeNull()
  })
})
