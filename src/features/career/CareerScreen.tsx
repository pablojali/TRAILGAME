import { Coins } from '../../components/Coins'
import { useI18n } from '../../i18n/i18n'
import { weekdayShortKey } from '../../i18n/labels'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Card, Meter } from '../../components/Card'
import { MedalIcon } from '../../components/Medal'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { RACE_CATEGORIES } from '../../domain/races/categories'
import { WEEKS_PER_YEAR } from '../../domain/training/calendar'
import { getAchievements, getSeason, type AchievementProgress } from '../../game-engine/achievements'
import {
  getMedalTable,
  getPersonalBests,
  getRaceHistory,
  medalFor,
  type Medal,
  type MedalCount,
} from '../../game-engine/career'
import { ordinal, raceTimeText } from '../races/raceText'
import styles from './CareerScreen.module.css'

const MEDALS: readonly Medal[] = ['gold', 'silver', 'bronze']

type AchievementId = 'first-steps' | 'trail-explorer' | 'first-summit' | 'elite' | 'podium' | 'champion' | 'rising-star' | 'level' | 'dedicated'

const CAREER_TABS = ['achievements', 'medals', 'bests', 'history'] as const

/** Position with its medal, e.g. "🥇 1st of 50". */
function Position({ position, fieldSize }: { position: number; fieldSize?: number }) {
  const medal = medalFor(position)
  const { t, locale } = useI18n()
  return (
    <span className={styles.position}>
      {medal && <MedalIcon medal={medal} />}
      {ordinal(position, locale)}
      {fieldSize !== undefined && <span className={styles.muted}>{t('career.of', { count: fieldSize })}</span>}
    </span>
  )
}

/**
 * Career (owner request, 30 October 2026): the historic medal table, personal bests and every race
 * run, one tab each so the screen fits (`?tab=bests`). Read from the saved race results; nothing
 * here changes the game.
 */
export function CareerScreen() {
  const { state } = useCareer()
  const table = getMedalTable(state)
  const bests = getPersonalBests(state)
  const history = getRaceHistory(state)
  const season = getSeason(state)
  const achievements = getAchievements(state)
  const [params, setParams] = useSearchParams()
  const { t, locale } = useI18n()
  const tabs = CAREER_TABS.map((id) => ({ id, label: t(`career.tab.${id}`) }))
  const tab = CAREER_TABS.find((id) => id === params.get('tab')) ?? 'achievements'

  return (
    <Screen
      title={t('career.title')}
      description={t('career.description')}
      showDescription
    >
      {/* The season in one compact row under the title, then the summit of the picture and the tabs
          (owner requests, 5 November 2026). */}
      <div className={styles.hero} aria-hidden="true" />
      <section className={`${styles.season} ${styles.seasonCompact}`} aria-labelledby="season-title">
        <div className={styles.seasonMain}>
          <h2 id="season-title" className={styles.seasonTitle}>
            {t('career.season', { year: season.year })}
          </h2>
          <Meter
            label={t('career.seasonProgress', { year: season.year })}
            value={season.weekOfYear}
            max={WEEKS_PER_YEAR}
            valueText={t('career.seasonValue', { week: season.weekOfYear, weeks: WEEKS_PER_YEAR })}
            className={styles.seasonMeter}
          />
          <p className={styles.seasonLine}>
            {t('career.seasonLine', {
              week: season.weekOfYear,
              weeks: WEEKS_PER_YEAR,
              races: t('career.races', { count: season.races }),
              medals: t('career.medals', { count: season.medals }),
            })}
          </p>
        </div>
        <div className={styles.rank}>
          <span className={styles.rankBadge} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8l-1-3H9z" />
            </svg>
          </span>
          <span className={styles.rankText}>
            <span className={styles.rankLabel}>{t('career.bestFinish')}</span>
            <span className={styles.rankValue}>{season.bestFinish === null ? '—' : `#${season.bestFinish}`}</span>
          </span>
        </div>
      </section>

      {history.length === 0 && (
        <p className={styles.muted}>
          {t('career.noRaces')} <Link to="/races">{t('career.goToRaces')}</Link>
        </p>
      )}

      <Tabs
        label={t('career.tabs')}
        tabs={tabs}
        value={tab}
        onChange={(next) => setParams(next === 'achievements' ? {} : { tab: next }, { replace: true })}
      >
        <ScrollPanel label={t(`career.tab.${tab}`)}>
          {tab === 'achievements' && (
            <ul className={styles.achievements}>
              {achievements.map((achievement) => (
                <Achievement key={achievement.definition.id} progress={achievement} />
              ))}
            </ul>
          )}
          {tab === 'medals' && (
            <Card title={t('career.medalTable')}>
              <table className={styles.medalTable}>
                <thead>
                  <tr>
                    <th scope="col">{t('career.category')}</th>
                    {MEDALS.map((medal) => (
                      <th scope="col" key={medal} className={styles.num}>
                        <MedalIcon medal={medal} label={t(`medal.${medal}`)} />
                      </th>
                    ))}
                    <th scope="col" className={styles.num}>
                      {t('career.racesCol')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RACE_CATEGORIES.map((category) => (
                    <MedalRow key={category} label={t(`category.${category}`)} count={table.byCategory[category]} />
                  ))}
                </tbody>
                <tfoot>
                  <MedalRow label={t('career.total')} count={table.total} />
                </tfoot>
              </table>
            </Card>
          )}
          {tab === 'bests' && (
            <Card title={t('career.bests')}>
              {bests.length === 0 ? (
                <p className={styles.muted}>{t('career.bestsEmpty')}</p>
              ) : (
                <ul className={styles.list}>
                  {bests.map((best) => (
                    <li key={best.race.id} className={styles.bestRow}>
                      <span className={styles.raceName}>
                        {best.race.name}
                        <span className={styles.muted}>
                          {' '}
                          · {t(`category.${best.race.category}`)} · {t('career.runs', { count: best.runs })}
                        </span>
                      </span>
                      <span className={styles.bestValues}>
                        <Link to={`/races/results/${best.bestPositionEntry.id}`} aria-label={t('career.bestPosition', { race: best.race.name, position: ordinal(best.bestPosition, locale) })}>
                          <Position position={best.bestPosition} />
                        </Link>
                        <Link to={`/races/results/${best.bestTimeEntry.id}`} aria-label={t('career.bestTime', { race: best.race.name, time: raceTimeText(best.bestTimeS) })}>
                          {raceTimeText(best.bestTimeS)}
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
            )}
          </Card>
          )}
          {tab === 'history' && (
            <Card title={t('career.history')}>
              {history.length === 0 ? (
                <p className={styles.muted}>{t('career.historyEmpty')}</p>
              ) : (
                <ul className={styles.list}>
                  {history.map(({ entry, race }) => (
                    <li key={entry.id}>
                      <Link to={`/races/results/${entry.id}`} className={styles.historyRow}>
                        <span className={styles.when}>
                          {t('career.when', { week: entry.result.week, day: t(weekdayShortKey(entry.result.day)) })}
                        </span>
                        <span className={styles.raceName}>{race.name}</span>
                        <Position position={entry.result.position} fieldSize={entry.result.fieldSize} />
                        <span className={styles.time}>{raceTimeText(entry.result.timeS)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
            )}
          </Card>
          )}
        </ScrollPanel>
      </Tabs>
    </Screen>
  )
}

/** Badge pictogram by achievement. */
const ACHIEVEMENT_ICONS: Record<string, string> = {
  'first-steps': 'M5 20V5l9 3-9 3',
  'trail-explorer': 'M12 3l5 7h-3l4 5h-4l3 4H7l3-4H6l4-5H7zM12 19v2',
  'first-summit': 'M3 20l6-10 3 5 3-4 6 9zM9 10l1.5 2.5L12 11',
  elite: 'M4 18l2-10 4 4 2-6 2 6 4-4 2 10z',
  podium: 'M9 13V4h6v9M3 20v-5h6v5M15 20v-7h6v7M9 20v-7h6',
  champion: 'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8l-1-3H9z',
  'rising-star': 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  level: 'M4 20l5-6 4 3 7-10M15 7h5v5',
  dedicated: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z',
}

function Achievement({ progress }: { progress: AchievementProgress }) {
  const { definition, level, target, value, complete, reached } = progress
  const { t, locale } = useI18n()
  const title = t(`achievement.${definition.id as AchievementId}`)
  const number = (n: number) => n.toLocaleString(locale)
  return (
    <li className={`${styles.achievement} ${reached > 0 ? styles.achievementEarned : ''}`}>
      <span className={styles.badge} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d={ACHIEVEMENT_ICONS[definition.id]} />
        </svg>
      </span>
      <span className={styles.achievementText}>
        <span className={styles.achievementTitle}>{title}</span>
        <span className={styles.achievementLevel}>
          {t('career.level', { level })}
          {complete && t('career.complete')}
          {/* What the level pays (owner request, 5 November 2026). */}
          {(progress.reward.coins > 0 || progress.reward.xp > 0) && (
            <span className={styles.achievementReward}>
              <span className={styles.srOnly}>{t('career.reward')}: </span>
              {progress.reward.coins > 0 && <Coins amount={progress.reward.coins} />}
              {progress.reward.xp > 0 && <span className={styles.rewardXp}>+{number(progress.reward.xp)} XP</span>}
            </span>
          )}
        </span>
        <span className={styles.muted}>{t(`achievement.desc.${definition.id as AchievementId}`, { count: target })}</span>
        <Meter
          label={t('career.meter', { title, level })}
          value={value}
          max={target}
          valueText={t('career.meterValue', { value: number(value), target: number(target) })}
          className={styles.achievementMeter}
        />
      </span>
      <span className={styles.achievementCount}>
        {complete && (
          <span className={styles.check} aria-label={t('career.completeLabel')}>
            ✓
          </span>
        )}
        <span aria-hidden="true">
          {number(value)}/{number(target)}
        </span>
      </span>
    </li>
  )
}

function MedalRow({ label, count }: { label: string; count: MedalCount }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {MEDALS.map((medal) => (
        <td key={medal} className={styles.num}>
          {count[medal]}
        </td>
      ))}
      <td className={`${styles.num} ${styles.muted}`}>{count.races}</td>
    </tr>
  )
}
