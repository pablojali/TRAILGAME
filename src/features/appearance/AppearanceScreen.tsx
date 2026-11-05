import { useI18n } from '../../i18n/i18n'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Screen } from '../../components/Screen'
import { getLevel } from '../../domain/athlete/levels'
import { AppearanceEditor } from './AppearanceEditor'
import styles from './AppearanceScreen.module.css'

/**
 * Changes the runner's look after creation. Each change is saved at once. New options unlock as
 * the runner levels up; locked ones show the level they unlock at. Cosmetic only.
 */
export function AppearanceScreen() {
  const { state, setAppearance } = useCareer()
  const { athlete } = state
  const [message, setMessage] = useState('')
  const { t } = useI18n()

  return (
    <Screen
      eyebrow={t('look.level', { level: getLevel(athlete.xp) })}
      title={t('look.screenTitle')}
      description={t('look.screenDescription')}
      aside={
        <Link to="/equipment" className={styles.back}>
          {t('look.back')}
        </Link>
      }
    >
      <AppearanceEditor
        sex={athlete.sex}
        appearance={athlete.appearance}
        equipment={state.equipment}
        level={getLevel(athlete.xp)}
        showLocked
        className={styles.editor}
        onChange={(appearance) => {
          const error = setAppearance(appearance)
          setMessage(error ? t('look.notAvailable') : '')
        }}
      />
      {message && (
        <p role="alert" className={styles.warning}>
          {message}
        </p>
      )}
    </Screen>
  )
}
