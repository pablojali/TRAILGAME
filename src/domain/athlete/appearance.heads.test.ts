import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Head rules (level locks, tones without art, sex) need heads above Level 1 and heads missing in
 * some tones. The owner's current art has one head (30 October 2026), so these tests use the
 * earlier catalog of 11 heads. The test setup already loaded the real catalog, so the modules are
 * loaded again with the mock.
 */
vi.doMock('./heads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./heads')>()
  const heads = actual.buildHeadCatalog([
    'lvl1_men_head_01_tone1',
    'lvl1_men_head_01_tone2',
    'lvl1_men_head_01_tone3',
    'lvl1_women_head_03_tone2',
    'lvl1_women_head_03_tone3',
    'lvl1_women_head_05_tone3',
    'lvl2_women_head_01_tone2',
    'lvl2_women_head_01_tone3',
    'lvl2_women_head_02_tone2',
    'lvl2_women_head_02_tone3',
    'lvl2_women_head_03_tone3',
  ])
  const getHead = (sex: string, id: string) => heads.find((h) => h.sex === sex && h.id === id)
  return {
    ...actual,
    HEADS: heads,
    getHead,
    headFile: (sex: string, id: string, tone: number) => getHead(sex, id)?.files[tone],
  }
})

let appearance: typeof import('./appearance')
let engine: typeof import('../../game-engine/appearance')
let fixtures: typeof import('../../test/gameFixtures')

beforeAll(async () => {
  vi.resetModules()
  appearance = await import('./appearance')
  engine = await import('../../game-engine/appearance')
  fixtures = await import('../../test/gameFixtures')
})

describe('appearance — head rules (earlier 11-head catalog)', () => {
  it('offers the heads drawn for the skin tone, with their unlock level', () => {
    const { appearanceUnlocks, hairStyles, hairUnlockLevel, isAppearanceUnlocked } = appearance
    expect(hairStyles('female', 'tone-3')).toEqual([
      'natural',
      'head-l1-03',
      'head-l1-05',
      'head-l2-01',
      'head-l2-02',
      'head-l2-03',
    ])
    expect(hairStyles('female', 'tone-2')).toEqual(['natural', 'head-l1-03', 'head-l2-01', 'head-l2-02'])
    expect(hairStyles('female', 'tone-1')).toEqual(['natural'])
    expect(hairStyles('male', 'tone-1')).toEqual(['natural', 'head-l1-01'])
    expect(hairStyles('male', 'tone-4')).toEqual(['natural'])
    expect(hairUnlockLevel('female', 'head-l2-01')).toBe(2)
    expect(hairUnlockLevel('female', 'natural')).toBe(1)
    expect(isAppearanceUnlocked({ hair: 'head-l2-01', skin: 'tone-2', outfit: 'none' }, 1, 'female')).toBe(false)
    expect(isAppearanceUnlocked({ hair: 'head-l2-01', skin: 'tone-2', outfit: 'none' }, 2, 'female')).toBe(true)
    expect(appearanceUnlocks(1, 2, 'female', 'tone-2')).toEqual(['Hairstyle 3', 'Hairstyle 4', 'Red T-shirt'])
  })

  it('falls back to the basic head when the head has no art in the new skin tone or sex', () => {
    const { appearanceForSex, parseAppearance } = appearance
    // Hairstyle 2 (head-l1-05) is drawn in tone 3 only.
    expect(appearanceForSex({ hair: 'head-l1-05', skin: 'tone-3', outfit: 'none' }, 'female').hair).toBe('head-l1-05')
    expect(appearanceForSex({ hair: 'head-l1-05', skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('natural')
    expect(appearanceForSex({ hair: 'head-l1-03', skin: 'tone-2', outfit: 'none' }, 'male').hair).toBe('natural')
    expect(parseAppearance({ hair: 'head-l2-02', skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('head-l2-02')
    expect(parseAppearance({ hair: 'head-l9-99', skin: 'tone-2', outfit: 'none' }, 'female').hair).toBe('natural')
  })

  it('refuses a head above the runner level, or one with no art in the runner skin tone', () => {
    const { setAppearance } = engine
    const { newGame, withAthlete } = fixtures
    const female = newGame() // Women, tone 2.
    expect(setAppearance(female, { hair: 'head-l2-01', skin: 'tone-2', outfit: 'none' })).toEqual({
      ok: false,
      error: 'locked',
    })
    expect(setAppearance(withAthlete(female, { xp: 100 }), { hair: 'head-l2-01', skin: 'tone-2', outfit: 'none' }).ok).toBe(true)
    // Hairstyle 2 (head-l1-05) is drawn in tone 3 only.
    expect(setAppearance(female, { hair: 'head-l1-05', skin: 'tone-2', outfit: 'none' })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })
})
