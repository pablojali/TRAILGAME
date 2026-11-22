import type { WearStatus } from '../../domain/equipment/wear'
import { useI18n } from '../../i18n/i18n'
import { bandText, kmText } from './wearText'
import styles from './Wear.module.css'

/** Which look the bar has: by the band the server's figures put the item in (shoes), or by life left. */
function levelOf(status: WearStatus): string {
  if (status.wornOut) return 'worn'
  if (!status.band) return 'normal'
  if (status.band.raceStart !== 'ok') return 'risk'
  if (status.band.effectFactor >= 1) return 'normal'
  return status.band.effectFactor >= 0.5 ? 'slight' : 'heavy'
}

/**
 * The durability of an item that wears (A-5): a bar, the percentage, the band and the km left, for
 * example "Durability left: 108 km of 150 km". Every figure is the engine's (`wearStatus`); nothing is
 * computed here. Readable without colour: the length, the number and the words say the same.
 */
export function WearMeter({ status, compact = false }: { status: WearStatus; compact?: boolean }) {
  const { t, locale } = useI18n()
  const band = status.band ? bandText(status.band, t) : status.wornOut ? t('wear.band.wornOut') : null
  return (
    <div className={styles.meter}>
      <div className={styles.meterTop}>
        <strong>
          {status.durabilityPct}%{band ? ` · ${band}` : ''}
        </strong>
        <span className={styles.km} aria-label={t('wear.left', { left: kmText(status.remainingKm, locale), life: kmText(status.lifeKm, locale) })}>
          {compact
            ? t('wear.leftShort', { left: kmText(status.remainingKm, locale), life: kmText(status.lifeKm, locale) })
            : t('wear.left', { left: kmText(status.remainingKm, locale), life: kmText(status.lifeKm, locale) })}
        </span>
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.durabilityPct}
        aria-label={t('wear.meter', { pct: status.durabilityPct, band: band ?? '' })}
      >
        <span className={styles.fill} data-level={levelOf(status)} style={{ width: `${status.durabilityPct}%` }} />
      </div>
      {!compact && status.wornOut && !status.band && <p className={styles.km}>{t('wear.noEffect')}</p>}
    </div>
  )
}
