import type { Context } from 'hono'
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { HttpError, badRequest, parseWith } from './errors'

/** ¿El cuerpo viene declarado como JSON? (application/json o application/*+json). */
export function isJsonContentType(value: string | undefined): boolean {
  const type = (value ?? '').split(';')[0]!.trim().toLowerCase()
  return type === 'application/json' || (type.startsWith('application/') && type.endsWith('+json'))
}

/** ¿Hay un carácter nulo en algún texto? Postgres no lo acepta en text ni en jsonb. */
export function hasNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000')
  if (!value || typeof value !== 'object' || depth > 64) return false
  if (Array.isArray(value)) return value.some((v) => hasNul(v, depth + 1))
  for (const [key, v] of Object.entries(value)) if (key.includes('\u0000') || hasNul(v, depth + 1)) return true
  return false
}

/**
 * Lee el cuerpo JSON (vacío = {}) y lo valida con zod. Un cuerpo con datos debe declararse
 * application/json: un formulario HTML de otro sitio (text/plain, sin preflight CORS) no puede
 * mandarlo, así que no sirve para CSRF.
 */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let raw: unknown = {}
  const text = await c.req.text()
  if (text.trim()) {
    if (!isJsonContentType(c.req.header('content-type'))) {
      throw new HttpError(415, 'unsupported_media_type', 'Los datos deben enviarse como JSON (Content-Type: application/json).')
    }
    try {
      raw = JSON.parse(text)
    } catch {
      throw badRequest('No pudimos leer los datos enviados (JSON inválido).')
    }
    if (hasNul(raw)) throw badRequest('Los datos enviados tienen caracteres no válidos.', undefined, 'invalid_characters')
  }
  return parseWith(schema, raw)
}

export function readQuery<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return parseWith(schema, c.req.query())
}

/** Desplazamiento máximo de una página: más allá no hay datos y Postgres rechazaría el número. */
export const MAX_OFFSET = 1_000_000_000

/** Paginación común: ?limit=50&offset=0 (máx. 200). Valores raros (1e30, -3, «abc») no rompen nada. */
export function pageParams(c: Context, defaults = { limit: 50 }): { limit: number; offset: number } {
  const limitRaw = Math.floor(Number(c.req.query('limit')))
  const offsetRaw = Math.floor(Number(c.req.query('offset')))
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : defaults.limit))
  const offset = Math.min(MAX_OFFSET, Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0))
  return { limit, offset }
}

/** Escapa comodines de LIKE para búsquedas literales. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

const COMBINING_MARKS = /[̀-ͯ]/g

/** Texto para búsquedas sin tildes ni mayúsculas («concepcion» encuentra «Concepción»). */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/** Condición «la columna contiene q» sin distinguir tildes ni mayúsculas (Postgres y PGlite, sin extensiones). */
export function folded(column: AnyColumn | SQL, q: string): SQL {
  // translate antes de lower: así funciona aunque el locale de la base sólo baje ASCII.
  return sql`lower(translate(coalesce(${column}, ''), 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç', 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc')) like ${likePattern(foldText(q))}`
}
