import type { Translate } from '../../i18n/i18n'
import type { RaceSegment } from '../../game-engine/raceEngine'
import { segmentKind } from './aidStation'

/** "+95 m D+ · 2.4% average gradient", "−95 m D− · Technical descent" or "+40 / −60 m". */
export function courseDetail(segment: RaceSegment, t: Translate, locale: string): string {
  const gain = Math.round(segment.gainM)
  const loss = Math.round(segment.lossM)
  const kind = segmentKind(segment)
  if (kind === 'climb') {
    const grade = (Math.round((segment.gainM / segment.distanceM) * 1000) / 10).toLocaleString(locale)
    return t('raceRun.segmentClimb', { gain, grade: `${grade}%` })
  }
  if (kind === 'technical-descent') return t('raceRun.segmentTechnical', { loss })
  if (kind === 'descent') return t('raceRun.segmentDescent', { loss })
  return t('raceRun.segmentMixed', { gain, loss })
}
