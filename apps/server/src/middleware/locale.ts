/**
 * Idioma de la petición: deja `c.get('locale')` listo desde el inicio (Accept-Language → 'es') y
 * requireAuth lo refina con la sesión (user.locale ?? Accept-Language ?? org.locale ?? 'es').
 * Responde `Content-Language` y `Vary: Accept-Language` en /api/*.
 */
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../context'
import { localeOf, resolveLocale } from '../lib/i18n'

export const requestLocale = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('locale', resolveLocale({ header: c.req.header('accept-language') }))
    await next()
    // Con sesión, el idioma final pudo cambiar (preferencia de la persona o de la empresa).
    const locale = localeOf(c)
    c.set('locale', locale)
    if (!c.res.headers.has('Content-Language')) c.res.headers.set('Content-Language', locale)
    const vary = c.res.headers.get('Vary')
    if (!vary || !/accept-language/i.test(vary)) c.res.headers.set('Vary', vary ? `${vary}, Accept-Language` : 'Accept-Language')
  })
