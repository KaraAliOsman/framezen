import type { Catalog } from '@dekopen/engine'
import { isHex, luminance, mix, parseHex, shade, toHex } from '../base/color'

/** Colores de material del sistema de diseño (invariantes, no cambian con el tema). */
export const MATERIAL_COLORS = {
  white: '#F6F5F1',
  anthracite: '#383E42',
  black: '#0E0E10',
  goldenOak: '#A8692E',
  walnut: '#5B3A22',
  winchester: '#7A4A2A',
} as const

/** Vidrio del dibujo técnico (plano, legible en láser). */
export const GLASS_FILL = '#D9EBEE'
export const GLASS_OPACITY = 0.7
export const SYMBOL_COLOR = '#1F1C18'
/** Cotas: grafito neutro (`--dk-dimension` / `--dk-dimension-text`); en pantalla siguen al tema. */
export const DIMENSION_COLOR = '#576366'
export const DIMENSION_TEXT_COLOR = '#2F373A'
/** Selección en el lienzo: azul propio (`--dk-select`), porque el acento de la interfaz es tinta y no se ve sobre marcos oscuros. */
export const SELECTION_COLOR = '#1F6BFF'
export const SELECTION_FILL = '#DCE8FF'
export const HOVER_COLOR = '#1F6BFF'

/** Variables CSS con respaldo (en un PDF no hay tema: queda el respaldo). */
export const DRAWING_CSS = {
  dimension: `var(--dk-dimension, ${DIMENSION_COLOR})`,
  dimensionText: `var(--dk-dimension-text, ${DIMENSION_TEXT_COLOR})`,
  accent: `var(--dk-select, ${SELECTION_COLOR})`,
  focusRing: 'var(--dk-select-ring, rgb(31 107 255 / 0.22))',
  selectionFill: `var(--dk-select-ring, ${SELECTION_FILL})`,
  caption: 'var(--dk-fg-muted, #576366)',
} as const

/**
 * Familia de cotas y rótulos, siempre con cifras tabulares: la del tema dentro de un documento
 * (`--dk-font-body`, o `--fzd-text` en los diseños anteriores) y la de la interfaz en la app.
 */
export const DIMENSION_FONT = "var(--dk-font-body, var(--fzd-text, var(--font-sans, 'Funnel Sans Variable', 'Funnel Sans', ui-sans-serif, system-ui, sans-serif)))"

const KEYWORDS: [RegExp, string][] = [
  [/blanc|white/i, MATERIAL_COLORS.white],
  [/antrac|anthrac|grafit|gris|grey|gray/i, MATERIAL_COLORS.anthracite],
  [/negr|black/i, MATERIAL_COLORS.black],
  [/roble|oak|dorad|golden/i, MATERIAL_COLORS.goldenOak],
  [/nogal|walnut/i, MATERIAL_COLORS.walnut],
  [/winchester|caoba|sapelli|marr[oó]n|brown/i, MATERIAL_COLORS.winchester],
]

/** Color plano de un color del catálogo (con respaldo por nombre/id y PVC blanco por defecto). */
export function colorHex(colorId: string | undefined, catalog: Pick<Catalog, 'colors'> | undefined): string {
  if (!colorId) return MATERIAL_COLORS.white
  const color = catalog?.colors?.find((c) => c.id === colorId)
  if (color && isHex(color.hex)) return toHex(parseHex(color.hex))
  const probe = `${colorId} ${color?.name ?? ''}`
  for (const [re, hex] of KEYWORDS) if (re.test(probe)) return hex
  return MATERIAL_COLORS.white
}

export interface MaterialPalette {
  fill: string
  /** Contorno 1 px más oscuro. */
  stroke: string
  /** Panel ciego (puertas): un poco más claro/oscuro que el perfil. */
  panel: string
  /** Manillas y bisagras. */
  hardware: string
  light: boolean
}

export function materialPalette(fill: string): MaterialPalette {
  const lum = luminance(fill)
  const light = lum > 0.55
  return {
    fill,
    stroke: light ? (lum > 0.8 ? '#B9B2A6' : mix(fill, '#4A453E', 0.5)) : shade(fill, 0.5),
    panel: light ? mix(fill, '#E4DFD7', 0.35) : shade(fill, -0.1),
    hardware: light ? '#FFFFFF' : shade(fill, 0.25),
    light,
  }
}
