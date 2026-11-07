import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { ScrollPanel } from '../../components/Screen'
import { countryFlag, countryName } from '../../domain/athlete/countries'
import { getLevel } from '../../domain/athlete/levels'
import { firstSeason, RANKING, rankingSeason, seasonBounds, seasonParts, shiftSeason } from '../../domain/ranking/ranking'
import { useI18n } from '../../i18n/i18n'
import type { RankingRow, RankingService } from '../../repositories/supabase/rankingClient'
import styles from './RankingPanel.module.css'

type Mode = 'season' | 'annual'
type Scope = 'world' | 'country'

/** How many runners each ranking shows (plus the player's own row). */
const LIMIT = 50
/** The top 10 first; the rest on request (owner design, 7 November 2026). */
const FIRST_ROWS = 10

/**
 * World and country rankings (owner design, 5 November 2026): asynchronous, one calendar month per
 * season, read from the server (only race results the server decided count). Online only.
 */
export function RankingPanel({ service }: { service: RankingService | null }) {
  const { state } = useCareer()
  const { t, locale } = useI18n()
  const current = Math.max(firstSeason(), rankingSeason(Date.now()))
  const [mode, setMode] = useState<Mode>('season')
  const [showAll, setShowAll] = useState(false)
  const [scope, setScope] = useState<Scope>('world')
  const [season, setSeason] = useState(current)
  const [rows, setRows] = useState<RankingRow[] | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const country = state.athlete.country

  const load = useCallback(async () => {
    if (!service || (scope === 'country' && !country)) return
    setRows(null)
    const result = await service.fetch({
      mode,
      season: mode === 'season' ? season : undefined,
      months: RANKING.annualMonths,
      country: scope === 'country' ? country : undefined,
      bestResults: RANKING.bestResults,
      limit: LIMIT,
    })
    setRows(result)
  }, [service, mode, scope, country, season])

  useEffect(() => {
    void load()
  }, [load, attempt])

  const scopes = (['world', 'country'] as const).map((id) => ({ id, label: t(`ranking.${id}`) }))
  const modes = (['season', 'annual'] as const).map((id) => ({ id, label: t(`ranking.mode.${id}`) }))
  const { year, number: seasonNumber } = seasonParts(season)
  const bounds = seasonBounds(season)
  const dates = `${new Date(bounds.start).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(
    bounds.end - 1,
  ).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  const number = (n: number) => n.toLocaleString(locale)
  const me = Array.isArray(rows) ? rows.find((row) => row.isMe) : undefined

  return (
    <div className={styles.panel}>
      {/* Season (one calendar month) or Annual (each season's best results of the last 12 months). */}
      <div className={styles.bar}>
        {/* A small Season / Annual selector (owner design, 7 November 2026). */}
        <span className={styles.segment} role="group" aria-label={t('ranking.modes')}>
          {modes.map(({ id, label }) => (
            <button key={id} type="button" className={styles.segmentButton} aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </span>
        {mode === 'season' ? (
          <span className={styles.season}>
            <button
              type="button"
              className={styles.arrow}
              aria-label={t('ranking.previous')}
              disabled={season <= firstSeason()}
              onClick={() => setSeason((s) => shiftSeason(s, -1))}
            >
              ‹
            </button>
            <span className={styles.seasonText}>
              {t('ranking.season', { season: seasonNumber, year })}
              <span className={styles.dates}>{dates}</span>
            </span>
            <button
              type="button"
              className={styles.arrow}
              aria-label={t('ranking.next')}
              disabled={season >= current}
              onClick={() => setSeason((s) => shiftSeason(s, 1))}
            >
              ›
            </button>
          </span>
        ) : (
          <span className={styles.season}>{t('ranking.annualPeriod', { months: RANKING.annualMonths })}</span>
        )}
      </div>
      <div className={styles.scopes} role="group" aria-label={t('ranking.scope')}>
        {scopes.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${styles.scope} ${scope === id ? styles.scopeOn : ''}`}
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
          >
            <span aria-hidden="true">{id === 'world' ? '🌐' : country ? countryFlag(country) : '⚑'}</span>
            {label}
          </button>
        ))}
      </div>
      {/* One general classification for everyone (owner decision, 5 November 2026): no men / women filter. */}
      <h3 className={styles.title}>
        {t(mode === 'season' ? 'ranking.seasonTitle' : 'ranking.annualTitle', {
          scope: scope === 'world' ? t('ranking.world') : country ? countryName(country, locale) : t('ranking.country'),
        })}
      </h3>

      {!service ? (
        <p className={styles.muted}>{t('ranking.unavailable')}</p>
      ) : scope === 'country' && !country ? (
        <p className={styles.muted}>
          {t('ranking.noCountry')} <Link to="/settings">{t('ranking.settings')}</Link>
        </p>
      ) : rows === null ? (
        <p role="status" className={styles.muted}>
          {t('ranking.loading')}
        </p>
      ) : rows === 'offline' ? (
        <div>
          <p role="alert" className={styles.muted}>
            {t('ranking.offline')}
          </p>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setAttempt((n) => n + 1)}>
            {t('ranking.retry')}
          </button>
        </div>
      ) : (
        <>
          {/* Four runners in view, the rest by scrolling, and the player's own position right under
              them (owner request, 7 November 2026). */}
          <div className={styles.listBox}>
            <ScrollPanel label={t('ranking.list')}>
              {rows.filter((row) => row.rank <= LIMIT).length === 0 ? (
                <p className={styles.muted}>{t('ranking.empty')}</p>
              ) : (
                <ol className={styles.list}>
                  {rows
                    .filter((row) => row.rank <= (showAll ? LIMIT : FIRST_ROWS))
                    .map((row) => (
                      <li key={`${row.rank}-${row.name}`} className={`${styles.row} ${row.isMe ? styles.rowMe : ''}`}>
                        <span className={`${styles.rank} ${row.rank <= 3 ? styles.rankTop : ''}`}>{row.rank}</span>
                        <span className={styles.who}>
                          <span className={styles.name}>{row.name}</span>
                          <span className={styles.meta}>
                            {row.country && `${countryFlag(row.country)} ${countryName(row.country, locale)} · `}
                            {t('ranking.level', { level: getLevel(row.xp) })}
                          </span>
                        </span>
                        <span className={styles.points}>{t('ranking.points', { points: number(row.points) })}</span>
                      </li>
                    ))}
                </ol>
              )}
              {!showAll && rows.some((row) => row.rank > FIRST_ROWS && row.rank <= LIMIT) && (
                <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
                  {t('ranking.showMore')}
                </button>
              )}
            </ScrollPanel>
          </div>
          <section className={styles.you} aria-label={t('ranking.you')}>
            <span className={styles.youLabel}>{t('ranking.you')}</span>
            {me ? (
              <>
                <span className={styles.youRow}>
                  <strong>{t('ranking.youRow', { rank: me.rank, name: me.name })}</strong>
                  <strong className={styles.points}>{t('ranking.points', { points: number(me.points) })}</strong>
                </span>
                <span className={styles.meta}>
                  {me.country && `${countryFlag(me.country)} ${countryName(me.country, locale)} · `}
                  {t('ranking.level', { level: getLevel(me.xp) })}
                </span>
              </>
            ) : (
              <span className={styles.meta}>{t('ranking.notRanked')}</span>
            )}
          </section>
        </>
      )}
    </div>
  )
}
