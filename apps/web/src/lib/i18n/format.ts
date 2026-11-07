/**
 * Formatos ligados al idioma de la interfaz y a la moneda de la empresa.
 * - `useFormat()` en componentes (se refresca al cambiar idioma o moneda).
 * - `getFormatter()` en módulos sin React (lee el idioma actual y la moneda del caché de la app).
 * La moneda sale de la empresa (`me.org.currency` o `settings.currency`); por defecto CLP.
 */
import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import { createFormatter, DEFAULT_CURRENCY, type Formatter, type Locale } from '@dekopen/shared'
import { queryClient as appQueryClient, qk } from '../queryClient'
import { useLocale } from './provider'
import { getLocale } from './runtime'

type MaybeCurrency = { currency?: unknown } | null | undefined

/** Moneda de la empresa en el caché de consultas (sin pedir nada al servidor). */
export function readOrgCurrency(client: QueryClient | undefined): string | undefined {
  if (!client) return undefined
  const me = client.getQueryData<{ org?: MaybeCurrency } | null>(qk.me)
  const settings = client.getQueryData<MaybeCurrency & { org?: MaybeCurrency }>(qk.settings)
  const value = me?.org?.currency ?? settings?.currency ?? settings?.org?.currency
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : undefined
}

/** Moneda de la empresa (se actualiza cuando llegan `me` o `settings`); undefined si aún no se sabe. */
export function useOrgCurrency(): string | undefined {
  const client = useContext(QueryClientContext)
  // Solo `me` y `settings` traen la moneda: otras consultas que se crean al dibujar no deben despertar a nadie.
  const subscribe = useCallback(
    (listener: () => void) =>
      client
        ? client.getQueryCache().subscribe((event) => {
            const key = event.query.queryKey[0]
            if (key === qk.me[0] || key === qk.settings[0]) listener()
          })
        : () => {},
    [client],
  )
  const read = useCallback(() => readOrgCurrency(client), [client])
  return useSyncExternalStore(subscribe, read, read)
}

export interface UseFormatOptions {
  /** Otra moneda (p. ej. la de una cotización). */
  currency?: string
  /** Otro idioma (p. ej. el del documento). */
  locale?: Locale
  timeZone?: string
}

/**
 * Formateador del idioma del componente con la moneda de la empresa:
 * `fmt.money(total)`, `fmt.size(w, h)`, `fmt.area(m2)`, `fmt.pct(35)`, `fmt.date(iso)`, `fmt.relative(iso)`.
 * En español la salida es idéntica a la de hoy (`$1.234.567`, `1.200 × 1.500 mm`).
 */
export function useFormat(options: UseFormatOptions = {}): Formatter {
  const { locale: uiLocale } = useLocale()
  const orgCurrency = useOrgCurrency()
  const locale = options.locale ?? uiLocale
  const currency = options.currency ?? orgCurrency ?? DEFAULT_CURRENCY
  return useMemo(() => createFormatter(locale, { currency, timeZone: options.timeZone }), [locale, currency, options.timeZone])
}

/** Igual que `useFormat()` pero sin hooks: idioma actual + moneda del caché de la app. */
export function getFormatter(options: UseFormatOptions & { client?: QueryClient } = {}): Formatter {
  const currency = options.currency ?? readOrgCurrency(options.client ?? appQueryClient) ?? DEFAULT_CURRENCY
  return createFormatter(options.locale ?? getLocale(), { currency, timeZone: options.timeZone })
}
