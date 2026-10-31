import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

const look = { hair: 'natural', skin: 'tone-2', outfit: 'shirt-l1-01' } as const

function layers(equipment: string[]) {
  const { container } = render(<Avatar sex="female" appearance={look} equipment={equipment} />)
  return [...container.querySelectorAll('[data-layer]')].map((el) => el.getAttribute('data-layer'))
}

describe('Avatar equipment', () => {
  it('draws every equipped item: poles behind the body, shoes, the top, then the vest', () => {
    expect(layers(['trail-shoes-light', 'poles-2', 'hydration-backpack'])).toEqual([
      'poles-2',
      'body',
      'trail-shoes-light',
      'shirt-l1-01',
      'hydration-backpack',
    ])
  })

  it('draws each shoe item with its own art (owner art, 31 October 2026)', () => {
    for (const id of ['starter-shoes', 'trail-shoes-basic', 'trail-shoes', 'trail-shoes-light']) {
      const { container, unmount } = render(<Avatar sex="male" appearance={look} equipment={[id]} />)
      expect(container.querySelector(`image[data-layer="${id}"]`)!.getAttribute('href')).toMatch(new RegExp(`${id}\\.webp$`))
      unmount()
    }
  })

  it('draws the shirt of the runner\'s sex', () => {
    const { container } = render(<Avatar sex="male" appearance={{ ...look, outfit: 'shirt-l3-02' }} />)
    expect(container.querySelector('image[data-layer="shirt-l3-02"]')!.getAttribute('href')).toMatch(/lvl3_men_shirt_02\.webp$/)
  })

  it('draws nothing for unequipped gear', () => {
    expect(layers([])).toEqual(['body', 'shirt-l1-01'])
  })
})
