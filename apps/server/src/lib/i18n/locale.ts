/**
 * Idioma de cada petición del servidor.
 *
 *   user.locale ?? Accept-Language ?? org.locale ?? 'es'
 *
 * - Antes de conocer la sesión (rutas públicas, errores tempranos) vale Accept-Language → 'es'.
 * - Con sesión, la preferencia guardada de la persona manda; sin ella, el navegador; y si el
 *   navegador no pide un idioma soportado, el de la empresa.
 * Los correos usan el idioma del destinatario (ver services/mail), no el de la petición.
 */
import type { Context } from 'hono'
import { z } from 'zod'
import { DEFAULT_LOCALE, LOCALES, isLocale, matchLocale, type Locale } from '@dekopen/shared'

/** `Locale` de @dekopen/shared/i18n: una sola fuente de idiomas para servidor y web. */
export type ServerLocale = Locale
export { DEFAULT_LOCALE, LOCALES, isLocale, matchLocale }

/** Idioma válido (es, en, pt, fr, de, it, tr). */
export const localeSchema = z.enum(LOCALES, { error: 'Ese idioma no está disponible. Elige español, inglés, portugués, francés, alemán, italiano o turco.' })

const KNOWN_CURRENCIES = new Set<string>(
  (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency') ?? []
    } catch {
      return []
    }
  })(),
)

/** Moneda ISO 4217 en mayúsculas (CLP, USD, EUR, BRL, TRY…), reconocida por Intl. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'La moneda debe ser un código de 3 letras (por ejemplo CLP, USD o EUR).')
  .refine((code) => KNOWN_CURRENCIES.size === 0 || KNOWN_CURRENCIES.has(code), 'No reconocemos esa moneda. Usa un código ISO como CLP, USD o EUR.')

/** Idioma pedido por el navegador, o null si no pide ninguno soportado. */
export function headerLocale(header: string | null | undefined): ServerLocale | null {
  if (!header) return null
  const sentinel = '__none__' as unknown as Locale
  const match = matchLocale(header, sentinel)
  return match === sentinel ? null : match
}

export interface LocaleSources {
  user?: string | null
  header?: string | null
  org?: string | null
}

/** Regla única del idioma de la interfaz. */
export function resolveLocale(sources: LocaleSources): ServerLocale {
  if (isLocale(sources.user)) return sources.user
  const fromHeader = headerLocale(sources.header)
  if (fromHeader) return fromHeader
  if (isLocale(sources.org)) return sources.org
  return DEFAULT_LOCALE
}

/** Idioma de esta petición (lo deja calculado el middleware `requestLocale`). */
export function localeOf(c: Context): ServerLocale {
  const auth = (c.get as (key: string) => unknown)('auth') as { user?: { locale?: string | null }; org?: { locale?: string | null } } | undefined
  return resolveLocale({ user: auth?.user?.locale, header: c.req.header('accept-language'), org: auth?.org?.locale })
}
