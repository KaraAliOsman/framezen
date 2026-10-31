/**
 * Formato de cifras de la landing. Los formatos de dominio salen del motor (la
 * misma fuente que la app, los documentos y el servidor); aquí solo agregamos
 * decimales fijos para cifras que ruedan (así no cambian de ancho) y la lectura
 * de medidas escritas por el visitante.
 */
import { formatArea, formatCLP, formatMM, formatSize } from '@framezen/engine'

export { formatArea, formatSize }

/** Pesos chilenos: 1234567 → «$1.234.567». */
export const formatClp = formatCLP

/** Medida en mm sin unidad, hasta 1 decimal: 554.5 → «554,5»; 1199 → «1.199». */
export const formatMm = formatMM

/** Entero con separador de miles: 1234567 → «1.234.567». */
export function formatInt(value: number): string {
  return formatMM(Math.round(value))
}

/** Decimales fijos con coma: 96.14 → «96,1»; 96 → «96,0». */
export function formatDecimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0'
  const fixed = Math.abs(value).toFixed(decimals)
  const [int, frac] = fixed.split('.')
  const body = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (frac ? ',' + frac : '')
  return value < 0 && Number(fixed) !== 0 ? '−' + body : body
}

/** Porcentaje con decimales fijos: 96.13 → «96,1 %». */
export function formatPct(value: number, decimals = 1): string {
  return `${formatDecimal(value, decimals)} %`
}

/**
 * Interpreta lo que escribe el visitante en un campo de medida. Acepta «1200»,
 * «1.200», «1200 mm» y también «1200x1500» (devuelve ambas medidas).
 */
export function parseMeasure(raw: string): { first: number | null; second: number | null } {
  const text = raw.toLowerCase().replace(/mm/g, '').replace(/\s+/g, '')
  const parts = text.split(/[x×*]/)
  const toNumber = (part: string | undefined): number | null => {
    if (!part) return null
    // «1.200» y «1200» son lo mismo; «1200,5» usa coma decimal.
    const normalized = part.replace(/\./g, '').replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null
    const value = Number(normalized)
    return Number.isFinite(value) ? value : null
  }
  return { first: toNumber(parts[0]), second: parts.length > 1 ? toNumber(parts[1]) : null }
}
