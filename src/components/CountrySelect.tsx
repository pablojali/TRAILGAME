import { useMemo } from 'react'
import { countriesByName, countryFlag } from '../domain/athlete/countries'

interface CountrySelectProps {
  id: string
  value: string
  onChange(code: string): void
  className?: string
  invalid?: boolean
  describedBy?: string
}

/** Every country by name, each with its flag (owner request, 4 November 2026). */
export function CountrySelect({ id, value, onChange, className, invalid, describedBy }: CountrySelectProps) {
  const countries = useMemo(() => countriesByName(), [])
  return (
    <select
      id={id}
      className={className}
      value={value}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        Choose a country
      </option>
      {countries.map(({ code, name }) => (
        <option key={code} value={code}>
          {countryFlag(code)} {name}
        </option>
      ))}
    </select>
  )
}
