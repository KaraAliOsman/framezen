/**
 * Formatos humanos de DEKOPEN (SPEC §1.7): CLP `$1.234.567`, medidas `1.200 × 1.500 mm`.
 * Las cifras de dominio salen del motor (misma fuente que documentos y servidor); aquí solo
 * agregamos utilidades propias de la interfaz (fechas, iniciales, búsqueda).
 *
 * Idioma (plan v5 §4.B):
 * - Fechas, tiempo relativo y número de documento siguen al idioma de la interfaz (solo se muestran).
 * - Dinero, números y medidas de este archivo son **español de Chile deterministas**: muchos campos
 *   los vuelven a leer con un intérprete que espera coma decimal. Para mostrar en el idioma de la
 *   persona y con la moneda de la empresa usa `useFormat()` / `getFormatter()` de `lib/i18n`.
 */
import { formatDate as formatDateL, formatDocNumber as formatDocNumberL, formatRelative as formatRelativeL } from '@dekopen/shared'
import { getLocale } from './i18n/runtime'

export { formatCLP, formatMM, formatSize, formatArea, formatPct, formatMeters } from '@dekopen/engine'

const MINUS = '−'

/** Agrupa miles con punto, sin depender del ICU del navegador. */
function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Número con punto de miles y coma decimal (hasta `decimals`, sin ceros sobrantes). */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0'
  const factor = 10 ** decimals
  const rounded = Math.round(Math.abs(value) * factor) / factor
  const [int, frac = ''] = rounded.toFixed(decimals).split('.')
  const trimmed = frac.replace(/0+$/, '')
  const sign = value < 0 && rounded !== 0 ? MINUS : ''
  return `${sign}${groupThousands(int)}${trimmed ? `,${trimmed}` : ''}`
}

/** Medida con unidad: `1.200 mm`, `1.249,5 mm` (formatMM del motor no lleva unidad). */
export function formatMMUnit(mm: number): string {
  return `${formatNumber(mm, 1)} mm`
}

/** «N° 412» para cotizaciones y OT («No. 412» en inglés, «Nr. 412» en alemán…). */
export function formatDocNumber(n: number): string {
  return formatDocNumberL(n, { locale: getLocale() })
}

/** Letra de revisión: 1 → A, 2 → B… (0 = sin enviar → ''). */
export function revisionLetter(revision: number): string {
  if (revision <= 0) return ''
  let n = revision
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** Fecha corta en hora de Chile, en el idioma de la interfaz: `31-10-2026` (es), `10/31/2026` (en). */
export function formatDate(input: string | number | Date): string {
  return formatDateL(input, { locale: getLocale() })
}

/** Fecha larga: «31 de octubre de 2026» / «October 31, 2026» / «31. Oktober 2026». */
export function formatLongDate(input: string | number | Date): string {
  return formatDateL(input, { locale: getLocale(), style: 'long' })
}

/**
 * Relativa para listas: «hace un momento», «hace 5 min», «hace 2 h», «ayer», «hace 3 días»; luego la
 * fecha. En otros idiomas, con `Intl.RelativeTimeFormat` («5 min. ago», «gestern»).
 */
export function formatRelative(input: string | number | Date, now: Date = new Date()): string {
  return formatRelativeL(input, { locale: getLocale(), now })
}

/** Sufijos societarios que no cuentan para las iniciales («Constructora Los Aromos SpA» → «CA»). */
const LEGAL_SUFFIXES = new Set(['spa', 'ltda', 'limitada', 'sa', 'sac', 'eirl', 'srl', 'cia', 'compania', 'hnos', 'hermanos'])

/** Palabras significativas de un nombre: sin signos, sin sufijos legales al final ni palabras de una letra. */
function nameWords(name: string): string[] {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  const key = (w: string) => normalizeSearch(w)
  // Solo al final: «Spa Los Aromos» es un spa, «Los Aromos SpA» es la sociedad.
  while (words.length > 1 && LEGAL_SUFFIXES.has(key(words[words.length - 1]))) words.pop()
  const meaningful = words.filter((w) => [...w].length > 1)
  return meaningful.length > 0 ? meaningful : words
}

/** Candidatas a iniciales, de la preferida a las alternativas para desempatar. */
function initialsCandidates(name: string): string[] {
  const words = nameWords(name)
  if (words.length === 0) return ['·']
  const first = [...words[0]]
  const out: string[] = []
  if (words.length > 1) {
    out.push(first[0] + [...words[words.length - 1]][0])
    for (const w of words.slice(1, -1)) out.push(first[0] + [...w][0])
  }
  // Una sola palabra (o para desempatar): la primera letra con cada letra siguiente, empezando por la última.
  const rest = [...words.join('')].slice(1)
  if (rest.length > 0) out.push(first[0] + rest[0], first[0] + rest[rest.length - 1], ...rest.slice(1, -1).map((c) => first[0] + c))
  if (out.length === 0) out.push(first[0])
  return [...new Set(out.map((s) => s.toLocaleUpperCase('es-CL')))]
}

export interface InitialsOptions {
  /** Iniciales ya usadas por otros (p. ej. otras marcas en la misma lista): se elige otra combinación. */
  avoid?: Iterable<string>
}

/**
 * Iniciales para avatares: «Ana Pérez» → «AP», «Camila» → «CA», «Constructora Los Aromos SpA» →
 * «CA» (sin el sufijo legal ni palabras de una letra). Con `avoid`, desempata: si «Winhouse» ya es
 * «WI», «Winsa» pasa a «WA».
 */
export function initials(name: string, { avoid }: InitialsOptions = {}): string {
  const candidates = initialsCandidates(name)
  if (!avoid) return candidates[0]
  const taken = new Set([...avoid].map((s) => s.toLocaleUpperCase('es-CL')))
  return candidates.find((c) => !taken.has(c)) ?? candidates[0]
}

/** Iniciales distintas para una lista (marcas, equipo): la primera conserva las suyas y las demás desempatan. */
export function distinctInitials(names: readonly string[]): string[] {
  const taken = new Set<string>()
  return names.map((name) => {
    const value = initials(name, { avoid: taken })
    taken.add(value)
    return value
  })
}

/**
 * Normaliza para búsquedas tolerantes a tildes y mayúsculas, en cualquier idioma: también pliega la
 * i sin punto del turco («kapı» → «kapi», «İ» → «i») y las ligaduras («weiß» → «weiss», «œ» → «oe»).
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .trim()
}

/** Primer nombre para saludos. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}
