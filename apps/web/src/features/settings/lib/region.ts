/**
 * Idioma y región: monedas sugeridas, nombres en el idioma de la interfaz y etiquetas de impuesto
 * habituales. La moneda solo cambia cómo se escriben los montos: nunca convierte precios.
 */
import { intlTag, LOCALE_META, type Locale } from '@dekopen/shared'
import { useSession } from '../../../lib/auth'
import { usePlan } from '../../../lib/plan'

/** Monedas de los mercados de DEKOPEN primero (Chile y LatAm), luego las de los idiomas de la app. */
export const SUGGESTED_CURRENCIES = ['CLP', 'USD', 'EUR', 'BRL', 'MXN', 'ARS', 'PEN', 'COP', 'UYU', 'BOB', 'PYG', 'CRC', 'GTQ', 'DOP', 'GBP', 'CHF', 'TRY', 'CAD'] as const

/** Lista para el selector: las sugeridas más la actual si es otra (nunca se pierde lo guardado). */
export function currencyChoices(current: string | undefined): string[] {
  const list: string[] = [...SUGGESTED_CURRENCIES]
  const code = current?.toUpperCase()
  if (code && /^[A-Z]{3}$/.test(code) && !list.includes(code)) list.unshift(code)
  return list
}

const displayCache = new Map<string, Intl.DisplayNames | null>()

function displayNames(locale: Locale, type: 'currency' | 'language'): Intl.DisplayNames | null {
  const key = `${locale}:${type}`
  if (!displayCache.has(key)) {
    try {
      displayCache.set(key, new Intl.DisplayNames([intlTag(locale)], { type }))
    } catch {
      displayCache.set(key, null)
    }
  }
  return displayCache.get(key) ?? null
}

/** «Peso chileno», «US dollar», «Euro»… (o el código si el navegador no sabe el nombre). */
export function currencyName(code: string, locale: Locale): string {
  try {
    return displayNames(locale, 'currency')?.of(code) ?? code
  } catch {
    return code
  }
}

/** Nombre de un idioma de la app escrito en el idioma de la interfaz («Inglés», «English»…). */
export function languageName(target: Locale, inLocale: Locale): string {
  try {
    const name = displayNames(inLocale, 'language')?.of(LOCALE_META[target].intl.split('-')[0] ?? target)
    if (!name) return LOCALE_META[target].label
    return name.charAt(0).toLocaleUpperCase(intlTag(inLocale)) + name.slice(1)
  } catch {
    return LOCALE_META[target].label
  }
}

/** Nombres de impuesto comunes (texto libre: cada empresa escribe el suyo). */
export const TAX_LABEL_SUGGESTIONS = ['IVA', 'IGV', 'VAT', 'TVA', 'MwSt.', 'KDV', 'GST', 'Sales tax'] as const

/** Tasa habitual del impuesto según la moneda (solo para sugerir; nunca se aplica sola). */
export const USUAL_TAX_BY_CURRENCY: Partial<Record<string, { label: string; pct: number }>> = {
  CLP: { label: 'IVA', pct: 19 },
  PEN: { label: 'IGV', pct: 18 },
  ARS: { label: 'IVA', pct: 21 },
  COP: { label: 'IVA', pct: 19 },
  MXN: { label: 'IVA', pct: 16 },
  UYU: { label: 'IVA', pct: 22 },
  TRY: { label: 'KDV', pct: 20 },
  CHF: { label: 'MwSt.', pct: 8.1 },
  GBP: { label: 'VAT', pct: 20 },
}

/**
 * Quién puede cambiar los ajustes de la empresa (mismo criterio que el servidor, `requireManager`):
 * el dueño, o cualquiera si el plan no tiene roles.
 */
export function useCanManageSettings(): boolean {
  const me = useSession()
  const plan = usePlan()
  return me.role === 'owner' || !(plan?.has('roles') ?? false)
}
