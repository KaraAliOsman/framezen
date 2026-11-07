/**
 * Idiomas de DEKOPEN (plan v5 §4.B). Español de Chile es el idioma fuente y el de respaldo:
 * toda cadena existe primero en `es` y cualquier clave que falte en otro idioma cae a `es`.
 *
 * Dos idiomas conviven y no se mezclan:
 * - idioma de la interfaz: preferencia de cada persona (`users.locale`, `fz-locale` en el navegador);
 * - idioma del documento: el de cada cotización (por defecto el de la empresa, `orgs.locale`), que
 *   manda en el PDF, el portal del cliente, los correos y los textos de WhatsApp.
 */

export const LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'es'

export interface LocaleMeta {
  id: Locale
  /** Etiqueta BCP 47 que usan `Intl`, `<html lang>` y `Accept-Language`. */
  intl: string
  /** Nombre del idioma en su propio idioma (para el selector de idioma). */
  label: string
  /** Nombre en inglés (registros, soporte, búsquedas). */
  englishName: string
  /**
   * Moneda sugerida al crear una empresa en este idioma. **No** cambia la moneda de una empresa
   * existente: elegir portugués no convierte los precios a reales (la moneda vive en `orgs.currency`).
   */
  currency: string
  /** Tratamiento elegido para la interfaz (ver docs/build/i18n-guia.md §8). */
  formality: 'tú' | 'you' | 'você' | 'vous' | 'Sie' | 'tu' | 'siz'
}

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  es: { id: 'es', intl: 'es-CL', label: 'Español', englishName: 'Spanish (Chile)', currency: 'CLP', formality: 'tú' },
  en: { id: 'en', intl: 'en-US', label: 'English', englishName: 'English (US)', currency: 'USD', formality: 'you' },
  pt: { id: 'pt', intl: 'pt-BR', label: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', currency: 'BRL', formality: 'você' },
  fr: { id: 'fr', intl: 'fr-FR', label: 'Français', englishName: 'French', currency: 'EUR', formality: 'vous' },
  de: { id: 'de', intl: 'de-DE', label: 'Deutsch', englishName: 'German', currency: 'EUR', formality: 'Sie' },
  it: { id: 'it', intl: 'it-IT', label: 'Italiano', englishName: 'Italian', currency: 'EUR', formality: 'tu' },
  tr: { id: 'tr', intl: 'tr-TR', label: 'Türkçe', englishName: 'Turkish', currency: 'TRY', formality: 'siz' },
}

/** Zona horaria por defecto de las fechas de negocio (la empresa vive en Chile salvo que diga otra cosa). */
export const DEFAULT_TIME_ZONE = 'America/Santiago'

/** Moneda por defecto de una empresa (plan v5 §4.B). */
export const DEFAULT_CURRENCY = 'CLP'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Etiqueta `Intl` del idioma (`es` → `es-CL`). Un valor desconocido usa el idioma por defecto. */
export function intlTag(locale: Locale | string | undefined): string {
  return LOCALE_META[isLocale(locale) ? locale : DEFAULT_LOCALE].intl
}

/** Idioma soportado para una etiqueta suelta (`pt-PT`, `EN_us`, `tr`, `es-419`) o null si no hay. */
function matchTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0]
  return isLocale(primary) ? primary : null
}

/**
 * Idioma soportado que mejor calza con un encabezado `Accept-Language`
 * (`en-US,en;q=0.9,es;q=0.8`), con una etiqueta suelta (`pt-BR`) o con una lista
 * (`navigator.languages`). Respeta los pesos `q` (q=0 descarta) y el orden en empates.
 * Sin coincidencias devuelve `fallback` (español).
 */
export function matchLocale(input: string | readonly string[] | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!input) return fallback
  const entries = typeof input === 'string' ? input.split(',') : input
  const ranked: { locale: Locale; q: number; order: number }[] = []
  entries.forEach((raw, order) => {
    if (typeof raw !== 'string') return
    const [tagPart, ...paramParts] = raw.split(';')
    const tag = tagPart.trim()
    if (!tag || tag === '*') return
    let q = 1
    for (const param of paramParts) {
      const [name, value] = param.split('=').map((s) => s.trim())
      if (name === 'q') {
        const parsed = Number(value)
        q = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0
      }
    }
    if (q <= 0) return
    const locale = matchTag(tag)
    if (locale) ranked.push({ locale, q, order })
  })
  if (ranked.length === 0) return fallback
  ranked.sort((a, b) => b.q - a.q || a.order - b.order)
  return ranked[0].locale
}

/** Valor de `Accept-Language` para pedir respuestas en ese idioma (`en` → `en-US,en;q=0.9`). */
export function acceptLanguage(locale: Locale): string {
  const tag = LOCALE_META[locale].intl
  return tag === locale ? locale : `${tag},${locale};q=0.9`
}
