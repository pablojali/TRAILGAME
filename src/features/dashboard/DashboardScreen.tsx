import { useI18n } from '../../i18n/i18n'
import { countryFlag, countryName } from '../../domain/athlete/countries'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Meter } from '../../components/Card'
import { formatDelta, formatStat } from '../../components/format'
import { ATTRIBUTE_IDS, ATTRIBUTE_SCALE, STAT_MAX } from '../../domain/athlete/athlete'
import { getLevelProgress } from '../../domain/athlete/levels'
import { getCareerProgress, WEEKS_PER_YEAR } from '../../domain/training/calendar'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLongKey, weekdayShortKey } from '../../i18n/labels'
import { getUnspentAttributePoints } from '../../game-engine/attributes'
import { getCurrentDay } from '../../game-engine/gameState'
import { previewSession } from '../../game-engine/training'
import { getRace } from '../../domain/races/races'
import { getScheduledEntry, isRaceDayToday } from '../../game-engine/raceSchedule'
import { DashboardRunner } from './DashboardRunner'
import styles from './DashboardScreen.module.css'

/** Display-only threshold: Fatigue at or above this is shown as high. Not a gameplay rule. */
const HIGH_FATIGUE = 70

export function DashboardScreen() {
  const { state } = useCareer()
  const { athlete, week } = state
  const progress = getLevelProgress(athlete.xp)
  const career = getCareerProgress(week.number)
  const unspent = getUnspentAttributePoints(athlete)
  const today = getCurrentDay(week)
  const todaySession = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const fatigueHigh = athlete.fatigue >= HIGH_FATIGUE
  const scheduled = getScheduledEntry(state)
  const scheduledRace = scheduled ? getRace(scheduled.raceId) : undefined
  const todayRace = isRaceDayToday(state) ? scheduledRace : undefined
  const { t, locale } = useI18n()

  return (
    <section className={styles.screen} aria-labelledby="dashboard-title">
      <title>{`${t('dashboard.title')} · Trail Manager`}</title>
      <h1 id="dashboard-title" className={styles.srOnly}>
        {t('dashboard.title')}
      </h1>

      {/* First screen: the runner with attributes on the left and condition on the right. */}
      <div className={styles.hero}>
        {/* Year progress on the left, day centred (owner requests); the coins are in the top bar. */}
        <div className={styles.topBar}>
          <div className={styles.year}>
            <span className={styles.yearLabel}>{t('dashboard.year', { year: career.year })}</span>
            <span className={styles.yearWeek}>
              <span>{t('dashboard.week', { week: career.weekOfYear, weeks: WEEKS_PER_YEAR })}</span>
              <span className={styles.yearPercent}>{career.percent}%</span>
            </span>
            <Meter
              label={t('dashboard.yearProgress', { year: career.year })}
              value={career.weekOfYear}
              min={0}
              max={WEEKS_PER_YEAR}
              valueText={t('dashboard.yearProgressValue', { week: career.weekOfYear, weeks: WEEKS_PER_YEAR, percent: career.percent })}
              className={styles.yearMeter}
            />
          </div>
          <p className={styles.when}>
            {/* Short day name on small phones, so the year block keeps its room. */}
            <span className={styles.dayLong}>{t(weekdayLongKey(today.day))}</span>
            <span className={styles.dayShort}>{t(weekdayShortKey(today.day))}</span>
          </p>
        </div>

        <div className={styles.stage}>
          <div className={styles.intro}>
            <h2 className={styles.nameplate}>
              <span className={styles.nameplateName}>
                {athlete.name}
                {athlete.country && (
                  <span className={styles.flag} role="img" aria-label={countryName(athlete.country, locale)} title={countryName(athlete.country, locale)}>
                    {' '}
                    {countryFlag(athlete.country)}
                  </span>
                )}
              </span>
              <span className={styles.srOnly}> - </span>
              <span className={styles.nameplateRole}>
                {t(`profile.${athlete.profile}`)}
              </span>
            </h2>
          </div>

          <section className={`${styles.side} ${styles.left}`} aria-label={t('dashboard.attributes')}>
            <ul className={styles.sideList}>
              {ATTRIBUTE_IDS.map((id) => (
                <li key={id} className={styles.attribute}>
                  {/* The meter announces name and value; the visible text is for sighted users. */}
                  <span className={styles.attributeName} aria-hidden="true">
                    {t(`attr.${id}`)}
                  </span>
                  <span className={styles.attributeRow}>
                    <Meter
                      label={t(`attr.${id}`)}
                      value={Math.min(athlete.attributes[id], ATTRIBUTE_SCALE)}
                      max={ATTRIBUTE_SCALE}
                      valueText={formatStat(athlete.attributes[id])}
                      className={styles.sideMeter}
                    />
                    <span className={styles.value} aria-hidden="true">
                      {formatStat(athlete.attributes[id])}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* The runner fills the stage height, between the attributes and the condition panel. */}
          <div className={styles.center}>
            <DashboardRunner
              name={athlete.name}
              sex={athlete.sex}
              appearance={athlete.appearance}
              equipment={state.equipment}
            />
          </div>

          <section className={`${styles.side} ${styles.right}`} aria-label={t('dashboard.condition')}>
            <dl className={styles.sideList}>
              <div className={styles.stat}>
                <dt>{t('stat.level')}</dt>
                <dd className={styles.value}>{progress.level}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t('stat.xp')}</dt>
                <dd className={styles.value}>{athlete.xp}</dd>
                {progress.nextLevelMinXp === null ? (
                  <dd className={styles.statNote}>{t('dashboard.maxLevel')}</dd>
                ) : (
                  <>
                    <dd>
                      <Meter
                        label={t('dashboard.progressTo', { level: progress.level + 1 })}
                        value={athlete.xp}
                        min={progress.levelMinXp}
                        max={progress.nextLevelMinXp}
                        valueText={t('dashboard.xpOf', { xp: athlete.xp, next: progress.nextLevelMinXp })}
                        className={styles.xpMeter}
                      />
                    </dd>
                    <dd className={styles.statNote} aria-hidden="true">
                      {athlete.xp} / {progress.nextLevelMinXp}
                    </dd>
                  </>
                )}
              </div>
              <div className={styles.stat}>
                <dt>{t('stat.fitness')}</dt>
                <dd className={styles.value}>{formatStat(athlete.fitness)}</dd>
                <dd>
                  <Meter
                    label={t('stat.fitness')}
                    value={athlete.fitness}
                    max={STAT_MAX}
                    valueText={t('dashboard.ofMax', { value: formatStat(athlete.fitness), max: STAT_MAX })}
                    className={styles.fitnessMeter}
                  />
                </dd>
              </div>
              <div className={`${styles.stat} ${fatigueHigh ? styles.fatigueHigh : ''}`}>
                <dt>{t('stat.fatigue')}</dt>
                <dd className={styles.value}>
                  {athlete.fatigue}
                  {fatigueHigh && <span className={styles.highTag}> {t('dashboard.high')}</span>}
                </dd>
                <dd>
                  <Meter label={t('stat.fatigue')} value={athlete.fatigue} max={STAT_MAX} className={styles.fatigueMeter} />
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Today: what to do next, one tap away (the page does not scroll). */}
        <section className={styles.today} aria-label={t('dashboard.today')}>
          <div className={styles.todayText}>
            <p className={styles.todayTitle}>
              {t('dashboard.todayTitle', {
                what: todayRace ? t('dashboard.todayRace', { name: todayRace.name }) : t(`session.${todaySession.id}`),
              })}
            </p>
            {todayRace ? (
              <p className={styles.todayLine}>{t('dashboard.raceDayLine')}</p>
            ) : (
              <p className={styles.todayLine}>
                {t('stat.xp')} {formatDelta(effects.xpGained)} · {t('stat.fitness')} {formatDelta(effects.fitnessChange)} ·{' '}
                {t('stat.fatigue')} {formatDelta(effects.fatigueChange)}
                {effects.attributeGain &&
                  ` · ${t(`attr.${effects.attributeGain.attribute}`)} ${formatDelta(effects.attributeGain.amount)}`}
              </p>
            )}
            {!todayRace && scheduledRace && (
              <p className={styles.todayLine}>{t('dashboard.sunday', { name: scheduledRace.name })}</p>
            )}
            {unspent > 0 && (
              <Link to="/attributes" className={styles.todayLink}>
                {t('dashboard.pointsToSpend', { count: unspent })}
              </Link>
            )}
          </div>
          <Link
            to={todayRace ? `/races/${todayRace.id}` : '/training'}
            className={`${button.button} ${button.primary} ${styles.todayButton}`}
          >
            {todayRace ? t('dashboard.goToRace') : t('dashboard.train')}
          </Link>
        </section>
      </div>
    </section>
  )
}
