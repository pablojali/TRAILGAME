import { useEffect, useRef, type ReactNode } from 'react'
import styles from './BottomSheet.module.css'

interface BottomSheetProps {
  title: string
  onClose(): void
  children: ReactNode
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal sheet that slides up from the bottom (centred dialog on wide screens). Closes with the
 * close button, a tap on the backdrop or Escape. Focus moves into the sheet, stays inside it while
 * open and returns to the element that opened it.
 */
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const sheet = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !sheet.current) return
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [])

  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={onClose} data-testid="sheet-backdrop" />
      <div ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className={styles.header}>
          <h2 id="sheet-title" className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
