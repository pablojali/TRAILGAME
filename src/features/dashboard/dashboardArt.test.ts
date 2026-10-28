import { describe, expect, it } from 'vitest'
import { resolveDashboardArt } from './dashboardArt'

const manifest = {
  '/assets/runner/dashboard/female/body.webp': 'female-body.webp',
  '/assets/runner/dashboard/female/equipment/shoes.png': 'female-shoes.png',
  '/assets/runner/dashboard/female/equipment/vest.webp': 'female-vest.webp',
  '/assets/runner/dashboard/male/body.png': 'male-body.png',
}

describe('resolveDashboardArt', () => {
  it('uses the base body only when no equipment is worn', () => {
    expect(resolveDashboardArt('female', [], manifest)).toEqual({ body: 'female-body.webp', layers: [] })
  })

  it('stacks equipment layers in the given order and skips items without artwork', () => {
    expect(resolveDashboardArt('female', ['shoes', 'poles', 'vest'], manifest)).toEqual({
      body: 'female-body.webp',
      layers: [
        { id: 'shoes', url: 'female-shoes.png' },
        { id: 'vest', url: 'female-vest.webp' },
      ],
    })
  })

  it('uses the set for the runner sex', () => {
    expect(resolveDashboardArt('male', ['shoes'], manifest)).toEqual({ body: 'male-body.png', layers: [] })
  })

  it('returns no body when the artwork does not exist yet (placeholder)', () => {
    expect(resolveDashboardArt('female', [], {})).toEqual({ body: null, layers: [] })
  })

  it('has no dashboard artwork in the repository yet', () => {
    expect(resolveDashboardArt('female', []).body).toBeNull()
    expect(resolveDashboardArt('male', []).body).toBeNull()
  })
})
