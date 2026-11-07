/**
 * Textos humanos del catálogo (nunca códigos internos): estado de los datos de una línea o
 * marca, tipo de marca, familias de descuento y la fuente de una línea. Todo se traduce al
 * llamarlo (idioma actual de la interfaz); los términos del rubro salen del glosario.
 */
import type { Brand, BrandSettings, Line } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { initials } from '../../../lib/format'
import { getFormatter, translate } from '../../../lib/i18n'
import type { BadgeTone } from '../../../ui'
import es from '../i18n/es'

export type Completeness = 'verified' | 'complete' | 'partial' | 'none'

export interface StateCopy {
  label: string
  tone: BadgeTone
  help: string
}

const COMPLETENESS_TONE: Record<Completeness, BadgeTone> = { verified: 'ok', complete: 'ok', partial: 'warn', none: 'neutral' }

/** Estado de los datos de una marca o línea en palabras («Lista para cotizar», «Cotiza con avisos»…). */
export function completenessCopy(value: Completeness, locale?: Locale): StateCopy {
  return {
    label: translate(es, `completeness.${value}.label`, undefined, locale),
    tone: COMPLETENESS_TONE[value],
    help: translate(es, `completeness.${value}.help`, undefined, locale),
  }
}

/** «Solo medidas»: la marca trae líneas, pero ningún precio. */
export function geometryOnlyCopy(locale?: Locale): StateCopy {
  return {
    label: translate(es, 'completeness.geometry.label', undefined, locale),
    tone: 'neutral',
    help: translate(es, 'completeness.geometry.help', undefined, locale),
  }
}

/** Estado de una marca en palabras, con los conteos que entrega el servidor. */
export function brandStateCopy(summary: { completeness: Completeness; counts: { lines: number; priced: number } }, locale?: Locale): StateCopy {
  if (summary.completeness !== 'none' && summary.counts.lines > 0 && summary.counts.priced === 0) return geometryOnlyCopy(locale)
  return completenessCopy(summary.completeness, locale)
}

export function lineCompleteness(line: Pick<Line, 'completeness'>): Completeness {
  return line.completeness ?? 'partial'
}

export function brandKindLabel(kind: Brand['kind'], locale?: Locale): string {
  return translate(es, `brandKind.${kind}`, undefined, locale)
}

export type DiscountFamily = keyof BrandSettings['discounts']

/** Familias de descuento de compra, en el orden en que se muestran. */
export const DISCOUNT_FAMILIES: readonly DiscountFamily[] = ['profiles', 'reinforcement', 'hardware', 'glass', 'accessories']

export function discountFamilyCopy(key: DiscountFamily, locale?: Locale): { label: string; help: string } {
  return { label: translate(es, `discount.${key}.label`, undefined, locale), help: translate(es, `discount.${key}.help`, undefined, locale) }
}

/**
 * Fuente de datos de una línea en una frase corta, en español canónico («Pauta de la
 * distribuidora · lista del 31-10-2026»). Nunca cita la orden de trabajo de un tercero ni el nombre
 * anterior del producto.
 */
export function sourceSentence(line: Pick<Line, 'source'>): string | null {
  const source = line.source?.trim()
  if (!source) return null
  return (
    source
      .replace(/^plantilla genérica$/i, 'Plantilla típica de DEKOPEN')
      // Catálogos generados antes citaban la orden de trabajo de un tercero («+ OT N° 385 …»):
      // el taller solo ve que DEKOPEN verificó la pauta.
      .replace(/\s*\+\s*OT N° ?\d+\s*\(un caso verificado\)/i, ', verificada por DEKOPEN en una ventana real')
      .replace(/\s*\+\s*OT N° ?\d+[^·]*?(?=\s*(?:·|$))/i, ', verificada por DEKOPEN')
      // Catálogos generados antes del cambio de nombre.
      .replace(/\bFramezen\b/g, 'DEKOPEN')
      .replace(/\s+·\s+/g, ' · ')
  )
}

const SEGMENT_PATTERNS: { re: RegExp; render: (m: RegExpMatchArray, locale: Locale) => string }[] = [
  { re: /^plantilla típica de dekopen$/i, render: (_m, l) => translate(es, 'source.generic', undefined, l) },
  {
    re: /^pauta de la distribuidora \((\d+) productos?; variante ([^)]+)\)$/i,
    render: (m, l) => translate(es, 'source.distributorVariant', { count: Number(m[1]), variant: m[2] }, l),
  },
  { re: /^pauta de la distribuidora \((\d+) productos?\)$/i, render: (m, l) => translate(es, 'source.distributorProducts', { count: Number(m[1]) }, l) },
  { re: /^pauta de la distribuidora$/i, render: (_m, l) => translate(es, 'source.distributor', undefined, l) },
  { re: /^pauta típica de practicable: revisar con el fabricante$/i, render: (_m, l) => translate(es, 'source.typicalCasement', undefined, l) },
  { re: /^pauta típica de corredera: revisar con el fabricante$/i, render: (_m, l) => translate(es, 'source.typicalSliding', undefined, l) },
  { re: /^lista de precios del (\d{2})-(\d{2})-(\d{4})$/i, render: (m, l) => translate(es, 'source.priceList', { date: sourceDate(m, l) }, l) },
  { re: /^lista del (\d{2})-(\d{2})-(\d{4})$/i, render: (m, l) => translate(es, 'source.list', { date: sourceDate(m, l) }, l) },
  { re: /^verificada por dekopen en una ventana real$/i, render: (_m, l) => translate(es, 'source.verifiedReal', undefined, l) },
  { re: /^verificada por dekopen$/i, render: (_m, l) => translate(es, 'source.verified', undefined, l) },
]

function sourceDate(m: RegExpMatchArray, locale: Locale): string {
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // Mediodía UTC: la fecha no cambia de día en ninguna zona horaria.
  return getFormatter({ locale }).date(new Date(Date.UTC(year, month - 1, day, 12)))
}

function localizeSegment(segment: string, locale: Locale): string {
  const text = segment.trim()
  for (const pattern of SEGMENT_PATTERNS) {
    const m = text.match(pattern.re)
    if (m) return pattern.render(m, locale)
  }
  // «Pauta de la distribuidora, verificada por DEKOPEN»: dos frases conocidas unidas por coma.
  const comma = text.indexOf(', ')
  if (comma > 0) {
    const head = localizeSegment(text.slice(0, comma), locale)
    const tail = localizeSegment(text.slice(comma + 2), locale)
    if (head !== text.slice(0, comma) || tail !== text.slice(comma + 2)) return `${head}, ${tail}`
  }
  // Texto propio de quien armó el catálogo: es dato y se muestra tal cual.
  return text
}

/**
 * La fuente de una línea en el idioma de la interfaz: reconoce las frases que escribe el importador
 * y deja tal cual lo que no conoce (texto del fabricante). En español es `sourceSentence` sin cambios.
 */
export function localizedSourceSentence(line: Pick<Line, 'source'>, locale: Locale): string | null {
  const canonical = sourceSentence(line)
  if (!canonical || locale === 'es') return canonical
  return canonical
    .split(' · ')
    .map((segment) => localizeSegment(segment, locale))
    .join(' · ')
}

/**
 * Iniciales de la marca: su monograma o las de su nombre. Con `siblings` (las marcas de la lista,
 * en orden de prioridad: ver `monogramOrder`) no repite iniciales: si «Winhouse» ya es «WI», «Winsa»
 * pasa a «WA». El importador pone a cada marca las dos primeras letras como monograma, así que esos
 * también se desempatan.
 */
export function monogramText(
  brand: Pick<Brand, 'name' | 'monogram'> & { id?: string },
  siblings?: readonly Pick<Brand, 'id' | 'name' | 'monogram'>[],
): string {
  if (!siblings || !brand.id) return baseMonogram(brand)
  const taken = new Set<string>()
  for (const b of siblings) {
    const base = baseMonogram(b)
    const mono = taken.has(base) ? initials(b.name, { avoid: taken }) : base
    if (b.id === brand.id) return mono
    taken.add(mono)
  }
  return baseMonogram(brand)
}

/**
 * Orden estable para `monogramText`: las marcas activas primero (conservan sus iniciales y así
 * coinciden con la pestaña Líneas, que solo ve las activas) y luego el resto, cada grupo por id.
 */
export function monogramOrder<T extends Pick<Brand, 'id'>>(brands: readonly T[], isEnabled: (brand: T) => boolean = () => true): T[] {
  const byId = (a: T, b: T) => a.id.localeCompare(b.id)
  return [...brands.filter(isEnabled).sort(byId), ...brands.filter((b) => !isEnabled(b)).sort(byId)]
}

function baseMonogram(brand: Pick<Brand, 'name' | 'monogram'>): string {
  const own = brand.monogram?.trim()
  if (own) return own.slice(0, 2).toUpperCase()
  const words = brand.name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? '·').slice(0, 2).toUpperCase()
}
