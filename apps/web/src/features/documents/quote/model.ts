/**
 * Ajustes del documento de UNA cotización (`Quote.documentOverrides`, v2) vistos desde un panel:
 * funciones puras que aplican `DocOp`s con la misma `applyDocOps` del servidor, del editor de
 * plantillas y de la IA. El panel no guarda nada: entrega el v2 compacto y quien lo aloja (el
 * editor de cotizaciones) decide historial y autosave.
 */
import {
  applyDocOps,
  compactQuoteDocOverrides,
  describeDocOp,
  mergeTemplateOverrides,
  migrateQuoteDocOverrides,
  type DocIssue,
  type DocLocale,
  type DocOp,
  type DocTemplate,
  type QuoteDocOverridesV2,
} from '@dekopen/shared'

/** Campos de texto que una cotización puede cambiar (el resto de textos son de la plantilla). */
export const QUOTE_TEXT_FIELDS = ['paymentTerms', 'warranty', 'leadTimeText', 'includes', 'excludes', 'conditions', 'intro', 'signatureName', 'footer'] as const
export type QuoteTextField = (typeof QUOTE_TEXT_FIELDS)[number]

export const QUOTE_FIELD_ROWS: Record<QuoteTextField | 'clientNote', { rows: number; singleLine: boolean }> = {
  intro: { rows: 3, singleLine: false },
  conditions: { rows: 4, singleLine: false },
  paymentTerms: { rows: 2, singleLine: false },
  warranty: { rows: 2, singleLine: false },
  leadTimeText: { rows: 1, singleLine: true },
  includes: { rows: 2, singleLine: false },
  excludes: { rows: 2, singleLine: false },
  signatureName: { rows: 1, singleLine: true },
  footer: { rows: 2, singleLine: false },
  clientNote: { rows: 3, singleLine: false },
}

/** v1/v2/nada → v2 (nunca lanza). */
export function normalizeOverrides(input: unknown): QuoteDocOverridesV2 {
  return migrateQuoteDocOverrides(input ?? null, { source: 'quote' }).overrides
}

/** ¿El v2 no trae ningún ajuste? (sólo la marca de versión). */
export function isEmptyOverrides(o: QuoteDocOverridesV2): boolean {
  return Object.keys(o).every((k) => k === 'v')
}

export interface OpsResult {
  ok: boolean
  /** v2 compacto; `null` si ya no queda ningún ajuste (se borra la clave). */
  next: QuoteDocOverridesV2 | null
  issues: DocIssue[]
  changed: boolean
  /** Etiqueta legible del cambio para el historial («Deshacer: …»). */
  label: string
}

/**
 * Quita los ajustes de sección que ya no cambian nada (mostrar de nuevo una sección que la plantilla
 * muestra deja `{ type, enabled: true }`): así «ajustes propios» no cuenta lo que ya es igual.
 */
function pruneNoopSections(o: QuoteDocOverridesV2, template: DocTemplate): QuoteDocOverridesV2 {
  if (!o.sections) return o
  const kept = Object.entries(o.sections).filter(([id, ov]) => {
    const keys = Object.keys(ov).filter((k) => k !== 'type')
    const base = template.sections.find((s) => s.id === id)
    return !(base && keys.length === 1 && keys[0] === 'enabled' && ov.enabled === base.enabled)
  })
  if (kept.length === Object.keys(o.sections).length) return o
  const { sections: _drop, ...rest } = o
  void _drop
  return compactQuoteDocOverrides(kept.length ? { ...rest, sections: Object.fromEntries(kept) } : rest)
}

/** Aplica operaciones sobre los ajustes de la cotización, validadas contra la plantilla base. */
export function applyQuoteOps(overrides: unknown, ops: readonly DocOp[], template: DocTemplate, locale: DocLocale = 'es'): OpsResult {
  const current = normalizeOverrides(overrides)
  const result = applyDocOps(current, ops, { template, mode: 'atomic' })
  const label = ops.length ? describeDocOp(ops[ops.length - 1], { locale, template }) : ''
  if (!result.ok) return { ok: false, next: isEmptyOverrides(current) ? null : current, issues: result.issues, changed: false, label }
  const compact = pruneNoopSections(compactQuoteDocOverrides(result.result), template)
  return { ok: true, next: isEmptyOverrides(compact) ? null : compact, issues: result.issues, changed: result.changed, label }
}

/** Cuántos ajustes propios tiene la cotización (textos, secciones, notas…), para el rótulo del panel. */
export function overrideCount(overrides: unknown): number {
  const o = normalizeOverrides(overrides)
  let n = 0
  if (o.templateId) n++
  if (o.locale) n++
  if (o.validityDays !== undefined) n++
  n += Object.keys(o.texts ?? {}).length
  n += Object.keys(o.sections ?? {}).length
  if (o.order?.length) n++
  n += o.added?.length ?? 0
  n += Object.keys(o.items ?? {}).length
  if (o.theme && Object.keys(o.theme).length) n++
  if (o.page && Object.keys(o.page).length) n++
  if (o.itemDisplay && Object.keys(o.itemDisplay).length) n++
  if (o.settings && Object.keys(o.settings).length) n++
  n += Object.keys(o.fields ?? {}).length
  return n
}

/** Cambios que podrían llevarse a la plantilla o a los textos de la empresa. */
export function templateChangeCount(overrides: unknown): number {
  const o = normalizeOverrides(overrides)
  let n = Object.keys(o.sections ?? {}).length + (o.added?.length ?? 0)
  if (o.order?.length) n++
  for (const part of [o.theme, o.page, o.settings]) if (part && Object.keys(part).length) n++
  n += Object.keys(o.itemDisplay ?? {}).length
  n += Object.keys(o.texts ?? {}).filter((field) => field !== 'clientNote').length
  return n
}

/** Plantilla ya mezclada con los ajustes de esta cotización (secciones visibles/ocultas, textos). */
export function mergedTemplate(template: DocTemplate, overrides: unknown): DocTemplate {
  return mergeTemplateOverrides(template, normalizeOverrides(overrides)).template
}
