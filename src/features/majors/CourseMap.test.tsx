import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildCourse } from '../../domain/races/course'
import { I18nProvider } from '../../i18n/i18n'
import { CourseMap } from './CourseMap'

const course = buildCourse(
  Array.from({ length: 300 }, (_, i) => ({ lat: 45.92 + i * 0.0002, lon: 6.87 + Math.sin(i / 30) * 0.003, ele: 1000 + i })),
)

describe('the course seen from above (owner design, 18 November 2026)', () => {
  it('draws the route alone (no map tiles), the segment, the aid stations and the runners with the player apart', () => {
    const { container } = render(
      <I18nProvider>
        <CourseMap course={course} fromKm={1} toKm={3} runners={[{ km: 1.5, me: false }, { km: 2, me: true }, { km: 2.5, me: false }]} aidKm={[1, 3]} label="Segment 2 from above" />
      </I18nProvider>,
    )
    expect(screen.getByRole('figure', { name: 'Segment 2 from above' })).toBeInTheDocument()
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(2 + 2 + 3)
    expect(screen.queryByText(/OpenTopoMap/)).toBeNull()
  })
})
