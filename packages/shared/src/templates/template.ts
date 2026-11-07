/**
 * `DocTemplate` v1: composición versionada de un documento (cotización o catálogo). Contiene sólo
 * decisiones de presentación (tema, página, secciones ordenadas con opciones); nunca montos,
 * cantidades, geometría ni destinos de aceptación — esos datos vienen del motor y del servidor.
 */
import { z } from 'zod'
import { DOC_TEMPLATE_SCHEMA_VERSION, TEMPLATE_LIMITS as L } from './limits'
import { DOC_TEMPLATE_KINDS, type DocTemplateKind } from './kinds'
import { TemplateIdSchema, docText, isTemplateId } from './fields'
import { ThemeSchema, themeIssues } from './theme'
import { PageSchema } from './page'
import { DocSettingsSchema, applyTermsPlacement } from './settings'
import {
  DocSectionSchema,
  RECOMMENDED_SECTIONS,
  REQUIRED_SECTIONS,
  SECTION_META,
  sectionOptionIssues,
  sectionRichText,
  sectionTexts,
  closingOrderViolation,
  dropTotalOptions,
  withClosingLast,
  type DocSection,
  type DocSectionType,
} from './sections'
import { placeholderAllowed, placeholdersIn } from './placeholders'
import { richTextPlaceholders } from './richtext'
import { measureJson } from './safety'
import { fromZodIssues, issue, type DocIssue, type DocZodParams } from './issues'
import {
  DEFAULT_CATALOG_PRESET_ID,
  DEFAULT_QUOTE_PRESET_ID,
  DOC_PRESET_IDS,
  LEGACY_TEMPLATE_PRESETS,
  isDocPresetId,
  isLegacyTemplateId,
  presetKind,
  type DocPresetId,
} from './preset-ids'
import { withMessages } from './i18n'

export const DocTemplateBaseSchema = z.strictObject({
  schemaVersion: z.literal(DOC_TEMPLATE_SCHEMA_VERSION),
  /** Id del diseño predefinido (`luz`) o de la plantilla de la organización (uuid). */
  id: TemplateIdSchema,
  kind: z.enum(DOC_TEMPLATE_KINDS),
  name: docText({ max: L.nameMax, multiline: false, placeholders: false, required: true }),
  description: docText({ max: L.descriptionMax, multiline: false, placeholders: false }).optional(),
  /** Diseño predefinido del que se duplicó (para "Restablecer"). */
  presetId: z.enum(DOC_PRESET_IDS).optional(),
  theme: ThemeSchema,
  page: PageSchema,
  /** Título, numeración, encabezado, orden de condiciones y marcas (solo lo decidido). */
  settings: DocSettingsSchema.optional(),
  /** Orden = orden de impresión. */
  sections: z.array(DocSectionSchema).min(1).max(L.sectionsMax),
})

export type DocTemplate = z.infer<typeof DocTemplateBaseSchema>

/** Esquema completo: forma + reglas cruzadas (ids únicos, secciones permitidas, obligatorias…). */
export const DocTemplateSchema = DocTemplateBaseSchema.superRefine((template, ctx) => {
  for (const i of templateIssues(template)) {
    if (i.severity !== 'error') continue
    const params: DocZodParams = { docCode: i.code, docParams: i.params }
    ctx.addIssue({ code: 'custom', message: i.code, path: i.path, params })
  }
})

/** Reglas que van más allá de la forma (supone una plantilla con forma válida). */
export function templateIssues(t: DocTemplate): DocIssue[] {
  const out: DocIssue[] = []
  const seen = new Set<string>()
  const counts = new Map<DocSectionType, number>()
  t.sections.forEach((s: DocSection, i) => {
    const path = ['sections', i]
    if (seen.has(s.id)) out.push(issue('error', 'duplicate_id', [...path, 'id'], { id: s.id }))
    seen.add(s.id)
    const meta = SECTION_META[s.type]
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
    if (!meta.kinds.includes(t.kind)) out.push(issue('error', 'section_not_allowed', [...path, 'type'], { section: s.type, kind: t.kind }))
    if (!meta.tones.includes(s.tone)) out.push(issue('error', 'tone_not_allowed', [...path, 'tone'], { section: s.type, tone: s.tone }))
    if (s.title !== undefined && !meta.allowsTitle) out.push(issue('error', 'title_not_allowed', [...path, 'title'], { section: s.type }))
    if (s.type === 'cover' && i !== 0) out.push(issue('error', 'cover_not_first', path))
    out.push(...sectionOptionIssues(s.type, s.options as Record<string, unknown>, [...path, 'options']))
    if (s.type === 'cover') {
      if (t.kind === 'catalog' && s.options.showClient) out.push(issue('error', 'catalog_quote_data', [...path, 'options']))
      if ((s.options.variant === 'photo' || s.options.variant === 'split') && !s.options.assetId) out.push(issue('info', 'photo_missing', [...path, 'options', 'assetId']))
    }
    for (const { path: p, text } of sectionTexts(s)) {
      for (const key of placeholdersIn(text)) if (!placeholderAllowed(key, t.kind)) out.push(issue('error', 'placeholder_not_allowed', [...path, ...p], { key }))
    }
    const rich = sectionRichText(s)
    if (rich) for (const key of richTextPlaceholders(rich)) if (!placeholderAllowed(key, t.kind)) out.push(issue('error', 'placeholder_not_allowed', [...path, 'options', 'content'], { key }))
  })
  for (const [type, n] of counts) {
    const max = SECTION_META[type].max
    if (n > max) out.push(issue('error', 'section_limit', ['sections'], { section: type, max }))
  }
  const late = closingOrderViolation(t.sections)
  if (late >= 0) out.push(issue('error', 'total_not_final', ['sections', late]))
  const enabled = (type: DocSectionType) => t.sections.some((s) => s.type === type && s.enabled)
  const req = REQUIRED_SECTIONS[t.kind]
  for (const type of req.all) if (!enabled(type)) out.push(issue('error', 'section_required', ['sections'], { section: type }))
  if (req.any.length && !req.any.some(enabled)) out.push(issue('error', 'section_required_any', ['sections']))
  for (const type of RECOMMENDED_SECTIONS[t.kind]) if (!enabled(type)) out.push(issue('warning', 'section_recommended', ['sections'], { section: type }))
  if (t.presetId && presetKind(t.presetId) !== t.kind) out.push(issue('error', 'kind_mismatch', ['presetId']))
  // Avisos del tema (líneas con poco contraste); los errores ya los reporta ThemeSchema.
  for (const i of themeIssues(t.theme, ['theme'])) if (i.severity !== 'error') out.push(i)
  return out
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Pone al día una plantilla guardada antes de validarla: diseños retirados en v6, opciones que
 * mostraban el total antes del cierre, orden del cierre (las fuentes retiradas las resuelve
 * `ThemeSchema`) y, una sola vez (una plantilla sin `settings` es anterior a v7), las condiciones bajo
 * el total y los bloques nuevos de condiciones. Lo que no se reconoce lo sigue rechazando el esquema.
 */
export function migrateDocTemplateInput(input: unknown): unknown {
  if (!isObject(input)) return input
  const out: Record<string, unknown> = { ...input }
  if (isLegacyTemplateId(out.presetId)) out.presetId = LEGACY_TEMPLATE_PRESETS[out.presetId]
  if (isLegacyTemplateId(out.id)) out.id = LEGACY_TEMPLATE_PRESETS[out.id]
  if (Array.isArray(out.sections)) {
    const sections = out.sections.map((s) => (isObject(s) ? { ...s, options: dropTotalOptions(String(s.type), s.options) } : s))
    const ordered = out.kind === 'quote' && sections.every((s) => isObject(s) && typeof s.type === 'string')
    out.sections = ordered ? withClosingLast(sections as { type: DocSectionType }[]) : sections
    if (ordered && out.settings === undefined) {
      out.settings = {}
      out.sections = applyTermsPlacement(out.sections as { type: DocSectionType }[], 'after_total').map((s) => {
        if (s.type !== 'terms') return s
        const options = (s as unknown as { options?: { blocks?: unknown } }).options
        return Array.isArray(options?.blocks) ? { ...s, options: { ...options, blocks: [...new Set(['includes', 'excludes', ...options.blocks])] } } : s
      })
    }
  }
  return out
}

export type ValidateTemplateResult =
  | { ok: true; template: DocTemplate; issues: DocIssue[] }
  | { ok: false; template?: undefined; issues: DocIssue[] }

/**
 * Valida una plantilla que viene de fuera (API, base de datos, importación). Rechaza llaves
 * desconocidas, contenido inseguro y estructuras gigantes antes de tocar el esquema. Nunca lanza.
 */
export function validateDocTemplate(raw: unknown, options: { kind?: DocTemplateKind } = {}): ValidateTemplateResult {
  const input = migrateDocTemplateInput(raw)
  const shape = measureJson(input, { maxDepth: L.maxJsonDepth, maxNodes: L.maxJsonNodes, maxChars: L.maxJsonBytes })
  if (shape.forbiddenKey) return { ok: false, issues: withMessages([issue('error', 'forbidden_key', [], { key: shape.forbiddenKey })]) }
  if (shape.exceeded) return { ok: false, issues: withMessages([issue('error', shape.depth > L.maxJsonDepth ? 'too_deep' : 'too_large', [], { max: Math.round(L.maxJsonBytes / 1024) })]) }
  const parsed = DocTemplateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, issues: withMessages(fromZodIssues(parsed.error.issues, [], input)) }
  const template = parsed.data
  if (options.kind && template.kind !== options.kind) return { ok: false, issues: withMessages([issue('error', 'kind_mismatch', ['kind'])]) }
  return { ok: true, template, issues: withMessages(templateIssues(template).filter((i) => i.severity !== 'error')) }
}

export function isValidDocTemplate(input: unknown): input is DocTemplate {
  return DocTemplateSchema.safeParse(input).success
}

/**
 * Referencia a una plantilla guardada en ajustes (`DocumentPrefs.quoteTemplate`): id de diseño
 * predefinido, id v4 heredado o id de plantilla de la organización.
 */
export const DocTemplateRefSchema = TemplateIdSchema

export interface ResolvedTemplateRef {
  /** Id a buscar: diseño predefinido o plantilla de la organización. */
  id: string
  source: 'preset' | 'legacy' | 'org' | 'default'
  /** Diseño predefinido de respaldo si la plantilla de la organización no existe o no es válida. */
  fallbackPresetId: DocPresetId
}

/**
 * Normaliza la plantilla elegida: ids v4 → diseño equivalente, ids desconocidos/vacíos → diseño
 * por defecto del tipo. Las plantillas de la organización se devuelven tal cual (el servidor las
 * busca y, si no existen, usa `fallbackPresetId`).
 */
export function resolveDocTemplateRef(value: unknown, kind: DocTemplateKind): ResolvedTemplateRef {
  const fallbackPresetId = kind === 'quote' ? DEFAULT_QUOTE_PRESET_ID : DEFAULT_CATALOG_PRESET_ID
  if (isDocPresetId(value)) {
    return presetKind(value) === kind ? { id: value, source: 'preset', fallbackPresetId } : { id: fallbackPresetId, source: 'default', fallbackPresetId }
  }
  if (isLegacyTemplateId(value)) {
    const id = LEGACY_TEMPLATE_PRESETS[value]
    return presetKind(id) === kind ? { id, source: 'legacy', fallbackPresetId } : { id: fallbackPresetId, source: 'default', fallbackPresetId }
  }
  if (isTemplateId(value)) return { id: value, source: 'org', fallbackPresetId }
  return { id: fallbackPresetId, source: 'default', fallbackPresetId }
}
