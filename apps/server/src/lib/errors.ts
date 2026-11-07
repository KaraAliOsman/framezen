import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { errorMessage, type ErrorMessageCode } from './i18n'
import { PLANS, type PlanCode } from '@dekopen/shared'

/** Error con forma { error: { code, message, field? } } y mensaje humano en español. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly field?: string,
    /** Datos adicionales que viajan junto al error (p. ej. la versión actual en un 409). */
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }

  /** Cuerpo JSON del error; `message` permite enviarlo traducido (ver lib/i18n). */
  toJSON(message: string = this.message) {
    return {
      error: { code: this.code, message, ...(this.field ? { field: this.field } : {}) },
      ...this.extra,
    }
  }
}

/**
 * Error con el mensaje del diccionario (lib/i18n/errors.ts) en español como texto fuente; el
 * manejador global lo traduce al idioma de la petición. Para códigos nuevos del servidor v5.
 */
export function apiError(
  status: ContentfulStatusCode,
  code: ErrorMessageCode,
  options: { field?: string; extra?: Record<string, unknown>; message?: string } = {},
): HttpError {
  const plan = options.extra?.plan
  const planName = typeof plan === 'string' && plan !== 'trial' ? PLANS[plan as Exclude<PlanCode, 'trial'>]?.name : undefined
  return new HttpError(status, code, options.message ?? errorMessage(code, 'es', { plan: planName ?? 'Pro' })!, options.field, options.extra)
}

export const badRequest = (message: string, field?: string, code = 'invalid') => new HttpError(400, code, message, field)
export const unauthorized = (message = 'Tu sesión terminó. Vuelve a entrar para continuar.') =>
  new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'Esta acción la puede hacer sólo el dueño de la cuenta.') =>
  new HttpError(403, 'forbidden', message)
export const notFound = (message = 'No encontramos lo que buscas.') => new HttpError(404, 'not_found', message)
export const conflict = (code: string, message: string, extra?: Record<string, unknown>) =>
  new HttpError(409, code, message, undefined, extra)

/** Nombres legibles (con artículo) de los campos para los mensajes de validación. */
const FIELD_LABELS: Record<string, string> = {
  name: 'el nombre',
  email: 'el correo',
  password: 'la contraseña',
  company: 'el nombre de la empresa',
  title: 'el título',
  rut: 'el RUT',
  phone: 'el teléfono',
  address: 'la dirección',
  city: 'la ciudad',
  message: 'el mensaje',
  status: 'el estado',
  role: 'el rol',
  version: 'la versión',
  items: 'los ítems',
  qty: 'la cantidad',
  discountPct: 'el descuento',
  logo: 'el logo',
  accent: 'el color de marca',
  website: 'el sitio web',
  price: 'el precio',
  overrides: 'los precios',
  token: 'el enlace',
}

export function fieldLabel(path: PropertyKey[]): string {
  const key = [...path].reverse().find((p): p is string => typeof p === 'string')
  return (key && FIELD_LABELS[key]) || (key ? `«${key}»` : 'el dato')
}

/** Traduce un error de zod al primer problema, con un mensaje que se entiende. */
export function fromZodError(error: z.ZodError): HttpError {
  const issue = error.issues[0]
  if (!issue) return badRequest('Revisa los datos enviados.')
  const field = issue.path.length ? issue.path.join('.') : undefined
  const custom = issue.message && !/^(Invalid|Too|Expected|Unrecognized|Required)/i.test(issue.message)
  const label = fieldLabel(issue.path)
  const origin = (issue as { origin?: string }).origin
  let message: string
  if (custom) message = issue.message
  else if (issue.code === 'invalid_type' && issue.input === undefined) message = `Falta ${label}.`
  else if (issue.code === 'too_small')
    message = origin === 'string' ? `Revisa ${label}: le faltan caracteres.` : `Revisa ${label}: el valor es muy bajo.`
  else if (issue.code === 'too_big')
    message = origin === 'string' ? `Revisa ${label}: es demasiado largo.` : `Revisa ${label}: el valor es muy alto.`
  else message = `Revisa ${label}: no tiene un formato válido.`
  return badRequest(message, field)
}

/** Valida un JSON con zod y lanza un HttpError legible si no calza. */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw fromZodError(result.error)
  return result.data
}

/** Detecta violaciones de restricción única de Postgres (23505). */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 4; depth++) {
    const code = (current as { code?: unknown }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
