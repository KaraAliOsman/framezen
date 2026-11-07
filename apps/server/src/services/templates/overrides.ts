/**
 * Ajustes del documento por cotización (`Quote.documentOverrides`) al escribir y al leer.
 *
 * Desde v5 se guardan como `QuoteDocOverridesV2` (DOCSCHEMA). Lo que llega puede ser:
 * - v2 (editor nuevo, asistente),
 * - v1 plano (`Partial<DocumentPrefs> & { notes }`, clientes anteriores),
 * - una mezcla: un v2 al que un editor v1 le agregó claves planas (`{ v: 2, texts: {...}, intro }`).
 * En la mezcla manda lo plano (es la edición más reciente). Nada se pierde y todo queda validado y
 * con tope: nunca más un `z.record(unknown)` guardado tal cual.
 */
import {
  compactQuoteDocOverrides,
  migrateQuoteDocOverrides,
  type DocIssue,
  type QuoteDocOverridesV2,
} from '@dekopen/shared'

/** Claves que sólo existen en el formato v1 plano. */
const V1_ONLY_KEYS = [
  'intro',
  'conditions',
  'paymentTerms',
  'warranty',
  'leadTimeText',
  'signatureName',
  'footer',
  'notes',
  'quoteTemplate',
  'catalogTemplate',
  'font',
  'accent',
  'paper',
  'showUnitPrice',
  'showArea',
  'showGlass',
  'showLine',
  'showColorSwatch',
  'showExteriorView',
] as const

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Mezcla `top` sobre `base` (ambos v2 válidos), por llave. */
function layer(base: QuoteDocOverridesV2, top: QuoteDocOverridesV2): QuoteDocOverridesV2 {
  const out: QuoteDocOverridesV2 = { ...base }
  if (top.texts) out.texts = { ...(base.texts ?? {}), ...top.texts }
  if (top.validityDays !== undefined) out.validityDays = top.validityDays
  if (top.templateId !== undefined) out.templateId = top.templateId
  if (top.locale !== undefined) out.locale = top.locale
  if (top.theme) {
    out.theme = {
      ...(base.theme ?? {}),
      ...top.theme,
      ...(base.theme?.palette || top.theme.palette ? { palette: { ...(base.theme?.palette ?? {}), ...(top.theme.palette ?? {}) } } : {}),
      ...(base.theme?.fonts || top.theme.fonts ? { fonts: { ...(base.theme?.fonts ?? {}), ...(top.theme.fonts ?? {}) } } : {}),
    }
  }
  if (top.page) out.page = { ...(base.page ?? {}), ...top.page }
  if (top.itemDisplay) out.itemDisplay = { ...(base.itemDisplay ?? {}), ...top.itemDisplay }
  return out
}

export interface NormalizedOverrides {
  /** `null` = no hay ajustes (se borra la clave). */
  overrides: QuoteDocOverridesV2 | null
  issues: DocIssue[]
}

/** Lo que llega en PUT/POST /api/quotes → v2 compacto y validado (o null si queda vacío). */
export function normalizeIncomingDocOverrides(input: unknown): NormalizedOverrides {
  if (input === null || input === undefined) return { overrides: null, issues: [] }
  let result: { overrides: QuoteDocOverridesV2; issues: DocIssue[] }
  if (isRecord(input) && input.v === 2 && V1_ONLY_KEYS.some((k) => Object.hasOwn(input, k))) {
    const v2Part: Record<string, unknown> = {}
    const v1Part: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      if ((V1_ONLY_KEYS as readonly string[]).includes(key)) v1Part[key] = value
      else v2Part[key] = value
    }
    const base = migrateQuoteDocOverrides(v2Part, { source: 'quote' })
    const top = migrateQuoteDocOverrides(v1Part, { source: 'quote' })
    result = { overrides: compactQuoteDocOverrides(layer(base.overrides, top.overrides)), issues: [...base.issues, ...top.issues] }
  } else {
    const migrated = migrateQuoteDocOverrides(input, { source: 'quote' })
    result = { overrides: migrated.overrides, issues: migrated.issues }
  }
  const empty = Object.keys(result.overrides).every((k) => k === 'v')
  return { overrides: empty ? null : result.overrides, issues: result.issues }
}

/** Lo guardado (v1, v2 o basura) → v2 para responder. `undefined` si no hay nada. */
export function readStoredDocOverrides(stored: unknown): QuoteDocOverridesV2 | undefined {
  if (stored === null || stored === undefined) return undefined
  const { overrides } = migrateQuoteDocOverrides(stored, { source: 'quote' })
  return Object.keys(overrides).every((k) => k === 'v') ? undefined : overrides
}
