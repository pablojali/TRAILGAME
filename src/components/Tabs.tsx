import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Tabs.module.css'

interface TabsProps<T extends string> {
  /** Name of the tab list, for screen readers. */
  label: string
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange(value: T): void
  /** The selected tab's content. */
  children: ReactNode
}

/**
 * Tabs that split a screen into parts so each fits without scrolling (owner request,
 * 30 October 2026). Arrow keys move between tabs; only the selected tab's panel is rendered.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: TabsProps<T>) {
  const baseId = useId()
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!offset) return
    event.preventDefault()
    const index = tabs.findIndex((t) => t.id === value)
    const next = tabs.at((index + offset) % tabs.length)!.id
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={t.id === value}
            aria-controls={`${baseId}-panel`}
            tabIndex={t.id === value ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${value}`} className={styles.panel}>
        {children}
      </div>
    </>
  )
}

/** Filter chips (one choice) inside a tab, e.g. Shoes · Poles · Backpack. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange(value: T): void
}) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={styles.chip}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
