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
