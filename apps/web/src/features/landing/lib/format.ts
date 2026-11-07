/**
 * Formato de cifras de la landing en el idioma de la página. Los precios de la landing (planes y
 * catálogo de ejemplo) están en pesos chilenos: la moneda es siempre CLP, cambie o no el idioma
 * (elegir portugués no convierte precios a reales). En español la salida es la de siempre
 * («$1.234.567», «1.200 × 1.500 mm»).
 *
 * Son funciones sin hooks: los componentes que las usan llaman a `useT` y se vuelven a dibujar al
 * cambiar el idioma.
 */
import { intlTag } from '@dekopen/shared'
import { getFormatter, getLocale } from '../../../lib/i18n'

const CURRENCY = 'CLP'

const fmt = () => getFormatter({ currency: CURRENCY })

/** Pesos chilenos: 1234567 → «$1.234.567» (en: «CLP 1,234,567»). */
export function formatClp(value: number): string {
  return fmt().money(value)
}

/** Medida en mm sin unidad, hasta 1 decimal: 554.5 → «554,5»; 1199 → «1.199». */
export function formatMm(value: number): string {
  return fmt().mm(value)
}

/** Ancho × alto con unidad: «1.200 × 1.500 mm». */
export function formatSize(width: number, height: number): string {
  return fmt().size(width, height)
}

/** Superficie: «2,16 m²». */
export function formatArea(m2: number): string {
  return fmt().area(m2)
}

/** Entero con separador de miles: 1234567 → «1.234.567». */
export function formatInt(value: number): string {
  return fmt().number(Math.round(value))
}

/** Decimales fijos (las cifras que ruedan no cambian de ancho): 96.14 → «96,1»; 96 → «96,0». */
export function formatDecimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return fmt().number(0)
  return fmt().number(value, { minDecimals: decimals, maxDecimals: decimals })
}

/** Porcentaje con decimales fijos: 96.13 → «96,1 %» (en: «96.1%», tr: «%96,1»). */
export function formatPct(value: number, decimals = 1): string {
  const locale = getLocale()
  if (locale === 'es') return `${formatDecimal(value, decimals)} %`
  const v = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(intlTag(locale), { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v / 100)
}

/** Un número escrito por el visitante («1.200», «1,200», «1 200», «1200,5», «1200.5»). */
function readNumber(part: string | undefined): number | null {
  if (!part) return null
  const text = part.replace(/[\s  ]/g, '')
  if (!text) return null
  let normalized: string
  if (/^\d{1,3}([.,']\d{3})+$/.test(text)) {
    // Separadores de miles («1.200», «1,200», «1'200»): se ignoran.
    normalized = text.replace(/[.,']/g, '')
  } else if (/^\d+[.,]\d+$/.test(text)) {
    // Un solo separador seguido de 1–2 cifras (o más de 3): decimal, venga con coma o con punto.
    normalized = text.replace(',', '.')
  } else {
    normalized = text
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/**
 * Interpreta lo que escribe el visitante en un campo de medida, en cualquier idioma. Acepta
 * «1200», «1.200», «1,200», «1200 mm» y también «1200x1500» (devuelve ambas medidas).
 */
export function parseMeasure(raw: string): { first: number | null; second: number | null } {
  const text = raw.toLowerCase().replace(/mm/g, '').trim()
  const parts = text.split(/[x×*]/)
  return { first: readNumber(parts[0]), second: parts.length > 1 ? readNumber(parts[1]) : null }
}

/** Número de documento: «N° 413» (en: «No. 413», de: «Nr. 413»). */
export function formatDocNumber(value: number): string {
  return fmt().docNumber(value)
}

/** Fecha larga: «31 de octubre de 2026» (en: «October 31, 2026»). */
export function formatLongDate(iso: string): string {
  return fmt().date(iso, 'long')
}
