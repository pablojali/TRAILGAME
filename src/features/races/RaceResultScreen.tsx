import { lookName } from '../../i18n/looks'
import { useI18n } from '../../i18n/i18n'
import { weekdayLongKey } from '../../i18n/labels'
import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta } from '../../components/format'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { appearanceUnlocks } from '../../domain/athlete/appearance'
import { getAttributePointsBetween } from '../../domain/athlete/levels'
import { GROSS_PRIZES, PRIZE_BANDS } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { INJURY_REST_DAYS } from '../../domain/training/injury'
import type { FinishedRaceEntry, RaceResult } from '../../game-engine/gameState'
import { getEntry, getStandings } from '../../game-engine/races'
import { formatChange, intensityKey, stopKey } from './raceStrategyText'
import { bandLabel, durationText, ordinal, raceTimeText } from './raceText'
import styles from './Races.module.css'

/**
 * Race result (Game Design Bible §10.11). Reads the stored result only: opening or reloading it
 * never runs the race again or awards anything.
 */
export function RaceResultScreen() {
  const { entryId = '' } = useParams()
  const { state } = useCareer()
  const entry = getEntry(state, entryId)
  const race = entry && getRace(entry.raceId)
  const { t } = useI18n()

  if (!entry || !race) {
    return (
      <Screen title={t('result.notFound')} description={t('result.notFoundDescription')}>
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          {t('result.backToRaces')}
        </Link>
      </Screen>
    )
  }
  if (entry.status !== 'finished') {
    return (
      <Screen eyebrow={race.name} title={t('result.notRaced')} description={t('result.notRacedDescription')}>
        <Link to={`/races/${race.id}`} className={`${button.button} ${button.primary}`}>
          {t('result.goToRaceDay')}
        </Link>
      </Screen>
    )
  }
  return <Result race={race} entry={entry} />
}

const RESULT_TABS = ['result', 'splits', 'standings'] as const

function Result({ race, entry }: { race: Race; entry: FinishedRaceEntry }) {
  const { result } = entry
  const location = useLocation()
  const levelsGained = (location.state as { levelsGained?: number } | null)?.levelsGained ?? 0
  const { athlete } = useCareer().state
  const unlocks = appearanceUnlocks(
    result.levelAtStart,
    result.levelAtStart + levelsGained,
    athlete.sex,
    athlete.appearance.skin,
  )

  const [params, setParams] = useSearchParams()
  const { t, locale } = useI18n()
  // Results saved before Race Engine V1 have no splits.
  const tabs = (result.splits ? RESULT_TABS : RESULT_TABS.filter((id) => id !== 'splits')).map((id) => ({
    id,
    label: t(`result.tab.${id}`),
  }))
  const tab = tabs.find((item) => item.id === params.get('tab'))?.id ?? 'result'

  return (
    <Screen
      eyebrow={t('result.eyebrow', { race: race.name })}
      title={t('result.title', { position: ordinal(result.position, locale), field: result.fieldSize })}
      description={t('result.description', {
        category: t(`category.${race.category}`),
        week: result.week,
        day: t(weekdayLongKey(result.day)),
      })}
      showDescription
    >
      <Tabs
        label={t('result.tabs')}
        tabs={tabs}
        value={tab}
        // Keep the router state, so the level-up message survives switching tabs.
        onChange={(next) => setParams(next === 'result' ? {} : { tab: next }, { replace: true, state: location.state })}
      >
        {tab === 'result' && (
          // Tiles that fit the screen (owner request, 1 November 2026): no explanations.
          <dl className={styles.tiles} aria-label={t('result.result')}>
            <div className={styles.tile}>
              <dt>{t('result.time')}</dt>
              <dd className={styles.time}>{raceTimeText(result.timeS)}</dd>
            </div>
            <div className={styles.tile}>
              <dt>{t('result.band')}</dt>
              <dd>
                {PRIZE_BANDS[result.band]!.to === null
                  ? t('result.orLower', { position: ordinal(PRIZE_BANDS[result.band]!.from, locale) })
                  : bandLabel(PRIZE_BANDS[result.band]!, locale)}
              </dd>
            </div>
            <div className={styles.tile}>
              <dt>{t('result.coins')}</dt>
              <dd>{t('common.coins', { count: result.coinsAwarded })}</dd>
            </div>
            <div className={styles.tile}>
              <dt>{t('result.xp')}</dt>
              <dd>
                {t('result.xpValue', { xp: result.xpAwarded })}
                {result.injured ? t('result.injuredTag') : ''}
              </dd>
            </div>
            <div className={styles.tile}>
              <dt>{t('stat.fatigue')}</dt>
              <dd>{formatChange(result.fatigueChange)}</dd>
            </div>
            {result.rankingPoints !== undefined && result.rankingSeason !== undefined && (
              <div className={styles.tile}>
                <dt>{t('result.rankingPoints')}</dt>
                <dd>{t('result.rankingValue', { points: result.rankingPoints, season: result.rankingSeason })}</dd>
              </div>
            )}
            <div className={styles.tile}>
              <dt>{t('result.rewards')}</dt>
              <dd className={result.multiplierPct < 100 ? styles.warning : undefined}>{result.multiplierPct}%</dd>
            </div>
            {result.injured && (
              <div className={`${styles.tile} ${styles.tileWide}`}>
                <dt>{t('result.injured')}</dt>
                <dd className={styles.warning}>
                  {t('result.injuredValue', { delta: formatDelta(result.fitnessChange), days: INJURY_REST_DAYS })}
                </dd>
              </div>
            )}
            {levelsGained > 0 && (
              <div className={`${styles.tile} ${styles.tileWide}`}>
                <dt>{t('result.levelUp')}</dt>
                <dd role="status">
                  {t('result.points', { points: getAttributePointsBetween(result.levelAtStart, result.levelAtStart + levelsGained) })}
                  <Link to="/attributes">{t('result.allocate')}</Link>
                  {unlocks.length > 0 && (
                    <>
                      {t('result.newLook', { looks: unlocks.map((look) => lookName(look, locale, t)).join(', ') })}
                      <Link to="/appearance">{t('common.changeLook')}</Link>
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
        {tab === 'splits' && result.splits && (
          <ScrollPanel label={t('result.splits')}>
            <Splits result={result} />
          </ScrollPanel>
        )}
        {tab === 'standings' && <Standings race={race} entry={entry} name={athlete.name} />}
      </Tabs>

      <div className={styles.links}>
        <Link to={`/races?category=${race.category}`} className={`${button.button} ${button.primary}`}>
          {t('result.backToRaces')}
        </Link>
        <Link to="/training" className={`${button.button} ${button.secondary}`}>
          {t('result.training')}
        </Link>
      </div>
    </Screen>
  )
}

/** Every segment as run (Race Engine V1): intensity, time, position on arrival and the stop after it. */
function Splits({ result }: { result: RaceResult }) {
  const splits = result.splits ?? []
  const { t } = useI18n()
  const nutrition = [result.nutrition?.gel && t('result.gel'), result.nutrition?.bar && t('result.bar')].filter(Boolean)
  return (
    <>
      <table className={`${styles.standingsTable} ${styles.splitsTable}`}>
        <caption className={styles.srOnly}>{t('result.splitsCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('result.col.segment')}</th>
            <th scope="col">{t('result.col.intensity')}</th>
            <th scope="col">{t('result.col.time')}</th>
            <th scope="col">{t('result.col.total')}</th>
            <th scope="col">{t('result.col.position')}</th>
            <th scope="col">{t('result.col.stop')}</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <th scope="row">{t(intensityKey(split.intensity))}</th>
              <td>{durationText(split.segmentS)}</td>
              <td>{raceTimeText(split.arrivalS)}</td>
              <td>{split.position}</td>
              <td>{split.stop ? t(stopKey(split.stop)) : t('result.finish')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.muted}>
        {t('result.nutrition', { items: nutrition.length ? nutrition.join(t('result.and')) : t('result.nutritionNone') })}
      </p>
    </>
  )
}

/** All 50 finishers, in their own tab; the table scrolls inside the screen. */
function Standings({ race, entry, name }: { race: Race; entry: FinishedRaceEntry; name: string }) {
  const rows = getStandings(race, entry.result)
  const winner = rows[0]!.timeS
  const prizes = GROSS_PRIZES[race.category]
  const you = useRef<HTMLTableRowElement>(null)
  const { t } = useI18n()
  // Open the table at the player's row.
  useEffect(() => you.current?.scrollIntoView?.({ block: 'center' }), [])
  return (
    <>
      <ScrollPanel label={t('result.standings', { count: rows.length })}>
        <table className={styles.standingsTable}>
          <caption className={styles.srOnly}>{t('result.standingsCaption', { race: race.name })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('result.col.position')}</th>
              <th scope="col">{t('result.col.runner')}</th>
              <th scope="col">{t('result.col.time')}</th>
              <th scope="col">{t('result.col.gap')}</th>
              <th scope="col">{t('result.col.prize')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const band = PRIZE_BANDS.findIndex((b) => row.position >= b.from && (b.to === null || row.position <= b.to))
              const firstOfBand = PRIZE_BANDS[band]!.from === row.position
              return (
                <tr
                  key={row.position}
                  ref={row.runner === 'you' ? you : undefined}
                  className={`${row.runner === 'you' ? styles.youRow : ''} ${firstOfBand && row.position > 1 ? styles.bandStart : ''}`}
                  aria-current={row.runner === 'you' ? 'true' : undefined}
                >
                  <td>{row.position}</td>
                  <th scope="row">{row.runner === 'you' ? t('result.you', { name }) : t('result.rival', { number: row.runner })}</th>
                  <td>{raceTimeText(row.timeS)}</td>
                  <td>{row.position === 1 ? '—' : `+${durationText(row.timeS - winner)}`}</td>
                  <td>{prizes[band]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollPanel>
      <p className={styles.standingsNote}>{t('result.prizesNote')}</p>
    </>
  )
}
