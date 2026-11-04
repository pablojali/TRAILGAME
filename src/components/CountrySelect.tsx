import { useMemo } from 'react'
import { countriesByName, countryFlag } from '../domain/athlete/countries'
import { useI18n } from '../i18n/i18n'

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
  const { t, locale } = useI18n()
  const countries = useMemo(() => countriesByName(locale), [locale])
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
        {t('country.choose')}
      </option>
      {countries.map(({ code, name }) => (
        <option key={code} value={code}>
          {countryFlag(code)} {name}
        </option>
      ))}
    </select>
  )
}
