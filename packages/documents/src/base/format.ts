/**
 * Formato chileno determinista (no depende del ICU del entorno): miles con punto,
 * decimales con coma, peso sin espacio ($1.234.567), unidades siempre visibles.
 */

const NBSP = ' '
const MINUS = '−'

/** 1234567.8 → "1.234.567,8" con `decimals` fijos (por defecto 0). */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0'
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(decimals)
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const body = frac ? `${grouped},${frac}` : grouped
  return negative && Number(fixed) !== 0 ? `${MINUS}${body}` : body
}

/** Pesos chilenos enteros: 1234567 → "$1.234.567"; negativos con signo menos tipográfico. */
export function formatClp(value: number): string {
  const rounded = Math.round(value)
  const body = formatNumber(Math.abs(rounded))
  return rounded < 0 ? `${MINUS}$${body}` : `$${body}`
}

/** Milímetros con resolución 0,1: 1200 → "1.200", 596.5 → "596,5". */
export function formatMm(value: number): string {
  const tenth = Math.round(value * 10) / 10
  return formatNumber(tenth, Number.isInteger(tenth) ? 0 : 1)
}

/** "1.200 × 1.500 mm" */
export function formatMeasure(width: number, height: number): string {
  return `${formatMm(width)}${NBSP}×${NBSP}${formatMm(height)}${NBSP}mm`
}

/** m² con 2 decimales: 1.9174 → "1,92 m²". */
export function formatArea(m2: number, decimals = 2): string {
  return `${formatNumber(m2, decimals)}${NBSP}m²`
}

/** Porcentaje con espacio fino de norma: 19 → "19 %", 12.5 → "12,5 %". */
export function formatPct(value: number): string {
  const decimals = Number.isInteger(value) ? 0 : 1
  return `${formatNumber(value, decimals)}${NBSP}%`
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Lee "2026-10-31" o un ISO completo sin depender de la zona horaria del servidor. */
export function parseDate(value: string | Date | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() }
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

/** "31 de octubre de 2026" */
export function formatDateLong(value: string | Date | undefined): string {
  const p = parseDate(value)
  if (!p) return ''
  return `${p.d} de ${MONTHS[p.m - 1]} de ${p.y}`
}

/** "31-10-2026" */
export function formatDateShort(value: string | Date | undefined): string {
  const p = parseDate(value)
  if (!p) return ''
  return `${String(p.d).padStart(2, '0')}-${String(p.m).padStart(2, '0')}-${p.y}`
}

/** Suma días a una fecha ISO (yyyy-mm-dd) y devuelve yyyy-mm-dd. */
export function addDays(value: string | Date, days: number): string {
  const p = parseDate(value)
  if (!p) return ''
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d + days))
  return date.toISOString().slice(0, 10)
}

/** Revisión enviada → letra: 1 → "A", 2 → "B"… 0 (borrador) → "". */
export function revisionLetter(revision: number): string {
  if (!revision || revision < 1) return ''
  let n = Math.floor(revision)
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** "Cotización N° 412" o "Cotización N° 412 · Revisión B" (la A no se anuncia). */
export function quoteLabel(number: number, revision = 0): string {
  const base = `Cotización N°${NBSP}${number}`
  return revision >= 2 ? `${base} · Revisión ${revisionLetter(revision)}` : base
}

/** Une partes no vacías con " · ". */
export function joinParts(parts: (string | false | null | undefined)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(sep)
}

/** Iniciales para monogramas: "Ventanas del Sur" → "VS". */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(de|del|la|las|los|y|e|el|spa|ltda|limitada|sa)$/i.test(w))
  if (words.length === 0) return name.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
