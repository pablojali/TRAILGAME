import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '../../components/avatar/Avatar'
import {
  appearanceForSex,
  hairStyleLabel,
  hairStyles,
  hairUnlockLevel,
  outfitLabel,
  outfits,
  outfitUnlockLevel,
  SKIN_TONE_LABELS,
  SKIN_TONES,
  type Appearance,
} from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import { useI18n } from '../../i18n/i18n'
import { lookName } from '../../i18n/looks'
import styles from './AppearanceEditor.module.css'

type AppearanceTab = 'skin' | 'hair' | 'outfit'

const APPEARANCE_TABS: readonly { id: AppearanceTab }[] = [{ id: 'skin' }, { id: 'hair' }, { id: 'outfit' }]

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
  const { t: tr, locale } = useI18n()
  const name = (label: string) => lookName(label, locale, tr)

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
              label: name(hairStyleLabel(sex, hair)),
              swatch: { ...appearance, hair },
              crop: 'head',
              lockedUntil: unlock > level ? unlock : undefined,
            }
          })
      : tab === 'skin'
        ? SKIN_TONES[sex].map((skin) => ({
            value: skin,
            label: name(SKIN_TONE_LABELS[skin]),
            swatch: { ...appearance, skin },
            crop: 'head',
          }))
        : outfits(sex)
            .filter((outfit) => showLocked || outfitUnlockLevel(sex, outfit) <= level)
            .map((outfit) => {
              const unlock = outfitUnlockLevel(sex, outfit)
              return {
                value: outfit,
                label: name(outfitLabel(sex, outfit)),
                swatch: { ...appearance, outfit },
                crop: 'kit',
                caption: unlock === 1,
                lockedUntil: unlock > level ? unlock : undefined,
              }
            })

  const hasLocked = outfits(sex).some((outfit) => outfitUnlockLevel(sex, outfit) > level)
  const hasLockedHair = hairs.some((hair) => hairUnlockLevel(sex, hair) > level)
  const note =
    tab === 'outfit'
      ? `${name(outfitLabel(sex, appearance.outfit))}.${hasLocked ? tr('look.newShirts') : ''}`
      : tab === 'hair'
        ? `${name(hairStyleLabel(sex, appearance.hair))}.${hasLockedHair ? tr('look.newHair') : ''}${
            hairs.length === 1 ? tr('look.moreHair') : ''
          }`
        : undefined

  const previewLabel = tr('look.preview', {
    items: [
      tr(`sex.${sex}`),
      name(hairStyleLabel(sex, appearance.hair)),
      name(SKIN_TONE_LABELS[appearance.skin]),
      name(outfitLabel(sex, appearance.outfit)),
    ]
      .join(', ')
      .toLocaleLowerCase(locale === 'de' ? 'en' : locale),
  })

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

      <div className={styles.tabs} role="tablist" aria-label={tr('look.tabs')} onKeyDown={onTabKeyDown}>
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
            {tr(`look.tab.${t.id}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`}>
        <fieldset className={styles.swatches}>
          <legend className={styles.srOnly}>{tr(`look.tab.${tab}`)}</legend>
          {options.map((option) => {
            const checked = appearance[tab] === option.value
            const locked = option.lockedUntil !== undefined
            return (
              <label
                key={option.value}
                className={`${styles.swatch} ${locked ? styles.locked : ''}`}
                title={locked ? tr('look.unlocksAt', { name: option.label, level: option.lockedUntil! }) : option.label}
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
                    <span className={styles.srOnly}>{tr('look.unlocksAtSr', { name: option.label, level: option.lockedUntil! })}</span>
                    <span className={styles.lockCaption} aria-hidden="true">
                      {tr('common.lvl', { level: option.lockedUntil! })}
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
