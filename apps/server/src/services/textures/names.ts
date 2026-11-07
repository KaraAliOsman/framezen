/**
 * Nombre descriptivo de una textura cuando no hay IA ni nombre puesto por la persona: acabado +
 * tono, en el idioma de quien sube. Y parecido con la biblioteca integrada (por color y acabado).
 */
import { BUILTIN_TEXTURES, type BuiltinTextureId, type Locale, type TextureFinish, type TexturePalette } from '@dekopen/shared'
import { colorDistance, parseHex, srgbToLinear } from './image'

type Tone = 'light' | 'medium' | 'dark'

const NAMES: Record<Locale, Record<TextureFinish, Record<Tone, string>>> = {
  es: {
    woodgrain: { light: 'Madera clara', medium: 'Madera media', dark: 'Madera oscura' },
    metallic: { light: 'Metálico claro', medium: 'Metálico cepillado', dark: 'Metálico oscuro' },
    textured: { light: 'Texturado claro', medium: 'Texturado medio', dark: 'Texturado oscuro' },
    smooth: { light: 'Liso claro', medium: 'Liso medio', dark: 'Liso oscuro' },
  },
  en: {
    woodgrain: { light: 'Light wood', medium: 'Medium wood', dark: 'Dark wood' },
    metallic: { light: 'Light metallic', medium: 'Brushed metallic', dark: 'Dark metallic' },
    textured: { light: 'Light textured', medium: 'Medium textured', dark: 'Dark textured' },
    smooth: { light: 'Light smooth', medium: 'Medium smooth', dark: 'Dark smooth' },
  },
  pt: {
    woodgrain: { light: 'Madeira clara', medium: 'Madeira média', dark: 'Madeira escura' },
    metallic: { light: 'Metálico claro', medium: 'Metálico escovado', dark: 'Metálico escuro' },
    textured: { light: 'Texturizado claro', medium: 'Texturizado médio', dark: 'Texturizado escuro' },
    smooth: { light: 'Liso claro', medium: 'Liso médio', dark: 'Liso escuro' },
  },
  fr: {
    woodgrain: { light: 'Bois clair', medium: 'Bois moyen', dark: 'Bois foncé' },
    metallic: { light: 'Métallisé clair', medium: 'Métallisé brossé', dark: 'Métallisé foncé' },
    textured: { light: 'Texturé clair', medium: 'Texturé moyen', dark: 'Texturé foncé' },
    smooth: { light: 'Lisse clair', medium: 'Lisse moyen', dark: 'Lisse foncé' },
  },
  de: {
    woodgrain: { light: 'Holz hell', medium: 'Holz mittel', dark: 'Holz dunkel' },
    metallic: { light: 'Metallic hell', medium: 'Metallic gebürstet', dark: 'Metallic dunkel' },
    textured: { light: 'Struktur hell', medium: 'Struktur mittel', dark: 'Struktur dunkel' },
    smooth: { light: 'Glatt hell', medium: 'Glatt mittel', dark: 'Glatt dunkel' },
  },
  it: {
    woodgrain: { light: 'Legno chiaro', medium: 'Legno medio', dark: 'Legno scuro' },
    metallic: { light: 'Metallizzato chiaro', medium: 'Metallizzato spazzolato', dark: 'Metallizzato scuro' },
    textured: { light: 'Testurizzato chiaro', medium: 'Testurizzato medio', dark: 'Testurizzato scuro' },
    smooth: { light: 'Liscio chiaro', medium: 'Liscio medio', dark: 'Liscio scuro' },
  },
  tr: {
    woodgrain: { light: 'Açık ahşap', medium: 'Orta ton ahşap', dark: 'Koyu ahşap' },
    metallic: { light: 'Açık metalik', medium: 'Fırçalanmış metalik', dark: 'Koyu metalik' },
    textured: { light: 'Açık dokulu', medium: 'Orta ton dokulu', dark: 'Koyu dokulu' },
    smooth: { light: 'Açık düz', medium: 'Orta ton düz', dark: 'Koyu düz' },
  },
}

function toneOf(hex: string): Tone {
  const [r, g, b] = parseHex(hex)
  const y = 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  const lightness = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
  if (lightness >= 66) return 'light'
  if (lightness >= 40) return 'medium'
  return 'dark'
}

export function defaultTextureName(finish: TextureFinish, palette: Pick<TexturePalette, 'average'>, locale: Locale): string {
  return NAMES[locale]?.[finish]?.[toneOf(palette.average)] ?? NAMES.es[finish][toneOf(palette.average)]
}

/** Hasta dos texturas integradas parecidas (mismo acabado primero, ΔE < 14). */
export function similarBuiltinTextures(finish: TextureFinish, palette: Pick<TexturePalette, 'average'>): BuiltinTextureId[] {
  return Object.values(BUILTIN_TEXTURES)
    .map((t) => ({ id: t.id, d: colorDistance(palette.average, t.hex) + (t.finish === finish ? 0 : 8) }))
    .filter((t) => t.d < 14)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map((t) => t.id)
}
