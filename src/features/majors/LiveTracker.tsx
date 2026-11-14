import { useMemo } from 'react'
import { getRace } from '../../domain/races/races'
import { checkpointShares, liveStandings, LIVE_CHECKPOINTS, majorField } from '../../game-engine/majorRace'
import { useI18n } from '../../i18n/i18n'
import type { LiveRace as LiveRaceView } from '../../server/majorOps'
import { durationText } from '../races/raceText'
import styles from './Majors.module.css'

const WIDTH = 100
const HEIGHT = 34

/**
 * The live tracking of a running Major segment (owner request, 14 November 2026): the segment's
 * profile with its checkpoints, how many runners are at each one and where the player is, and the
 * live top 5 with the player's place. The server ran the segment when it started and sends each
 * runner's departure and arrival; the race is revealed one checkpoint at a time over the running
 * phase, so nothing is asked of the server between checkpoints. At the last checkpoint the order is
 * the official one.
 */
export function LiveTracker({ race, raceId, ends, now }: { race: LiveRaceView; raceId: string; ends: number; now: number }) {
  const { t } = useI18n()
  const segment = useMemo(() => {
    const course = getRace(raceId)
    return course ? (majorField(course).segments[race.category.segment] ?? null) : null
  }, [raceId, race.category.segment])
  const shares = useMemo(() => (segment ? checkpointShares(segment.pieces) : []), [segment])
  if (!segment || race.live.length === 0 || shares.length === 0) return null

  const length = race.runningS * 1000
  const share = Math.min(1, Math.max(0, 1 - (ends - now) / length))
  const step = Math.min(LIVE_CHECKPOINTS, Math.floor(share * LIVE_CHECKPOINTS + 1e-9))
  const rows = liveStandings(race.live, shares, step)
  const before = step > 0 ? liveStandings(race.live, shares, step - 1) : rows
  const bySlot = new Map(race.live.map((r) => [r.slot, r]))
  const mine = rows.find((r) => bySlot.get(r.slot)?.me)
  const minePrevious = mine && before.find((r) => r.slot === mine.slot)
  const change = mine && minePrevious ? minePrevious.position - mine.position : 0
  const leader = rows[0]!
  const km = (distanceShare: number) => ((segment.startM + distanceShare * segment.distanceM) / 1000).toFixed(1)

  // The profile: the pieces' climbs and descents, the checkpoints along it.
  const points: [number, number][] = [[0, 0]]
  let x = 0
  let y = 0
  for (const { block } of segment.pieces) {
    x += block.lengthM
    y += block.gainM - block.lossM
    points.push([x, y])
  }
  const ys = points.map((p) => p[1])
  const low = Math.min(...ys)
  const span = Math.max(Math.max(...ys) - low, 150)
  const heightAt = (metres: number) => {
    let i = 1
    while (i < points.length - 1 && points[i]![0] < metres) i++
    const [x0, y0] = points[i - 1]!
    const [x1, y1] = points[i]!
    const k = x1 > x0 ? (metres - x0) / (x1 - x0) : 0
    return y0 + (y1 - y0) * Math.min(1, Math.max(0, k))
  }
  const toX = (distanceShare: number) => distanceShare * WIDTH
  const toY = (elevation: number) => HEIGHT - 4 - ((elevation - low) / span) * (HEIGHT - 12)
  const line = points.map(([px, py]) => `${toX(px / Math.max(x, 1)).toFixed(1)},${toY(py).toFixed(1)}`).join(' ')
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.checkpoint, (counts.get(row.checkpoint) ?? 0) + 1)
  const marks = [0, ...shares.map((c) => c.distanceShare)]

  const gap = (row: (typeof rows)[number]) => {
    if (row.slot === leader.slot) return t('major.live.tracker.leader')
    if (row.checkpoint === leader.checkpoint && row.passedAtS !== null && leader.passedAtS !== null) return `+${durationText(row.passedAtS - leader.passedAtS)}`
    const behind = leader.checkpoint - row.checkpoint
    return behind === 1 ? t('major.live.tracker.behindOne') : t('major.live.tracker.behind', { n: behind })
  }

  return (
    <section className={styles.tracker} aria-label={t('major.live.tracker.title', { n: step, total: LIVE_CHECKPOINTS })}>
      <div className={styles.trackerHead}>
        <strong>{t('major.live.tracker.title', { n: step, total: LIVE_CHECKPOINTS })}</strong>
        <span>{t('major.live.tracker.km', { km: km(leader.distanceShare) })}</span>
      </div>
      <svg className={styles.trackerProfile} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon points={`0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`} />
        <polyline points={line} />
        {marks.map((m, i) => (
          <line key={i} className={i <= step ? styles.markPassed : styles.mark} x1={toX(m)} x2={toX(m)} y1={0} y2={HEIGHT} />
        ))}
      </svg>
      {/* Runners at each checkpoint, and the player's pin, over the profile. */}
      <div className={styles.trackerDots} aria-hidden="true">
        {marks.map((m, i) => {
          const n = counts.get(i) ?? 0
          if (!n) return null
          const top = (toY(heightAt(m * segment.distanceM)) / HEIGHT) * 100
          return (
            <span key={i} className={styles.dotGroup} style={{ left: `${toX(m)}%`, top: `${top}%` }}>
              {n}
            </span>
          )
        })}
        {mine && (
          <span className={styles.dotMe} style={{ left: `${toX(mine.distanceShare)}%` }}>
            {t('major.live.you')}
          </span>
        )}
      </div>
      <div className={styles.trackerBox}>
        <ol className={styles.trackerTop}>
          {rows.slice(0, 5).map((row) => {
            const runner = bySlot.get(row.slot)!
            return (
              <li key={row.slot} aria-current={runner.me || undefined}>
                <span className={styles.pos}>{row.position}</span>
                <span className={styles.who}>{runner.name}</span>
                <span className={styles.gap}>{gap(row)}</span>
              </li>
            )
          })}
        </ol>
        {mine && (
          <p className={styles.trackerMe}>
            <span>
              {t('major.live.you')}: <b>{mine.position}º</b> / {rows.length}
            </span>
            {change !== 0 && (
              <span className={change > 0 ? styles.positionUp : styles.positionDown}>
                {change > 0 ? `▲ +${change}` : `▼ ${change}`}
              </span>
            )}
            <span>{t('major.live.tracker.km', { km: km(mine.distanceShare) })}</span>
          </p>
        )}
      </div>
    </section>
  )
}
