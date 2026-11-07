/**
 * Protección CSRF para /api/*: una escritura (POST, PUT, PATCH, DELETE) solo se acepta si viene
 * de la propia app. Los navegadores modernos lo dicen en Sec-Fetch-Site; si falta, se mira Origin
 * (debe ser APP_URL o el mismo host). Sin ninguna de las dos (curl, otros servidores) no hay
 * navegador que engañar. Excepción: /api/billing/flow/* y /api/public/pay/flow/*, que Flow llama desde su dominio.
 * Sin esto, un formulario de otro sitio (text/plain, sin preflight) dejaba a la víctima dentro
 * de la cuenta del atacante (login CSRF) o escribía datos desde un subdominio hermano.
 */
import { createMiddleware } from 'hono/factory'
import type { AppDeps, AppEnv } from '../context'
import { HttpError } from '../lib/errors'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const EXEMPT = ['/api/billing/flow/', '/api/public/pay/flow/']

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

export function isAllowedOrigin(origin: string, appUrl: string, requestHost: string | undefined): boolean {
  if (origin === 'null') return false
  if (origin === originOf(appUrl)) return true
  // Mismo host que atiende la petición (desarrollo por 127.0.0.1 o la IP de la red, proxy de Vite).
  return Boolean(requestHost) && hostOf(origin) === requestHost
}

const crossSite = () =>
  new HttpError(403, 'cross_site', 'Por seguridad, esta acción solo se puede hacer desde DEKOPEN. Abre la app y vuelve a intentarlo.')

export const sameOriginGuard = (deps: AppDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!MUTATING.has(c.req.method) || EXEMPT.some((prefix) => c.req.path.startsWith(prefix))) return next()
    const site = c.req.header('sec-fetch-site')?.toLowerCase()
    if (site === 'cross-site' || site === 'same-site') throw crossSite()
    if (site !== 'same-origin' && site !== 'none') {
      const origin = c.req.header('origin')
      if (origin && !isAllowedOrigin(origin, deps.config.appUrl, c.req.header('host'))) throw crossSite()
    }
    await next()
  })
