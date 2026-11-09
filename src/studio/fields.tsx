import { useId, type ReactNode } from 'react'

/** Form fields of Trail Studio: label above, value below, an optional hint. */
export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId()
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function TextField(props: { label: string; value: string; onChange(v: string): void; hint?: ReactNode; wide?: boolean; multiline?: boolean; placeholder?: string }) {
  return (
    <Field label={props.label} hint={props.hint} wide={props.wide}>
      {(id) =>
        props.multiline ? (
          <textarea id={id} rows={2} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
        ) : (
          <input id={id} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
        )
      }
    </Field>
  )
}

export function NumberField(props: { label: string; value: string; onChange(v: string): void; hint?: ReactNode; step?: number; min?: number; max?: number }) {
  return (
    <Field label={props.label} hint={props.hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={props.step ?? 1}
          min={props.min}
          max={props.max}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function SelectField(props: { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void; hint?: ReactNode }) {
  return (
    <Field label={props.label} hint={props.hint}>
      {(id) => (
        <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

/** 0–max as pips you can click (e.g. technicality). */
export function PipsField(props: { label: string; value: number; max: number; onChange(v: number): void; hint?: ReactNode }) {
  return (
    <Field label={props.label} hint={props.hint}>
      {(id) => (
        <div className="pipsInput" id={id} role="radiogroup" aria-label={props.label}>
          {Array.from({ length: props.max + 1 }, (_, v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={props.value === v}
              className={v <= props.value && v > 0 ? 'on' : ''}
              onClick={() => props.onChange(v)}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}

export function Pips({ value, max }: { value: number; max: number }) {
  return (
    <span className="pips" aria-label={`${value} de ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  )
}
