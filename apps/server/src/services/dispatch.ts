/**
 * Despacho interno de herramientas del asistente a las rutas REST existentes, con la sesión de la
 * persona que actúa (la que conversa o, al aprobar, la que aprueba).
 *
 * Por qué así: cada llamada pasa por exactamente lo mismo que un clic en la web — sesión y
 * membresía vigentes, modo lectura, roles y permisos, funciones del plan, validación zod,
 * control optimista de versiones, redacción de costos según el rol y registro de actividad.
 * El asistente nunca tiene más poder que la persona.
 *
 * Reglas:
 * - Solo rutas FIJAS declaradas con `defineDispatchRoute(método, '/api/…/:param')`. Nunca un
 *   proxy genérico: la herramienta elige una ruta del registro y aporta parámetros validados.
 * - Prefijos prohibidos (facturación, equipo, sesión, portal público, el propio asistente):
 *   `defineDispatchRoute` falla al declararlos, así ningún registro de herramientas puede usarlos.
 * - Sin anidamiento: una llamada despachada no puede despachar otra.
 * - La marca `via: 'assistant'` viaja por AsyncLocalStorage (lib/request-context.ts) y la
 *   registra services/activity.ts; ninguna cabecera la activa desde afuera.
 */
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppDeps, AppEnv } from '../context'
import { unauthorized } from '../lib/errors'
import type { ServerLocale } from '../lib/i18n/locale'
import { dispatchDepth, runWithDispatchMeta, type DispatchMeta } from '../lib/request-context'
import { SESSION_COOKIE } from './session'

export type DispatchMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Prefijos que el asistente nunca puede llamar (plan, pagos, equipo y roles, sesión, portal…). */
export const DISPATCH_DENIED_PREFIXES = [
  '/api/auth',
  '/api/billing',
  '/api/team',
  '/api/invitations',
  '/api/public',
  '/api/assistant',
  '/api/me',
  '/api/health',
] as const

export interface DispatchRoute {
  readonly method: DispatchMethod
  /** Plantilla fija, p. ej. '/api/quotes/:id'. */
  readonly template: string
  readonly params: readonly string[]
}

const SEGMENT = /^(?::[a-zA-Z][a-zA-Z0-9]*|[a-z0-9][a-z0-9-]*)$/
/** Valores de parámetros: ids y números (sin barras, puntos dobles ni espacios). */
const PARAM_VALUE = /^[A-Za-z0-9_:-]{1,128}$/

function isDenied(path: string): boolean {
  return DISPATCH_DENIED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Declara una ruta despachable. Lanza si la plantilla no es fija o toca un prefijo prohibido. */
export function defineDispatchRoute(method: DispatchMethod, template: string): DispatchRoute {
  if (!template.startsWith('/api/')) throw new Error(`dispatch: la ruta debe empezar con /api/ (${template})`)
  const segments = template.slice(1).split('/')
  if (segments.some((s) => !SEGMENT.test(s) && s !== 'api')) throw new Error(`dispatch: plantilla no permitida (${template})`)
  if (isDenied(template)) throw new Error(`dispatch: el asistente no puede usar ${template}`)
  const params = segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1))
  if (new Set(params).size !== params.length) throw new Error(`dispatch: parámetro repetido en ${template}`)
  return Object.freeze({ method, template, params: Object.freeze(params) })
}

/** Quién actúa: su token de sesión vive solo en la petición en curso (la base guarda el hash). */
export interface DispatchActor {
  sessionToken: string
  orgId: string
  userId: string
  locale?: ServerLocale
}

/** Actor de la petición actual (requiere sesión). */
export function actorFromContext(c: Context<AppEnv>): DispatchActor {
  const auth = c.get('auth')
  const token = getCookie(c, SESSION_COOKIE)
  if (!auth || !token) throw unauthorized()
  const locale = c.get('locale')
  return { sessionToken: token, orgId: auth.org.id, userId: auth.user.id, ...(locale ? { locale } : {}) }
}

export type DispatchQueryValue = string | number | boolean | undefined | null | readonly (string | number)[]

export interface DispatchCall {
  params?: Record<string, string | number>
  query?: Record<string, DispatchQueryValue>
  body?: unknown
  signal?: AbortSignal
}

export interface DispatchResult<T = unknown> {
  ok: boolean
  status: number
  /** JSON de la respuesta (en errores, el cuerpo completo: puede traer `version`, `quote`…). */
  data?: T
  error?: { code: string; message: string; field?: string }
  /** Método y ruta efectiva (con ids), para auditoría. */
  request: { method: DispatchMethod; path: string }
}

export class DispatchError extends Error {
  constructor(
    readonly code: 'dispatch_unavailable' | 'dispatch_denied' | 'dispatch_bad_params',
    message: string,
  ) {
    super(message)
    this.name = 'DispatchError'
  }
}

/** Ruta efectiva con parámetros validados y codificados. */
export function buildDispatchPath(route: DispatchRoute, call: Pick<DispatchCall, 'params' | 'query'> = {}): string {
  let path = route.template
  for (const name of route.params) {
    const raw = call.params?.[name]
    const value = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw
    if (typeof value !== 'string' || !PARAM_VALUE.test(value)) throw new DispatchError('dispatch_bad_params', `dispatch: parámetro «${name}» inválido`)
    path = path.replace(`:${name}`, encodeURIComponent(value))
  }
  const extra = Object.keys(call.params ?? {}).filter((k) => !route.params.includes(k))
  if (extra.length) throw new DispatchError('dispatch_bad_params', `dispatch: parámetros desconocidos (${extra.join(', ')})`)
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value === undefined || value === null) continue
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) throw new DispatchError('dispatch_bad_params', `dispatch: consulta «${key}» inválida`)
    if (Array.isArray(value)) search.set(key, value.map(String).join(','))
    else search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

const INTERNAL_ORIGIN = 'http://dekopen.internal'

/**
 * Llama a la API como la persona `actor`, marcada como acción del asistente. Nunca lanza por
 * respuestas HTTP de error: devuelve `{ ok: false, status, error }` (el modelo puede explicarlo).
 * Lanza DispatchError si falta la app interna, si se intenta anidar o si los parámetros no calzan.
 */
export async function dispatch<T = unknown>(
  deps: Pick<AppDeps, 'internalFetch'>,
  actor: DispatchActor,
  route: DispatchRoute,
  call: DispatchCall = {},
  meta: Omit<DispatchMeta, 'via'> = {},
): Promise<DispatchResult<T>> {
  if (!deps.internalFetch) throw new DispatchError('dispatch_unavailable', 'dispatch: la app interna no está disponible')
  if (dispatchDepth() > 0) throw new DispatchError('dispatch_denied', 'dispatch: una herramienta no puede llamar a otra')
  if (isDenied(route.template)) throw new DispatchError('dispatch_denied', `dispatch: el asistente no puede usar ${route.template}`)
  const path = buildDispatchPath(route, call)
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${actor.sessionToken}`,
    accept: 'application/json',
    'user-agent': 'dekopen-assistant',
  }
  if (actor.locale) headers['accept-language'] = actor.locale
  const hasBody = call.body !== undefined && route.method !== 'GET'
  if (hasBody) headers['content-type'] = 'application/json'
  const request = new Request(`${INTERNAL_ORIGIN}${path}`, {
    method: route.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(call.body) } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  })
  const fetchApp = deps.internalFetch
  const response = await runWithDispatchMeta({ via: 'assistant', ...meta }, async () => fetchApp(request))
  const text = await response.text()
  let data: unknown
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text.length > 2000 ? `${text.slice(0, 2000)}…` : text
    }
  }
  const base = { status: response.status, request: { method: route.method, path: path.split('?')[0]! } }
  if (response.ok) return { ok: true, data: data as T, ...base }
  const err = (data as { error?: { code?: unknown; message?: unknown; field?: unknown } } | undefined)?.error
  return {
    ok: false,
    data: data as T,
    error: {
      code: typeof err?.code === 'string' ? err.code : `http_${response.status}`,
      message: typeof err?.message === 'string' ? err.message : '',
      ...(typeof err?.field === 'string' ? { field: err.field } : {}),
    },
    ...base,
  }
}
