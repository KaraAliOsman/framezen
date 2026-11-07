/**
 * Problemas de validación/edición de plantillas. Cada problema lleva un `code` estable (llave de
 * traducción), la ruta del valor y parámetros; el texto se arma con `docIssueMessage(issue, locale)`.
 * `message` trae la versión en español para registros y respuestas de API sin traducción.
 */
import type { z } from 'zod'

export const DOC_ISSUE_CODES = [
  'invalid_json',
  'too_large',
  'too_deep',
  'forbidden_key',
  'non_json',
  'unsafe_text',
  'multiline_not_allowed',
  'invalid_placeholder',
  'placeholder_not_allowed',
  'placeholder_in_text',
  'invalid_value',
  'unknown_field',
  'missing_field',
  'too_long',
  'too_many',
  'too_few',
  'out_of_range',
  'duplicate_id',
  'reserved_id',
  'section_not_allowed',
  'section_limit',
  'section_required',
  'section_required_any',
  'section_recommended',
  'cover_not_first',
  'total_not_final',
  'unknown_section',
  'tone_not_allowed',
  'title_not_allowed',
  'variant_incompatible',
  'variant_adjusted',
  'catalog_quote_data',
  'font_role',
  'font_weight',
  'low_contrast',
  'contrast_repaired',
  'target_not_found',
  'op_not_supported',
  'op_invalid',
  'op_noop',
  'too_many_ops',
  'base_template_required',
  'value_repaired',
  'value_dropped',
  'text_truncated',
  'section_added',
  'section_moved',
  'section_dropped',
  'section_reenabled',
  'removed_as_hidden',
  'id_renamed',
  'kind_mismatch',
  'legacy_migrated',
  'photo_missing',
  'override_ignored',
  'template_invalid',
] as const

export type DocIssueCode = (typeof DOC_ISSUE_CODES)[number]
export type DocIssueSeverity = 'error' | 'warning' | 'info'
export type DocIssuePath = (string | number)[]
export type DocIssueParams = Record<string, string | number>

export interface DocIssue {
  severity: DocIssueSeverity
  code: DocIssueCode
  path: DocIssuePath
  params?: DocIssueParams
  /** Índice de la operación que lo produjo (en `applyDocOps`). */
  opIndex?: number
  /** Texto en español (fuente). Para otros idiomas usa `docIssueMessage`. */
  message: string
}

/** Arma un problema; el mensaje en español se completa en `withMessages` (evita ciclos de import). */
export function issue(
  severity: DocIssueSeverity,
  code: DocIssueCode,
  path: DocIssuePath = [],
  params?: DocIssueParams,
): DocIssue {
  return params ? { severity, code, path, params, message: '' } : { severity, code, path, message: '' }
}

export function hasErrors(issues: readonly DocIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

export function errorsOnly(issues: readonly DocIssue[]): DocIssue[] {
  return issues.filter((i) => i.severity === 'error')
}

/** Parámetros que se adjuntan a issues `custom` de zod para conservar el código de DEKOPEN. */
export interface DocZodParams {
  docCode: DocIssueCode
  docParams?: DocIssueParams
}

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let v: unknown = root
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined
    const k = typeof key === 'symbol' ? undefined : String(key)
    if (k === undefined || !Object.hasOwn(v, k)) return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return v
}

const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : undefined)

/**
 * Convierte los issues de zod en problemas de plantilla (códigos estables, sin texto de zod).
 * `root` (el valor validado) permite distinguir un dato ausente de uno con tipo incorrecto.
 */
export function fromZodIssues(issues: readonly z.core.$ZodIssue[], basePath: DocIssuePath = [], root?: unknown): DocIssue[] {
  const out: DocIssue[] = []
  for (const zi of issues) {
    const path = [...basePath, ...zi.path.map((p) => (typeof p === 'symbol' ? String(p) : p))] as DocIssuePath
    const raw = zi as unknown as Record<string, unknown>
    switch (zi.code) {
      case 'custom': {
        const params = (raw.params ?? {}) as Partial<DocZodParams>
        out.push(issue('error', params.docCode ?? 'invalid_value', path, params.docParams))
        break
      }
      case 'too_big': {
        const max = asNumber(raw.maximum) ?? 0
        const origin = raw.origin
        out.push(issue('error', origin === 'string' ? 'too_long' : origin === 'array' ? 'too_many' : 'out_of_range', path, { max }))
        break
      }
      case 'too_small': {
        const min = asNumber(raw.minimum) ?? 0
        const origin = raw.origin
        if (origin === 'string' && min <= 1) out.push(issue('error', 'missing_field', path))
        else out.push(issue('error', origin === 'array' ? 'too_few' : origin === 'string' ? 'too_few' : 'out_of_range', path, { min }))
        break
      }
      case 'unrecognized_keys': {
        const keys = (raw.keys as string[] | undefined) ?? []
        out.push(issue('error', keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype') ? 'forbidden_key' : 'unknown_field', path, { keys: keys.slice(0, 5).join(', '), key: keys[0] ?? '' }))
        break
      }
      case 'invalid_type': {
        const missing = Object.hasOwn(raw, 'input') ? raw.input === undefined : root !== undefined && valueAt(root, zi.path) === undefined
        out.push(issue('error', missing ? 'missing_field' : 'invalid_value', path))
        break
      }
      default:
        out.push(issue('error', 'invalid_value', path))
    }
  }
  return out
}
