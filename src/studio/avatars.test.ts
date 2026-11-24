import { describe, expect, it } from 'vitest'
import { incomingName, INCOMING } from './avatarFiles'

describe('Trail Studio avatar uploads', () => {
  it('names uploaded art safely, as PNG, in the incoming folder CI does not read', () => {
    expect(incomingName('Cara Mujer Pelo Rizado (2).PNG')).toBe('cara_mujer_pelo_rizado_2.png')
    expect(incomingName('lvl3_men_head_02_tone4.png')).toBe('lvl3_men_head_02_tone4.png')
    expect(incomingName('Ñandú.png')).toBe('nandu.png')
    expect(incomingName('.png')).toBe('imagen.png')
    expect(INCOMING).toBe('assets/runner/incoming')
  })
})

describe('Trail Studio: heads in the game', () => {
  it('groups the head art by design, with every tone and closed-eyes face, men first then by level', async () => {
    const { headGroups } = await import('./avatarFiles')
    const file = (name: string) => ({ name, path: `assets/runner/heads/${name}`, url: `blob:${name}` })
    const groups = headGroups([
      file('lvl2_women_head_01_tone1.png'),
      file('lvl1_men_head_01_tone2.png'),
      file('lvl1_men_head_01_tone1.png'),
      file('lvl1_men_head_01_tone1_blink.png'),
      file('README.md'),
      file('lvl1_women_head_01_tone1.png'),
    ])
    expect(groups.map((g) => g.key)).toEqual(['lvl1_men_head_01', 'lvl1_women_head_01', 'lvl2_women_head_01'])
    expect(groups[0]!.files.map((f) => f.name).sort()).toEqual(['lvl1_men_head_01_tone1.png', 'lvl1_men_head_01_tone1_blink.png', 'lvl1_men_head_01_tone2.png'])
    expect(groups[2]).toMatchObject({ sex: 'women', level: 2, design: '01' })
  })
})
