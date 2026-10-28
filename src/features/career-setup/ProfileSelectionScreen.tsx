import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS, type ProfileId } from '../../domain/athlete/athlete'
import { PROFILE_ATTRIBUTE_TOTAL, PROFILE_IDS, PROFILES } from '../../domain/athlete/profiles'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import styles from './CareerSetup.module.css'

interface ProfileSelectionScreenProps {
  /** Set when confirming will overwrite an existing (incompatible) save. */
  replacing: IncompatibleReason | null
}

function listAttributes(ids: readonly string[]) {
  return ids.map((id) => ATTRIBUTE_LABELS[id as keyof typeof ATTRIBUTE_LABELS]).join(', ')
}

export function ProfileSelectionScreen({ replacing }: ProfileSelectionScreenProps) {
  const { startCareer } = useGame()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<ProfileId | null>(null)
  const [showError, setShowError] = useState(false)

  return (
    <Screen
      eyebrow="New career"
      title="Choose your athlete"
      description={`Pick a starting profile. Every profile starts with ${PROFILE_ATTRIBUTE_TOTAL} attribute points; it sets your strengths, not your limits.`}
    >
      {replacing && (
        <p className={styles.caution}>Starting a new career will replace your previous saved career.</p>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (!selected) {
            setShowError(true)
            return
          }
          startCareer(selected)
          // A new career always opens on the Dashboard, whichever route was showing this screen.
          navigate('/')
        }}
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Starting profile</legend>
          <div className={styles.profiles}>
            {PROFILE_IDS.map((id) => {
              const profile = PROFILES[id]
              const isSelected = selected === id
              return (
                <label key={id} className={`${styles.profile} ${isSelected ? styles.selected : ''}`}>
                  <span className={styles.profileHeader}>
                    <input
                      type="radio"
                      name="profile"
                      value={id}
                      checked={isSelected}
                      onChange={() => {
                        setSelected(id)
                        setShowError(false)
                      }}
                      className={styles.radio}
                    />
                    <span className={styles.profileName}>{profile.label}</span>
                    {isSelected && <span className={styles.selectedTag}>Selected</span>}
                  </span>
                  <span className={styles.profileDescription}>{profile.description}</span>
                  <span className={styles.traits}>
                    {profile.strengths.length > 0 ? (
                      <>
                        Strengths: {listAttributes(profile.strengths)}. Weaknesses:{' '}
                        {listAttributes(profile.weaknesses)}.
                      </>
                    ) : (
                      'Balanced: no major strength or weakness.'
                    )}
                  </span>
                  <span className={styles.attributeGrid}>
                    {ATTRIBUTE_IDS.map((attr) => (
                      <span
                        key={attr}
                        className={`${styles.attribute} ${
                          profile.strengths.includes(attr)
                            ? styles.strong
                            : profile.weaknesses.includes(attr)
                              ? styles.weak
                              : ''
                        }`}
                      >
                        <span>{ATTRIBUTE_LABELS[attr]}</span>
                        <span className={styles.attributeValue}>{profile.attributes[attr]}</span>
                      </span>
                    ))}
                  </span>
                  <span className={styles.total}>Total {PROFILE_ATTRIBUTE_TOTAL} points</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <button
          type="submit"
          className={`${button.button} ${button.primary} ${button.block}`}
          aria-disabled={selected === null}
        >
          {selected ? `Start career as ${PROFILES[selected].label}` : 'Select a profile to start'}
        </button>
        {showError && (
          <p role="alert" className={styles.error}>
            Select a starting profile first.
          </p>
        )}
      </form>
    </Screen>
  )
}
