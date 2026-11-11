import { getAttributePointsBetween, getLevel } from '../domain/athlete/levels'
import { roundStat } from '../domain/athlete/athlete'
import { GROSS_PRIZES, RACE_MIN_XP, RACE_XP_BAND_PCT, RACE_XP_BASE } from '../domain/races/categories'
import { getRace, type Race } from '../domain/races/races'
import { rankingPoints, rankingSeason } from '../domain/ranking/ranking'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../domain/training/injury'
import { applyAchievementRewards, type AchievementEarned } from './achievements'
import type { FinishedRaceEntry, GameState, RaceResult } from './gameState'
import { getRaceField, getReferenceFinishS, type Nutrition, type RaceSplit } from './raceEngine'
import { getPrizeBand } from './races'
import { explainRace } from './raceSimulation'
import { statChange } from './training'

/**
 * Sunday Major results in the career (phase 5; owner decisions of 10 November 2026, §8.1, §8.2,
 * §8.7 and §9.3 of docs/MAJOR_PHASE0_AUDIT.md).
 *
 * - The Major is outside the career's calendar: no game day is used, the week does not move on.
 * - Coins and XP: the course's prize table by finishing position, with no level multiplier.
 * - Fatigue: the in-race fatigue at the finish minus the Fatigue the runner started with, added to
 *   the career's Fatigue now; above the injury threshold, the usual injury (Fitness lost and forced
 *   Rest days).
 * - The gel and bar taken are removed from the stock.
 * - Ranking: the course's points for the position with the Major's ×1.5 (`competition,major` in
 *   ranking_points.csv), in the season of the race's finish. The finished entry carries the ranking
 *   fields, so the database records it in `ranking_results` like any race.
 * - History: the result is a finished race entry (`major` set), shown with the other races.
 *
 * The orchestrator never writes careers: it leaves a reward per player (`major_rewards`) and
 * `career-ops` applies it here at the player's next request. Applying it twice changes nothing:
 * the entry's id is the event's.
 */
export interface MajorRewardPayload {
  eventId: string
  eventName: string
  raceId: string
  position: number
  fieldSize: number
  /** Whole seconds. */
  timeS: number
  /** Epoch ms: the official start and finish (the ranking season is the finish's). */
  startedAt: number
  finishedAt: number
  /** The READY snapshot. */
  levelAtStart: number
  attributes: Record<string, number>
  fitness: number
  fatigue: number
  equipment: string[]
  dayForm: number
  /** In-race fatigue at the finish. */
  finishFatigue: number
  splits: RaceSplit[]
  nutrition: Nutrition
  /** The other runners' times, whole seconds, fastest first. */
  rivalTimesS: number[]
}

export interface MajorPrize {
  band: number
  grossPrize: number
  coins: number
  xp: number
  rankingPoints: number
}

/** Coins, XP and ranking points of a finishing position (no level multiplier, ranking ×1.5). */
export function majorPrize(race: Race, position: number): MajorPrize {
  const band = getPrizeBand(position)
  const grossPrize = GROSS_PRIZES[race.category][band]!
  return {
    band,
    grossPrize,
    coins: grossPrize,
    xp: Math.max(RACE_MIN_XP, Math.floor((RACE_XP_BASE[race.category] * RACE_XP_BAND_PCT[band]!) / 100)),
    rankingPoints: rankingPoints(race.id, position, 'major'),
  }
}

/** The career entry id of a Major (one per event). */
export function majorEntryId(eventId: string): string {
  return `major-${eventId}`
}

export interface MajorRewardApplied {
  state: GameState
  entry: FinishedRaceEntry
  achievementsEarned: AchievementEarned[]
  levelBefore: number
  levelAfter: number
  attributePointsAwarded: number
}

/** Applies a Major's result to the career; null if it is already there (or the course is unknown). */
export function applyMajorReward(state: GameState, payload: MajorRewardPayload): MajorRewardApplied | null {
  const id = majorEntryId(payload.eventId)
  if (state.raceEntries.some((entry) => entry.id === id)) return null
  const race = getRace(payload.raceId)
  if (!race) return null
  const prize = majorPrize(race, payload.position)
  const athlete = state.athlete
  const fatigueChange = statChange(athlete.fatigue, roundStat(payload.finishFatigue - payload.fatigue))
  const injured = athlete.fatigue + fatigueChange > INJURY_FATIGUE_THRESHOLD
  const fitnessChange = injured ? statChange(athlete.fitness, -INJURY_FITNESS_LOSS) : 0
  const xpAwarded = injured ? RACE_MIN_XP : prize.xp
  const input = { attributes: payload.attributes as RaceResult['attributes'], fitness: payload.fitness, fatigue: payload.fatigue, equipment: payload.equipment }
  const field = getRaceField(race)
  const referenceTimeS = getReferenceFinishS(race, field)
  const explanation = explainRace(race, input, payload.dayForm)
  const season = rankingSeason(payload.finishedAt)
  const day = state.week.currentDayIndex + 1

  const result: RaceResult = {
    startedAt: payload.startedAt,
    week: state.week.number,
    day,
    levelAtStart: payload.levelAtStart,
    attributes: input.attributes,
    fitness: payload.fitness,
    fatigue: payload.fatigue,
    equipment: [...payload.equipment],
    dayForm: payload.dayForm,
    timeS: payload.timeS,
    position: payload.position,
    fieldSize: payload.fieldSize,
    band: prize.band,
    grossPrize: prize.grossPrize,
    multiplierPct: 100,
    coinsAwarded: prize.coins,
    xpAwarded,
    netCoins: prize.coins,
    fatigueChange,
    fitnessChange,
    injured,
    referenceTimeS,
    gapS: payload.timeS - referenceTimeS,
    factors: explanation.factors.map((f) => ({ ...f, effectS: Math.round(f.effectS * field.timeScale) })),
    rivalTimesS: [...payload.rivalTimesS],
    splits: payload.splits.map((split) => ({ ...split })),
    nutrition: { ...payload.nutrition },
    ...(season >= 1 ? { rankingSeason: season, rankingPoints: prize.rankingPoints, rankingAt: payload.finishedAt } : {}),
  }
  const entry: FinishedRaceEntry = {
    id,
    raceId: race.id,
    entryType: 'free',
    feePaid: 0,
    levelAtEntry: payload.levelAtStart,
    enteredAt: payload.startedAt,
    major: { eventId: payload.eventId, name: payload.eventName },
    status: 'finished',
    result,
  }
  const levelBefore = getLevel(athlete.xp)
  const rewarded = applyAchievementRewards({
    ...state,
    coins: state.coins + prize.coins,
    consumables: {
      gel: Math.max(0, state.consumables.gel - (payload.nutrition.gel ? 1 : 0)),
      bar: Math.max(0, state.consumables.bar - (payload.nutrition.bar ? 1 : 0)),
    },
    forcedRestDays: injured ? Math.max(state.forcedRestDays, INJURY_REST_DAYS) : state.forcedRestDays,
    athlete: {
      ...athlete,
      xp: athlete.xp + xpAwarded,
      fatigue: roundStat(athlete.fatigue + fatigueChange),
      fitness: roundStat(athlete.fitness + fitnessChange),
    },
    raceEntries: [...state.raceEntries, entry],
  })
  const levelAfter = getLevel(rewarded.state.athlete.xp)
  return {
    state: rewarded.state,
    entry,
    achievementsEarned: rewarded.earned,
    levelBefore,
    levelAfter,
    attributePointsAwarded: getAttributePointsBetween(levelBefore, levelAfter),
  }
}
