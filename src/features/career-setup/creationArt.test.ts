import { describe, expect, it } from 'vitest'
import { getCreationArtUrl } from './creationArt'

describe('getCreationArtUrl', () => {
  it('finds the Climber artwork for both sexes', () => {
    expect(getCreationArtUrl('climber', 'female')).toContain('/creation/female/climber.webp')
    expect(getCreationArtUrl('climber', 'male')).toContain('/creation/male/climber.webp')
  })

  it.each(['sprinter', 'all-rounder', 'endurance'] as const)('has no %s artwork yet (placeholder)', (profile) => {
    expect(getCreationArtUrl(profile, 'female')).toBeNull()
    expect(getCreationArtUrl(profile, 'male')).toBeNull()
  })
})
