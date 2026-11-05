import { describe, expect, it, vi } from 'vitest'

// A table of its own (the shared test copy gives no rewards), loaded with fresh modules.
vi.resetModules()
vi.doMock('../data/achievements.csv?raw', () => ({
  default: [
    'achievement,level,target,coins,xp',
    'first-steps,1,1,20,50',
    'first-steps,2,2,40,100',
    ...['trail-explorer', 'first-summit', 'elite', 'podium', 'champion'].map((id) => `${id},1,1,0,0`),
    'rising-star,1,100000,5,0',
    'level,1,40,5,0',
    'dedicated,1,50,5,0',
  ].join('\n'),
}))
const { parseGameState } = await import('../repositories/gameRepository')
const { newGame, onSunday, T0, withAthlete, withEntry } = await import('../test/gameFixtures')
const { applyAchievementRewards, getActiveChallenge, parseAchievementTable } = await import('./achievements')
const { raceCurrentDay } = await import('./races')

describe('achievement rewards (owner request, 5 November 2026)', () => {
  it('pays the coins and XP of a level once, when it is reached', () => {
    const entered = withEntry(withAthlete(newGame(), { xp: 1000 }), 'RACE-001', 0)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0)
    if (!raced.ok) throw new Error(raced.error)
    const { state, entry, achievementsEarned } = raced.value
    expect(achievementsEarned).toContainEqual({ id: 'first-steps', level: 1, coins: 20, xp: 50 })
    expect(state.achievementLevelsRewarded['first-steps']).toBe(1)
    const coinsWithout = entered.state.coins + entry.result.coinsAwarded
    expect(state.coins).toBe(coinsWithout + achievementsEarned.reduce((sum, e) => sum + e.coins, 0))
    // Nothing new: nothing paid again.
    expect(applyAchievementRewards(state).earned).toEqual([])
  })

  it('credits the levels a career saved before rewards had already reached, without paying them', () => {
    const entered = withEntry(withAthlete(newGame(), { xp: 1000 }), 'RACE-001', 0)
    const raced = raceCurrentDay(onSunday(entered.state), { week: 1, dayIndex: 6 }, entered.entry.id, T0)
    if (!raced.ok) throw new Error(raced.error)
    const old = JSON.parse(JSON.stringify(raced.value.state))
    delete old.achievementLevelsRewarded
    const loaded = parseGameState(old, T0)!
    expect(loaded.achievementLevelsRewarded['first-steps']).toBe(1)
    expect(applyAchievementRewards(loaded).earned).toEqual([])
    expect(parseGameState({ ...old, achievementLevelsRewarded: { 'first-steps': -1 } }, T0)).toBeNull()
  })

  it('shows as active challenge the unfinished achievement closest to its next level', () => {
    const state = withAthlete(newGame(), { xp: 99_000 })
    // Rising Star: 99,000 of 100,000 XP.
    expect(getActiveChallenge(state)?.definition.id).toBe('rising-star')
    expect(getActiveChallenge(state)?.reward).toEqual({ coins: 5, xp: 0 })
  })

  it('checks the table: known achievements, levels in order, rising targets', () => {
    expect(() => parseAchievementTable('achievement,level,target,coins,xp\nnope,1,1,0,0')).toThrow(/unknown/)
    expect(() => parseAchievementTable('achievement,level,target,coins,xp\nfirst-steps,2,1,0,0')).toThrow(/order/)
  })
})
