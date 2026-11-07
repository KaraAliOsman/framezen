/**
 * Piezas zod reutilizables: textos seguros con tope, ids estables, ids de recursos y colores.
 * Sin transformaciones (el esquema JSON para la IA sale de aquí): la limpieza ocurre antes, en las
 * operaciones (`applyDocOps`) y en la reparación de respuestas de IA.
 */
import { z } from 'zod'
import { isReservedId, unsafeTextReason } from './safety'
import { invalidBraces } from './placeholders'
import type { DocZodParams } from './issues'

export interface DocTextSpec {
  max: number
  /** Permite saltos de línea. */
  multiline?: boolean
  /** Permite marcadores `{client.name}` (si no, cualquier llave es un error). */
  placeholders?: boolean
  /** Exige al menos un carácter visible. */
  required?: boolean
}

const custom = (params: DocZodParams) => ({ code: 'custom' as const, message: params.docCode, params })

/** Issues de contenido de un texto según su especificación (sin largo, que lo mide zod). */
export function docTextProblems(value: string, spec: Omit<DocTextSpec, 'max'>): DocZodParams[] {
  const out: DocZodParams[] = []
  const reason = unsafeTextReason(value)
  if (reason) out.push({ docCode: 'unsafe_text', docParams: { reason } })
  if (!spec.multiline && /[\n\r]/.test(value)) out.push({ docCode: 'multiline_not_allowed' })
  if (!reason) {
    if (!spec.placeholders) {
      const brace = /\{[^{}]{0,60}\}|[{}]/.exec(value)
      if (brace) out.push({ docCode: 'placeholder_in_text', docParams: { value: brace[0] } })
    } else {
      const bad = invalidBraces(value)
      if (bad.length) out.push({ docCode: 'invalid_placeholder', docParams: { value: bad[0] } })
    }
  }
  if (spec.required && value.trim().length === 0) out.push({ docCode: 'missing_field' })
  return out
}

/** Texto plano seguro (nunca HTML/CSS/JS/URLs) con largo máximo. */
export function docText(spec: DocTextSpec) {
  return z
    .string()
    .max(spec.max)
    .superRefine((value, ctx) => {
      for (const p of docTextProblems(value, spec)) ctx.addIssue(custom(p))
    })
}

const ID_RE = /^[a-z][a-z0-9_-]{0,47}$/

/** Id estable de sección (`items`, `custom-2`): minúsculas, sin puntos ni dos puntos. */
export const SectionIdSchema = z
  .string()
  .regex(ID_RE)
  .superRefine((value, ctx) => {
    if (isReservedId(value)) ctx.addIssue(custom({ docCode: 'reserved_id', docParams: { id: value } }))
  })

export function isSectionId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value) && !isReservedId(value)
}

const TEMPLATE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/

/** Id de plantilla: id de diseño predefinido (`luz`) o id de plantilla de la organización (uuid). */
export const TemplateIdSchema = z
  .string()
  .regex(TEMPLATE_ID_RE)
  .superRefine((value, ctx) => {
    if (isReservedId(value)) ctx.addIssue(custom({ docCode: 'reserved_id', docParams: { id: value } }))
  })

export function isTemplateId(value: unknown): value is string {
  return typeof value === 'string' && TEMPLATE_ID_RE.test(value) && !isReservedId(value)
}

const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/

/**
 * Id opaco de un recurso subido (tabla `assets`, uuid). Nunca una URL ni una ruta: el servidor lo
 * resuelve dentro de la organización y lo entrega al renderizador como data URL.
 */
export const AssetIdSchema = z.string().regex(ASSET_ID_RE)

export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && ASSET_ID_RE.test(value)
}

// Los ids salen de `shortId()` (base64url): un 3 % empieza por «-» o «_» y son válidos igual.
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Id de un ítem de la cotización (`QuoteItem.id`). */
export const ItemIdSchema = z
  .string()
  .regex(ITEM_ID_RE)
  .superRefine((value, ctx) => {
    if (isReservedId(value)) ctx.addIssue(custom({ docCode: 'reserved_id', docParams: { id: value } }))
  })

/** Color `#RRGGBB`. */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
