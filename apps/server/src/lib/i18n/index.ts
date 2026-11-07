/**
 * Traducción de los errores del servidor. El código nunca cambia; el mensaje sigue el idioma de
 * la petición (ver locale.ts). En español se deja el mensaje específico de la ruta.
 */
import { PLANS, type PlanCode } from '@dekopen/shared'
import { ERROR_MESSAGES, FIELD_LABELS_I18N, type ErrorMessageCode } from './errors'
import type { ServerLocale } from './locale'

export * from './locale'
export { ERROR_MESSAGES, FIELD_LABELS_I18N, type ErrorMessageCode } from './errors'

function interpolate(template: string, params: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '').replace(/\s{2,}/g, ' ').trim()
}

function planName(plan: unknown): string | undefined {
  if (typeof plan !== 'string' || plan === 'trial') return undefined
  return PLANS[plan as Exclude<PlanCode, 'trial'>]?.name
}

/** ¿Hay mensaje traducido para este código? */
export function hasErrorMessage(code: string): code is ErrorMessageCode {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)
}

/** Mensaje del código en el idioma pedido (o undefined si el código no está en el diccionario). */
export function errorMessage(code: string, locale: ServerLocale, params: Record<string, string | undefined> = {}): string | undefined {
  if (!hasErrorMessage(code)) return undefined
  return interpolate(ERROR_MESSAGES[code][locale], params)
}

/** Etiqueta del campo (último segmento con nombre) en el idioma pedido. */
export function fieldLabelFor(field: string | undefined, locale: Exclude<ServerLocale, 'es'>): string | undefined {
  if (!field) return undefined
  const key = field.split('.').reverse().find((part) => !/^\d+$/.test(part))
  return key ? FIELD_LABELS_I18N[key]?.[locale] : undefined
}

export interface LocalizableError {
  code: string
  message: string
  field?: string
  extra?: Record<string, unknown>
  status?: number
}

/** Código genérico según el estado HTTP, para códigos que no están en el diccionario. */
function codeForStatus(status: number | undefined): ErrorMessageCode {
  if (!status) return 'invalid'
  if (status >= 500) return 'internal'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'not_found'
  if (status === 409) return 'version_conflict'
  if (status === 413) return 'too_large'
  if (status === 429) return 'too_many_requests'
  return 'invalid'
}

/**
 * Mensaje final de un error para el idioma pedido. Español: el original (o el del diccionario si
 * vino vacío). Otros idiomas: el del código; los de validación nombran el campo si se conoce.
 */
export function localizeErrorMessage(error: LocalizableError, locale: ServerLocale): string {
  const params = { plan: planName(error.extra?.plan) ?? 'Pro' }
  if (locale === 'es') return error.message || errorMessage(error.code, 'es', params) || error.message
  if (error.code === 'invalid') {
    const label = fieldLabelFor(error.field, locale)
    if (label) return errorMessage('invalid_field', locale, { field: label })!
    return errorMessage('invalid', locale)!
  }
  return errorMessage(error.code, locale, params) ?? errorMessage(codeForStatus(error.status), locale, params)!
}
