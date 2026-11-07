/**
 * Sincroniza el idioma de la interfaz con la preferencia guardada en el servidor (`users.locale`):
 * - cuando llega la sesión (`me.user.locale`) y difiere, se adopta (otra pestaña u otro equipo);
 * - cuando la persona cambia el idioma aquí, se guarda con `PATCH /api/me { locale }`.
 * Todo es de buena fe: sin sesión, sin conexión o si el servidor aún no tiene la ruta (404), el
 * idioma elegido se queda en este navegador y no se insiste.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isLocale, type Locale } from '@dekopen/shared'
import { request } from '../api'
import { qk } from '../queryClient'
import { getLocale, onLocaleChange, switchLocale } from './runtime'

type MeLike = { user?: { locale?: unknown } & Record<string, unknown> } & Record<string, unknown>

export function LocaleServerSync() {
  const client = useQueryClient()

  useEffect(() => {
    let lastServer: Locale | undefined
    let serverIgnored = false

    const readServer = () => {
      if (serverIgnored) return
      const serverLocale = client.getQueryData<MeLike | null>(qk.me)?.user?.locale
      if (!isLocale(serverLocale) || serverLocale === lastServer) return
      lastServer = serverLocale
      if (serverLocale !== getLocale()) void switchLocale(serverLocale, 'server')
    }

    readServer()
    const unsubscribeCache = client.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] === qk.me[0]) readServer()
    })

    const unsubscribeLocale = onLocaleChange((locale, source) => {
      if (source !== 'user') return
      lastServer = locale
      const me = client.getQueryData<MeLike | null>(qk.me)
      if (!me?.user) return
      client.setQueryData<MeLike>(qk.me, { ...me, user: { ...me.user, locale } })
      request('/me', { method: 'PATCH', body: { locale }, retry: 0 }).catch(() => {
        // Sin la ruta o sin conexión: la elección local manda en esta sesión.
        serverIgnored = true
      })
    })

    return () => {
      unsubscribeCache()
      unsubscribeLocale()
    }
  }, [client])

  return null
}
