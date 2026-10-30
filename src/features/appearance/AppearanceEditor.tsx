import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '../../components/avatar/Avatar'
import {
  appearanceForSex,
  hairStyleLabel,
  hairStyles,
  hairUnlockLevel,
  OUTFIT_LABELS,
  outfitUnlockLevel,
  OUTFITS,
  SKIN_TONE_LABELS,
  SKIN_TONES,
  type Appearance,
} from '../../domain/athlete/appearance'
import { SEX_LABELS, type Sex } from '../../domain/athlete/athlete'
import styles from './AppearanceEditor.module.css'

type AppearanceTab = 'skin' | 'hair' | 'outfit'

const APPEARANCE_TABS: readonly { id: AppearanceTab; label: string }[] = [
  { id: 'skin', label: 'Skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'outfit', label: 'Clothing' },
]


interface Option {
  value: string
  label: string
  swatch: Appearance
  crop: 'head' | 'kit'
  caption?: boolean
  /** Level the option unlocks at, when above the runner's level. */
  lockedUntil?: number
}

interface AppearanceEditorProps {
  sex: Sex
  appearance: Appearance
  onChange(appearance: Appearance): void
  /** The runner's level: options above it are locked. */
  level: number
  /** Show locked options (with the level they unlock at) instead of hiding them. */
  showLocked?: boolean
  /** Equipped item ids, drawn on the preview. */
  equipment?: readonly string[]
  className?: string
}

/**
 * Avatar preview with Skin / Hair / Clothing tabs, used when creating a career and afterwards.
 * Choosing a hairstyle zooms the preview in on the face. Cosmetic only.
 */
export function AppearanceEditor({
  sex,
  appearance,
  onChange,
  level,
  showLocked = false,
  equipment,
  className,
}: AppearanceEditorProps) {
  const [tab, setTab] = useState<AppearanceTab>('skin')
  const tabRefs = useRef<Partial<Record<AppearanceTab, HTMLButtonElement | null>>>({})
  const baseId = useId()

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!offset) return
    event.preventDefault()
    const index = APPEARANCE_TABS.findIndex((t) => t.id === tab)
    const next = APPEARANCE_TABS[(index + offset + APPEARANCE_TABS.length) % APPEARANCE_TABS.length]!.id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const hairs = hairStyles(sex, appearance.skin)
  const options: Option[] =
    tab === 'hair'
      ? hairs
          .filter((hair) => showLocked || hairUnlockLevel(sex, hair) <= level)
          .map((hair) => {
            const unlock = hairUnlockLevel(sex, hair)
            return {
              value: hair,
              label: hairStyleLabel(sex, hair),
              swatch: { ...appearance, hair },
              crop: 'head',
              lockedUntil: unlock > level ? unlock : undefined,
            }
          })
      : tab === 'skin'
        ? SKIN_TONES[sex].map((skin) => ({
            value: skin,
            label: SKIN_TONE_LABELS[skin],
            swatch: { ...appearance, skin },
            crop: 'head',
          }))
        : OUTFITS.filter((outfit) => showLocked || outfitUnlockLevel(outfit) <= level).map((outfit) => {
            const unlock = outfitUnlockLevel(outfit)
            return {
              value: outfit,
              label: OUTFIT_LABELS[outfit],
              swatch: { ...appearance, outfit },
              crop: 'kit',
              caption: unlock === 1,
              lockedUntil: unlock > level ? unlock : undefined,
            }
          })

  const hasLocked = OUTFITS.some((outfit) => outfitUnlockLevel(outfit) > level)
  const hasLockedHair = hairs.some((hair) => hairUnlockLevel(sex, hair) > level)
  const note =
    tab === 'outfit'
      ? `${OUTFIT_LABELS[appearance.outfit]}.${hasLocked ? ' New T-shirt colours unlock as you level up.' : ''}`
      : tab === 'hair'
        ? `${hairStyleLabel(sex, appearance.hair)}.${hasLockedHair ? ' New hairstyles unlock as you level up.' : ''}${
            hairs.length === 1 ? ' More hairstyles for this skin tone come with new artwork.' : ''
          }`
        : undefined

  const previewLabel = `Avatar preview: ${[
    SEX_LABELS[sex],
    hairStyleLabel(sex, appearance.hair),
    SKIN_TONE_LABELS[appearance.skin],
    OUTFIT_LABELS[appearance.outfit],
  ]
    .join(', ')
    .toLowerCase()}`

  return (
    <div className={`${styles.editor} ${className ?? ''}`}>
      <div className={styles.preview}>
        <div className={styles.previewStage}>
          <Avatar
            sex={sex}
            appearance={appearance}
            equipment={equipment}
            label={previewLabel}
            focus={tab === 'hair' ? 'face' : undefined}
          />
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Appearance" onKeyDown={onTabKeyDown}>
        {APPEARANCE_TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`}>
        <fieldset className={styles.swatches}>
          <legend className={styles.srOnly}>{APPEARANCE_TABS.find((t) => t.id === tab)!.label}</legend>
          {options.map((option) => {
            const checked = appearance[tab] === option.value
            const locked = option.lockedUntil !== undefined
            return (
              <label
                key={option.value}
                className={`${styles.swatch} ${locked ? styles.locked : ''}`}
                title={locked ? `${option.label}: unlocks at Level ${option.lockedUntil}` : option.label}
              >
                <input
                  type="radio"
                  name={`appearance-${tab}`}
                  value={option.value}
                  checked={checked}
                  disabled={locked}
                  // A new skin tone keeps the hairstyle only if it has art in that tone.
                  onChange={() => onChange(appearanceForSex({ ...appearance, [tab]: option.value }, sex))}
                  className={styles.srOnlyInput}
                />
                <span className={styles.swatchArt}>
                  <Avatar sex={sex} appearance={option.swatch} crop={option.crop} />
                </span>
                {locked ? (
                  <>
                    <span className={styles.srOnly}>{option.label}, unlocks at Level {option.lockedUntil}</span>
                    <span className={styles.lockCaption} aria-hidden="true">
                      Lvl {option.lockedUntil}
                    </span>
                  </>
                ) : (
                  <span className={option.caption ? styles.swatchCaption : styles.srOnly}>{option.label}</span>
                )}
              </label>
            )
          })}
        </fieldset>
        {note && <p className={styles.tabNote}>{note}</p>}
      </div>
    </div>
  )
}
