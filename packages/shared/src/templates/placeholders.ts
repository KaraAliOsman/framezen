/**
 * Marcadores permitidos en los textos de plantilla (`{client.name}`, `{quote.number}`…).
 *
 * Son nombres cerrados, no expresiones: el renderizador los reemplaza por datos del documento como
 * texto plano (nunca HTML) y no hay recorrido arbitrario de propiedades, funciones ni fórmulas.
 * Deliberadamente NO hay marcadores de dinero (total, subtotal, IVA): los montos sólo salen del motor
 * a través de las secciones `items`/`totals`/`payment`.
 */
import type { DocTemplateKind } from './kinds'

export const PLACEHOLDER_KEYS = [
  'client.name',
  'client.taxId',
  'client.email',
  'client.phone',
  'client.address',
  'client.city',
  'quote.number',
  'quote.title',
  'quote.revision',
  'quote.date',
  'quote.validUntil',
  'quote.validityDays',
  'quote.units',
  'org.name',
  'org.legalName',
  'org.taxId',
  'org.phone',
  'org.email',
  'org.website',
  'org.address',
  'org.city',
  'seller.name',
  'catalog.title',
  'catalog.date',
] as const

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number]

const PLACEHOLDER_SET: ReadonlySet<string> = new Set(PLACEHOLDER_KEYS)

/** Documentos en los que cada marcador tiene datos. */
export function placeholderKinds(key: PlaceholderKey): readonly DocTemplateKind[] {
  if (key.startsWith('org.')) return ['quote', 'catalog']
  if (key.startsWith('catalog.')) return ['catalog']
  return ['quote']
}

export function isPlaceholderKey(value: unknown): value is PlaceholderKey {
  return typeof value === 'string' && PLACEHOLDER_SET.has(value)
}

export function placeholderAllowed(key: PlaceholderKey, kind: DocTemplateKind): boolean {
  return placeholderKinds(key).includes(kind)
}

/** Placeholders válidos para un tipo de documento (orden estable, para la UI y el prompt). */
export function placeholdersFor(kind: DocTemplateKind): PlaceholderKey[] {
  return PLACEHOLDER_KEYS.filter((key) => placeholderAllowed(key, kind))
}

export type TextSegment = { type: 'text'; text: string } | { type: 'placeholder'; key: PlaceholderKey }

const TOKEN = /\{([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*)\}/g

/**
 * Divide un texto plano en segmentos de texto y marcadores conocidos. Los `{…}` desconocidos quedan
 * como texto literal (el renderizador nunca los evalúa). Úsalo para pintar textos con marcadores.
 */
export function splitPlaceholders(text: string): TextSegment[] {
  const out: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const key = match[1]
    if (!isPlaceholderKey(key)) continue
    const start = match.index ?? 0
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) })
    out.push({ type: 'placeholder', key })
    last = start + match[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/** Marcadores conocidos usados en un texto. */
export function placeholdersIn(text: string): PlaceholderKey[] {
  return splitPlaceholders(text).flatMap((s) => (s.type === 'placeholder' ? [s.key] : []))
}

/**
 * Llaves `{…}` que no son marcadores conocidos (o llaves sueltas). Devuelve los fragmentos
 * problemáticos, vacío si el texto es correcto.
 */
export function invalidBraces(text: string): string[] {
  if (!text.includes('{') && !text.includes('}')) return []
  const stripped = text.replace(TOKEN, (whole, key: string) => (isPlaceholderKey(key) ? '' : whole))
  const bad: string[] = []
  const re = /\{[^{}]{0,60}\}|[{}]/g
  for (const m of stripped.matchAll(re)) bad.push(m[0])
  return bad
}

/**
 * Reemplaza los marcadores por valores ya formateados (texto plano). Lo que no tenga valor queda
 * vacío. Pensado para vistas previas, resúmenes y correos; el PDF usa `splitPlaceholders`.
 */
export function fillPlaceholders(text: string, values: Partial<Record<PlaceholderKey, string>>): string {
  return splitPlaceholders(text)
    .map((s) => (s.type === 'text' ? s.text : (values[s.key] ?? '')))
    .join('')
}
