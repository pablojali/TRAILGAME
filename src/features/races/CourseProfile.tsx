import { useI18n } from '../../i18n/i18n'
import { raceProfile } from './profile'
import styles from './Races.module.css'

const WIDTH = 300
const HEIGHT = 64

/**
 * The whole course's real profile (owner design, 18 November 2026: from the race's GPX), with the
 * aid stations marked and the lowest and highest points. Nothing for a race without a GPX.
 */
export function CourseProfile({ raceId, drawn = false }: { raceId: string; drawn?: boolean }) {
  const { t, locale } = useI18n()
  const data = raceProfile(raceId)
  // Without a GPX, `drawn` shows the profile drawn from the segments (relative heights, no altitudes).
  if (!data || (!data.real && !drawn)) return null
  const { profile, cutsM, real } = data
  const length = profile[profile.length - 1]![0]
  const ys = profile.map((p) => p[1])
  const low = Math.min(...ys)
  const high = Math.max(...ys)
  const span = Math.max(high - low, 100)
  const x = (m: number) => (m / length) * WIDTH
  const y = (e: number) => HEIGHT - 4 - ((e - low) / span) * (HEIGHT - 14)
  const line = profile.map(([m, e]) => `${x(m).toFixed(1)},${y(e).toFixed(1)}`).join(' ')
  const metres = (value: number) => `${Math.round(value).toLocaleString(locale)} m`
  return (
    <figure className={styles.courseProfile}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={real ? t('races.profile', { low: metres(low), high: metres(high), aid: cutsM.length }) : t('races.aidCount', { n: cutsM.length })}>
        <polygon points={`0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`} />
        <polyline points={line} />
        {cutsM.map((m) => (
          <line key={m} x1={x(m)} x2={x(m)} y1={0} y2={HEIGHT} />
        ))}
      </svg>
      <figcaption aria-hidden="true">
        <span>{real ? `↓ ${metres(low)}` : ''}</span>
        <span>{t('races.aidCount', { n: cutsM.length })}</span>
        <span>{real ? `↑ ${metres(high)}` : ''}</span>
      </figcaption>
    </figure>
  )
}
