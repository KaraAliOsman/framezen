/**
 * Formato de cifras para documentos de taller (español de Chile).
 * Miles con punto, decimales con coma, unidades siempre visibles.
 * No usamos Intl: «es» no agrupa los números de 4 cifras (1200 → «1200») y en el
 * taller queremos siempre «1.200».
 */

const NBSP = ' '
const MINUS = '−'

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Número con `decimals` decimales fijos: 1234.5 → «1.234,5». */
export function fmtNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—'
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const body = groupThousands(intPart ?? '0') + (decPart ? `,${decPart}` : '')
  return negative && Number(fixed) !== 0 ? `${MINUS}${body}` : body
}

/** Entero con separador de miles: 1475 → «1.475». */
export function fmtInt(value: number): string {
  return fmtNumber(Math.round(value), 0)
}

/** Redondea a la resolución del motor (0,1 mm) evitando errores de coma flotante. */
export function roundTenth(value: number): number {
  return Math.round(value * 10 + Number.EPSILON * 10) / 10
}

/**
 * Medida en mm a 0,1 mm, sin decimal si es exacta: 2246 → «2.246», 554.5 → «554,5».
 * `fixed: true` fuerza siempre un decimal («917,0»).
 */
export function fmtMm(value: number, opts: { fixed?: boolean } = {}): string {
  const r = roundTenth(value)
  if (opts.fixed) return fmtNumber(r, 1)
  return Number.isInteger(r) ? fmtNumber(r, 0) : fmtNumber(r, 1)
}

/**
 * Vidrios: redondeo HACIA ABAJO al 0,5 mm (nunca hacia arriba: un vidrio más
 * grande que la luz no entra). 603,5 → 603,5 · 365,9 → 365,5 · 767,4 → 767,0.
 */
export function floorHalfMm(value: number): number {
  return Math.floor(roundTenth(value) * 2 + 1e-9) / 2
}

/** Medida de vidrio con un decimal fijo, ya redondeada hacia abajo al 0,5 mm. */
export function fmtGlassMm(value: number): string {
  return fmtNumber(floorHalfMm(value), 1)
}

/** Pesos chilenos: 1234567 → «$1.234.567». */
export function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  const body = `$${groupThousands(String(Math.abs(rounded)))}`
  return rounded < 0 ? `${MINUS}${body}` : body
}

/** Porcentaje: 85 → «85,0 %». */
export function fmtPct(value: number, decimals = 1): string {
  return `${fmtNumber(value, decimals)}${NBSP}%`
}

/** Superficie: 1.6197 → «1,62 m²». */
export function fmtM2(value: number, decimals = 2): string {
  return `${fmtNumber(value, decimals)}${NBSP}m²`
}

/** Metros lineales: 17.45 → «17,45 m». */
export function fmtMeters(value: number, decimals = 2): string {
  return `${fmtNumber(value, decimals)}${NBSP}m`
}

/** Ángulo de corte: 45 → «45°», 58.28 → «58,3°». */
export function fmtAngle(value: number): string {
  const r = Math.round(value * 10) / 10
  return `${Number.isInteger(r) ? fmtNumber(r, 0) : fmtNumber(r, 1)}°`
}

/** Cantidad de compra: entera sin decimales, fraccionaria con hasta 2. */
export function fmtQty(value: number): string {
  const r = Math.round(value * 100) / 100
  if (Number.isInteger(r)) return fmtInt(r)
  const text = fmtNumber(r, 2)
  return text.endsWith('0') ? text.slice(0, -1) : text
}

/** Medidas de una ventana: «1.200 × 1.500 mm». */
export function fmtSize(width: number, height: number): string {
  return `${fmtMm(width)} × ${fmtMm(height)}${NBSP}mm`
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

/**
 * Fecha larga desde ISO («2026-10-31» o «2026-10-31T12:00:00Z») → «31 de octubre de 2026».
 * Lee año/mes/día del texto para no correr la fecha por zona horaria.
 */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return iso
  return `${Number(m[3])} de ${month} de ${m[1]}`
}

/** Fecha corta: «31-10-2026». */
export function fmtShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/** Plural simple en español: plural(2, 'barra') → «2 barras». */
export function plural(n: number, singular: string, pluralForm?: string): string {
  const word = n === 1 ? singular : (pluralForm ?? `${singular}s`)
  return `${fmtQty(n)} ${word}`
}
