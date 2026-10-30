import { ATTRIBUTE_MAX, isAttributeId, roundStat, type AttributeId } from '../domain/athlete/athlete'
import { getEarnedAttributePoints } from '../domain/athlete/levels'
import type { Athlete } from '../domain/athlete/athlete'
import type { GameState } from './gameState'

export function getUnspentAttributePoints(athlete: Athlete): number {
  return getEarnedAttributePoints(athlete.xp) - athlete.spentAttributePoints
}

export type AllocationError =
  | 'no-points'
  | 'attribute-max'
  | 'unknown-attribute'
  /** The request was based on an older state (e.g. a repeated click); nothing was spent. */
  | 'stale-request'

export type AllocationResult = { ok: true; state: GameState } | { ok: false; error: AllocationError }

/**
 * Spends one attribute point on one attribute. `expectedSpent` is the number of points the player
 * saw as already spent; a mismatch means the request is stale and is rejected, so a repeated or
 * duplicated request cannot spend twice.
 */
export function allocateAttributePoint(
  state: GameState,
  attribute: AttributeId,
  expectedSpent: number,
): AllocationResult {
  const { athlete } = state
  if (!isAttributeId(attribute)) return { ok: false, error: 'unknown-attribute' }
  if (expectedSpent !== athlete.spentAttributePoints) return { ok: false, error: 'stale-request' }
  if (getUnspentAttributePoints(athlete) <= 0) return { ok: false, error: 'no-points' }
  if (athlete.attributes[attribute] >= ATTRIBUTE_MAX) return { ok: false, error: 'attribute-max' }

  return {
    ok: true,
    state: {
      ...state,
      athlete: {
        ...athlete,
        attributes: {
          ...athlete.attributes,
          [attribute]: Math.min(ATTRIBUTE_MAX, roundStat(athlete.attributes[attribute] + 1)),
        },
        spentAttributePoints: athlete.spentAttributePoints + 1,
      },
    },
  }
}
