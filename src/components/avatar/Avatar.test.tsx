import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

const look = { hair: 'natural', skin: 'tone-2', outfit: 'white-tshirt' } as const

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
      'white-tshirt',
      'hydration-backpack',
    ])
  })

  it('draws shoes without their own art with the starter-shoe art, recoloured', () => {
    for (const id of ['trail-shoes-basic', 'trail-shoes', 'trail-shoes-light']) {
      const { container, unmount } = render(<Avatar sex="male" appearance={look} equipment={[id]} />)
      const shoe = container.querySelector(`image[data-layer="${id}"]`)!
      expect(shoe.getAttribute('href')).toMatch(/starter-shoes/)
      expect(shoe.getAttribute('filter')).toMatch(/^url\(#/)
      unmount()
    }
    const { container } = render(<Avatar sex="male" appearance={look} equipment={['starter-shoes']} />)
    expect(container.querySelector('image[data-layer="starter-shoes"]')!.hasAttribute('filter')).toBe(false)
  })

  it('draws nothing for unequipped gear', () => {
    expect(layers([])).toEqual(['body', 'white-tshirt'])
  })
})
