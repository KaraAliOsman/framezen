/**
 * Tema de catálogo: compila los tokens acotados de `DocTemplate` (paleta, fuentes, escala tipográfica,
 * densidad, radio, líneas, uso del acento) a variables CSS de confianza y a las medidas físicas (mm)
 * que usa el armado de páginas. Las mismas cifras alimentan el CSS y el paginador: un bloque de alto
 * fijo mide en papel exactamente lo que el paginador le reservó.
 */
import {
  DOC_FONTS,
  DOC_RADIUS_PX,
  PAGE_SIZE_MM,
  fontStack,
  type DocFontId,
  type DocPage,
  type DocTheme,
} from '@dekopen/shared'
import { mix, readableOn } from '../../base/color'

export const PT_MM = 25.4 / 72
export const MM_PX = 96 / 25.4

/** Tamaños en puntos por escala tipográfica. */
export interface TypeSizes {
  micro: number
  small: number
  base: number
  h3: number
  h2: number
  h1: number
  display: number
}

const TYPE_SIZES: Record<DocTheme['typeScale'], TypeSizes> = {
  compact: { micro: 6.6, small: 7.4, base: 8.6, h3: 10, h2: 14, h1: 24, display: 34 },
  standard: { micro: 7, small: 7.9, base: 9.3, h3: 11, h2: 17, h1: 30, display: 42 },
  editorial: { micro: 7.2, small: 8.2, base: 9.8, h3: 12.5, h2: 21, h1: 36, display: 50 },
}

/** Paso de espacio (mm) por densidad. */
const DENSITY_UNIT: Record<DocTheme['density'], number> = { compact: 3, comfortable: 4, airy: 5 }

export interface CatalogMetrics {
  page: { width: number; height: number }
  margin: { top: number; right: number; bottom: number; left: number }
  /** Alto de la cabecera de página (0 si no hay) y su separación. */
  header: number
  /** Alto del pie (0 si no hay) y su separación. */
  footer: number
  /** Área útil de contenido en páginas con cabecera/pie. */
  content: { width: number; height: number }
  type: TypeSizes
  /** Paso de espacio en mm. */
  u: number
  /** Interlineado del texto corrido. */
  leading: number
}

export const HEADER_MM = 8
export const HEADER_GAP_MM = 5
export const FOOTER_MM = 6
export const FOOTER_GAP_MM = 4

export function catalogMetrics(theme: DocTheme, page: DocPage): CatalogMetrics {
  const size = PAGE_SIZE_MM[page.size] ?? PAGE_SIZE_MM.Letter
  const header = page.header === 'none' ? 0 : HEADER_MM + HEADER_GAP_MM
  const footer = page.footer === 'none' && page.pageNumbers === 'none' ? 0 : FOOTER_MM + FOOTER_GAP_MM
  const margin = { ...page.margins }
  const width = size.width - margin.left - margin.right
  const height = size.height - margin.top - margin.bottom - header - footer
  return {
    page: size,
    margin,
    header,
    footer,
    content: { width: round(width), height: round(height) },
    type: TYPE_SIZES[theme.typeScale] ?? TYPE_SIZES.standard,
    u: DENSITY_UNIT[theme.density] ?? 4,
    leading: theme.density === 'compact' ? 1.38 : theme.density === 'airy' ? 1.55 : 1.46,
  }
}

export function round(n: number, step = 0.01): number {
  return Math.round(n / step) * step
}

/** Alto de una línea de texto en mm. */
export function lineMm(pt: number, leading: number): number {
  return pt * PT_MM * leading
}

/**
 * Líneas estimadas de un texto en una columna (prudente: ancho medio de carácter 0,55 em; mejor que
 * sobre aire a que el texto se corte). `chars` cuenta caracteres visibles.
 */
export function estimateLines(chars: number, widthMm: number, pt: number): number {
  if (chars <= 0) return 0
  const perLine = Math.max(8, Math.floor(widthMm / (pt * PT_MM * 0.55)))
  return Math.ceil(chars / perLine)
}

/** Familias usadas por el tema (para incrustar las fuentes en el PDF). */
export function themeFontIds(theme: DocTheme): DocFontId[] {
  return [...new Set([theme.fonts.heading, theme.fonts.body, theme.fonts.mono])] as DocFontId[]
}

/**
 * Variables CSS del tema (valores de confianza: hex validados por el esquema, fuentes de la lista
 * cerrada, números). Nunca texto libre.
 */
export function catalogThemeVars(theme: DocTheme, metrics: CatalogMetrics): Record<string, string> {
  const p = theme.palette
  const t = metrics.type
  const radius = DOC_RADIUS_PX[theme.radius] ?? 0
  const heading = theme.fonts.heading as DocFontId
  const headingInfo = DOC_FONTS[heading]
  const rule = theme.rules === 'none' ? 'transparent' : p.rule
  const ruleWidth = theme.rules === 'strong' ? '0.45mm' : '0.2mm'
  const accentFill = theme.accentUsage === 'bands' || theme.accentUsage === 'bold'
  return {
    '--c-paper': p.paper,
    '--c-surface': p.surface,
    '--c-ink': p.ink,
    '--c-muted': p.muted,
    '--c-rule': rule,
    '--c-rule-soft': theme.rules === 'none' ? mix(p.rule, p.paper, 0.4) : mix(p.rule, p.paper, 0.35),
    '--c-rule-w': ruleWidth,
    '--c-accent': p.accent,
    '--c-on-accent': p.onAccent,
    '--c-accent-soft': mix(p.accent, p.paper, 0.9),
    '--c-accent-line': mix(p.accent, p.paper, 0.6),
    '--c-strong': p.strong,
    '--c-on-strong': p.onStrong,
    '--c-on-strong-muted': mix(p.onStrong, p.strong, 0.3),
    '--c-heading': theme.accentUsage === 'minimal' ? p.ink : theme.accentUsage === 'headings' ? p.accent : p.ink,
    '--c-kicker': theme.accentUsage === 'minimal' ? p.muted : p.accent,
    '--c-band': accentFill ? p.accent : p.surface,
    '--c-on-band': accentFill ? p.onAccent : p.ink,
    '--c-well': mix(p.surface, p.paper, 0.35),
    '--c-ink-on-paper': readableOn(p.paper, p.ink, p.paper),
    '--f-heading': fontStack(heading),
    '--f-body': fontStack(theme.fonts.body as DocFontId),
    '--f-mono': fontStack(theme.fonts.body as DocFontId),
    '--w-heading': String(theme.headingWeight),
    '--w-strong': headingInfo.category === 'serif' ? '600' : String(Math.max(600, Math.min(700, theme.headingWeight))),
    '--tracking-heading': headingInfo.category === 'serif' ? '-0.01em' : theme.headingWeight >= 700 ? '-0.025em' : '-0.018em',
    '--label-case': theme.labelCase === 'uppercase' ? 'uppercase' : 'none',
    '--label-tracking': theme.labelCase === 'uppercase' ? '0.08em' : '0',
    '--r': `${radius}px`,
    '--r-sm': `${Math.min(radius, 2)}px`,
    '--u': `${metrics.u}mm`,
    '--lh': String(metrics.leading),
    '--t-micro': `${t.micro}pt`,
    '--t-small': `${t.small}pt`,
    '--t-base': `${t.base}pt`,
    '--t-h3': `${t.h3}pt`,
    '--t-h2': `${t.h2}pt`,
    '--t-h1': `${t.h1}pt`,
    '--t-display': `${t.display}pt`,
    '--page-w': `${metrics.page.width}mm`,
    '--page-h': `${metrics.page.height}mm`,
    '--m-top': `${metrics.margin.top}mm`,
    '--m-right': `${metrics.margin.right}mm`,
    '--m-bottom': `${metrics.margin.bottom}mm`,
    '--m-left': `${metrics.margin.left}mm`,
    '--header-h': `${HEADER_MM}mm`,
    '--header-gap': `${HEADER_GAP_MM}mm`,
    '--footer-h': `${FOOTER_MM}mm`,
    '--footer-gap': `${FOOTER_GAP_MM}mm`,
    '--img-filter': theme.imageTreatment === 'monochrome' ? 'grayscale(1)' : 'none',
  }
}

/** Serializa las variables (con escape defensivo: los valores ya son de confianza). */
export function cssVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v.replace(/[;{}<>]/g, '')}`)
    .join(';')
}
