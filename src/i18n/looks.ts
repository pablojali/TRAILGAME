import type { Locale, Translate } from './i18n'

/**
 * Shirt names in the other languages, by their English name in src/domain/athlete/shirtFiles.ts.
 * A shirt missing here keeps its English name, so new art never breaks anything.
 */
const SHIRT_NAMES: Record<string, Partial<Record<Locale, string>>> = {
  'Charcoal T-shirt': { es: 'Camiseta gris carbón', fr: 'T-shirt anthracite', it: 'Maglietta antracite', de: 'Anthrazit-T-Shirt' },
  'Navy T-shirt': { es: 'Camiseta azul marino', fr: 'T-shirt bleu marine', it: 'Maglietta blu navy', de: 'Marineblaues T-Shirt' },
  'Burgundy T-shirt': { es: 'Camiseta burdeos', fr: 'T-shirt bordeaux', it: 'Maglietta bordeaux', de: 'Bordeauxrotes T-Shirt' },
  'Green T-shirt': { es: 'Camiseta verde', fr: 'T-shirt vert', it: 'Maglietta verde', de: 'Grünes T-Shirt' },
  'Brick red T-shirt': { es: 'Camiseta rojo ladrillo', fr: 'T-shirt rouge brique', it: 'Maglietta rosso mattone', de: 'Ziegelrotes T-Shirt' },
  'Steel blue T-shirt': { es: 'Camiseta azul acero', fr: 'T-shirt bleu acier', it: 'Maglietta blu acciaio', de: 'Stahlblaues T-Shirt' },
  'Blue tank top': { es: 'Camiseta de tirantes azul', fr: 'Débardeur bleu', it: 'Canotta blu', de: 'Blaues Trägertop' },
  'Coral tank top': { es: 'Camiseta de tirantes coral', fr: 'Débardeur corail', it: 'Canotta corallo', de: 'Korallenrotes Trägertop' },
  'Green tank top': { es: 'Camiseta de tirantes verde', fr: 'Débardeur vert', it: 'Canotta verde', de: 'Grünes Trägertop' },
  'Cream tank top': { es: 'Camiseta de tirantes crema', fr: 'Débardeur crème', it: 'Canotta crema', de: 'Cremefarbenes Trägertop' },
  'Teal and grey tank top': {
    es: 'Camiseta de tirantes verde azulado y gris',
    fr: 'Débardeur bleu canard et gris',
    it: 'Canotta verde acqua e grigia',
    de: 'Petrol-graues Trägertop',
  },
  'Pink and white tank top': {
    es: 'Camiseta de tirantes rosa y blanca',
    fr: 'Débardeur rose et blanc',
    it: 'Canotta rosa e bianca',
    de: 'Rosa-weißes Trägertop',
  },
}

/** A look's name (hairstyle, skin tone, shirt) as the game writes it in English, in `locale`. */
export function lookName(label: string, locale: Locale, t: Translate): string {
  const hair = /^Hairstyle (\d+)$/.exec(label)
  if (hair) return t('look.hairstyle', { number: Number(hair[1]) })
  const skin = /^Skin tone (\d+)$/.exec(label)
  if (skin) return t('look.skinTone', { number: Number(skin[1]) })
  if (label === 'Basic') return t('look.basic')
  if (label === 'No shirt') return t('look.noShirt')
  return SHIRT_NAMES[label]?.[locale] ?? label
}
