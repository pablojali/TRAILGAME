/** A save exactly as written by M1 (schema v1), used to test incompatible-save handling. */
export const M1_SAVE = JSON.stringify({
  schemaVersion: 1,
  savedAt: '2026-10-27T19:00:00.000Z',
  state: {
    athlete: {
      name: 'Demo Runner',
      archetype: 'all-rounder',
      xp: 28,
      fitness: 58,
      fatigue: 29,
      attributes: { endurance: 50, speed: 50, power: 50, technique: 50, strength: 50, recovery: 50 },
    },
    week: {
      number: 1,
      currentDayIndex: 2,
      days: [
        { day: 1, session: 'easy-run', outcome: { xpGained: 10, fitnessChange: 3, fatigueChange: 5 } },
        { day: 2, session: 'intervals', outcome: { xpGained: 18, fitnessChange: 5, fatigueChange: 14 } },
        { day: 3, session: 'strength', outcome: null },
        { day: 4, session: 'rest', outcome: null },
        { day: 5, session: 'hills', outcome: null },
        { day: 6, session: 'long-run', outcome: null },
        { day: 7, session: 'rest', outcome: null },
      ],
    },
  },
})
