/**
 * Ajustes por cotización v2 (`Quote.documentOverrides`): textos por campo, visibilidad/orden/opciones
 * de secciones por id estable, ajustes de tema y página, notas por ítem, idioma del documento y
 * plantilla elegida. Reemplaza el v1 plano (`Partial<DocumentPrefs> & { notes }`), que se migra al
 * leer sin perder datos. Todo validado con tope: nunca más `z.record(unknown)`.
 */
import { z } from 'zod'
import type { DocumentPrefs } from '../api'
import { DOC_TEXT_LIMITS, QUOTE_DOC_OVERRIDES_VERSION, TEMPLATE_LIMITS as L, VALIDITY_DAYS_RANGE } from './limits'
import { DOC_LOCALES, isDocLocale, type DocLocale } from './locales'
import { ItemIdSchema, SectionIdSchema, TemplateIdSchema, docText, isSectionId, isTemplateId } from './fields'
import { ThemePatchSchema, applyThemePatch, repairTheme, PALETTE_ROLES, type DocThemePatch, type PaletteRole } from './theme'
import { PagePatchSchema, applyPagePatch, pageSizeFromPaper } from './page'
import { DocSettingsSchema, resolveDocSettings, type CustomField, type DocSettings, type ResolvedDocSettings } from './settings'
import { SEEDED_TEXT_FIELDS, cleanSeededPrefs, isSeededText } from './seeded'
import {
  CLOSING_SECTIONS,
  ITEM_DRAWING_SIZES,
  DRAWING_VIEWS,
  FINISH_DISPLAYS,
  ITEM_GROUPINGS,
  PRICE_TAX_MODES,
  SECTION_DRAWING_STYLES,
  closingOrderViolation,
  withClosingLast,
  CustomTextSectionSchema,
  PAGE_BREAKS,
  PageBreakSectionSchema,
  REQUIRED_SECTIONS,
  SECTION_META,
  SECTION_TONES,
  SECTION_TYPES,
  applyOptionsPatch,
  newSectionId,
  normalizeSectionOptions,
  sectionOptionsPatchSchema,
  type CustomTextSection,
  type DocSection,
  type DocSectionType,
  type PageBreakSection,
  type SectionPageBreak,
  type SectionTone,
} from './sections'
import { DocTemplateSchema, resolveDocTemplateRef, type DocTemplate, type ResolvedTemplateRef } from './template'
import { cloneJson, ownValue, sanitizeDocText, truncateText, unsafeTextReason } from './safety'
import { invalidBraces, isPlaceholderKey, placeholderAllowed } from './placeholders'
import { fromZodIssues, issue, type DocIssue, type DocIssuePath } from './issues'
import { normalizeHex } from './color'
import { LEGACY_DOC_FONT_PAIRS, fontPairById } from './fonts'
import { isDocPresetId } from './preset-ids'
import { withMessages } from './i18n'

export const DOC_TEXT_FIELDS = ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText', 'signatureName', 'footer', 'clientNote', 'includes', 'excludes'] as const
export type DocTextField = (typeof DOC_TEXT_FIELDS)[number]

/** Campos de una sola línea (el resto admite párrafos y el Markdown mínimo de v4). */
const SINGLE_LINE_FIELDS: ReadonlySet<DocTextField> = new Set(['signatureName', 'leadTimeText'])

export function docTextSpec(field: DocTextField) {
  return { max: DOC_TEXT_LIMITS[field], multiline: !SINGLE_LINE_FIELDS.has(field), placeholders: true }
}

const textField = (field: DocTextField) => docText(docTextSpec(field)).optional()

export const DocTextsSchema = z.strictObject({
  intro: textField('intro'),
  conditions: textField('conditions'),
  paymentTerms: textField('paymentTerms'),
  warranty: textField('warranty'),
  leadTimeText: textField('leadTimeText'),
  signatureName: textField('signatureName'),
  footer: textField('footer'),
  clientNote: textField('clientNote'),
  includes: textField('includes'),
  excludes: textField('excludes'),
})
export type DocTexts = z.infer<typeof DocTextsSchema>

const optionalBool = z.boolean().optional()

/** Ajustes de presentación que se aplican a TODAS las secciones de ítems. */
export const ItemDisplaySchema = z.strictObject({
  showUnitPrices: optionalBool,
  showLineTotals: optionalBool,
  showArea: optionalBool,
  showGlass: optionalBool,
  showSystem: optionalBool,
  showSwatches: optionalBool,
  showSpecs: optionalBool,
  showNotes: optionalBool,
  showPerformance: optionalBool,
  showRef: optionalBool,
  showSize: optionalBool,
  showQty: optionalBool,
  showLocation: optionalBool,
  showOpening: optionalBool,
  showAccessories: optionalBool,
  showHardware: optionalBool,
  showGlassBuildup: optionalBool,
  showGlassImage: optionalBool,
  showRoughOpening: optionalBool,
  showColorNote: optionalBool,
  showOtherLines: optionalBool,
  showGroupSubtotals: optionalBool,
  groupPageBreak: optionalBool,
  finishes: z.enum(FINISH_DISPLAYS).optional(),
  drawingView: z.enum(DRAWING_VIEWS).optional(),
  drawingStyle: z.enum(SECTION_DRAWING_STYLES).optional(),
  drawingSize: z.enum(ITEM_DRAWING_SIZES).optional(),
  groupBy: z.enum(ITEM_GROUPINGS).optional(),
  priceTax: z.enum(PRICE_TAX_MODES).optional(),
})
export type ItemDisplay = z.infer<typeof ItemDisplaySchema>
export const ITEM_DISPLAY_KEYS = Object.keys(ItemDisplaySchema.shape) as (keyof ItemDisplay)[]

export const ItemOverrideSchema = z.strictObject({
  /** Nota visible para el cliente bajo el ítem. */
  note: docText({ max: L.itemNoteMax, multiline: true, placeholders: false }).optional(),
})
export type ItemOverride = z.infer<typeof ItemOverrideSchema>

export interface SectionOverride {
  type: DocSectionType
  enabled?: boolean
  /** `null` = quitar el título propio de la plantilla (usar el predeterminado). */
  title?: string | null
  tone?: SectionTone
  pageBreak?: SectionPageBreak
  /** Parche validado contra las opciones del tipo (`null` borra opcionales). */
  options?: Record<string, unknown>
}

const sectionOverrideSchemas = SECTION_TYPES.map((type) =>
  z.strictObject({
    type: z.literal(type),
    enabled: z.boolean().optional(),
    title: docText({ max: L.sectionTitleMax, multiline: false, placeholders: true }).nullable().optional(),
    tone: z.enum(SECTION_TONES).optional(),
    pageBreak: z.enum(PAGE_BREAKS).optional(),
    options: sectionOptionsPatchSchema(type).optional(),
  }),
)

export const SectionOverrideSchema = z.discriminatedUnion(
  'type',
  sectionOverrideSchemas as unknown as [(typeof sectionOverrideSchemas)[number], ...(typeof sectionOverrideSchemas)[number][]],
) as unknown as z.ZodType<SectionOverride>

export const AddedSectionSchema = z.discriminatedUnion('type', [CustomTextSectionSchema, PageBreakSectionSchema])
export type AddedSection = CustomTextSection | PageBreakSection

const countMax = (max: number) => (record: Record<string, unknown>, ctx: z.RefinementCtx) => {
  if (Object.keys(record).length > max) ctx.addIssue({ code: 'custom', message: 'too_many', params: { docCode: 'too_many', docParams: { max } } })
}

export const QuoteDocOverridesV2BaseSchema = z.strictObject({
    v: z.literal(QUOTE_DOC_OVERRIDES_VERSION),
    /** Plantilla elegida para esta cotización (diseño predefinido, id v4 o plantilla propia). */
    templateId: TemplateIdSchema.optional(),
    /** Idioma del documento (PDF, portal, correos). Si falta, el de la organización. */
    locale: z.enum(DOC_LOCALES).optional(),
    texts: DocTextsSchema.optional(),
    validityDays: z.number().int().min(VALIDITY_DAYS_RANGE.min).max(VALIDITY_DAYS_RANGE.max).optional(),
    theme: ThemePatchSchema.optional(),
    page: PagePatchSchema.optional(),
    /** Título, numeración, encabezado, orden de condiciones y marcas de esta cotización. */
    settings: DocSettingsSchema.optional(),
    /** Valores de los campos personalizados del encabezado, por id. */
    fields: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,23}$/), docText({ max: L.customFieldValueMax, multiline: false, placeholders: false })).superRefine(countMax(L.customFieldsMax)).optional(),
    itemDisplay: ItemDisplaySchema.optional(),
    sections: z.record(SectionIdSchema, SectionOverrideSchema).superRefine(countMax(L.sectionOverridesMax)).optional(),
    /** Orden deseado por id; los ids que falten conservan su posición relativa. */
    order: z.array(SectionIdSchema).max(L.sectionsMax + L.addedSectionsMax).optional(),
    /** Secciones propias de esta cotización (sólo texto libre y saltos de página). */
    added: z.array(AddedSectionSchema).max(L.addedSectionsMax).optional(),
    items: z.record(ItemIdSchema, ItemOverrideSchema).superRefine(countMax(L.itemNotesMax)).optional(),
  })

export const QuoteDocOverridesV2Schema = QuoteDocOverridesV2BaseSchema.superRefine((o, ctx) => {
    if (o.order && new Set(o.order).size !== o.order.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate_id', path: ['order'], params: { docCode: 'duplicate_id', docParams: { id: '' } } })
    }
    if (o.added) {
      const ids = o.added.map((s) => s.id)
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate_id', path: ['added'], params: { docCode: 'duplicate_id', docParams: { id: '' } } })
    }
  })

export type QuoteDocOverridesV2 = {
  v: 2
  templateId?: string
  locale?: DocLocale
  texts?: DocTexts
  validityDays?: number
  theme?: DocThemePatch
  page?: z.infer<typeof PagePatchSchema>
  settings?: DocSettings
  fields?: Record<string, string>
  itemDisplay?: ItemDisplay
  sections?: Record<string, SectionOverride>
  order?: string[]
  added?: AddedSection[]
  items?: Record<string, ItemOverride>
}

export function emptyQuoteDocOverrides(): QuoteDocOverridesV2 {
  return { v: QUOTE_DOC_OVERRIDES_VERSION }
}

export function isQuoteDocOverridesV2(value: unknown): value is QuoteDocOverridesV2 {
  return QuoteDocOverridesV2Schema.safeParse(value).success
}

/** Quita objetos vacíos para guardar lo mínimo (y comparar ajustes de forma estable). */
export function compactQuoteDocOverrides(o: QuoteDocOverridesV2): QuoteDocOverridesV2 {
  const out = cloneJson(o) as QuoteDocOverridesV2 & Record<string, unknown>
  const isEmpty = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0
  if (out.theme) {
    if (isEmpty(out.theme.palette)) delete out.theme.palette
    if (isEmpty(out.theme.fonts)) delete out.theme.fonts
  }
  if (out.page && isEmpty(out.page.margins)) delete out.page.margins
  if (out.sections) {
    for (const [id, s] of Object.entries(out.sections)) {
      if (s.options && isEmpty(s.options)) delete s.options
      if (Object.keys(s).length <= 1) delete out.sections[id]
    }
  }
  if (out.items) for (const [id, it] of Object.entries(out.items)) if (isEmpty(it)) delete out.items[id]
  for (const key of ['texts', 'theme', 'page', 'settings', 'fields', 'itemDisplay', 'sections', 'items'] as const) if (isEmpty(out[key])) delete out[key]
  if (out.order && out.order.length === 0) delete out.order
  if (out.added && out.added.length === 0) delete out.added
  return out
}

// ── Textos ──────────────────────────────────────────────────────────────────────────────────────

export interface RepairTextResult {
  text: string | null
  issues: DocIssue[]
}

/**
 * Repara un texto plano de documento (migración v1, comandos, IA): limpia invisibles, quita llaves
 * que no son marcadores válidos para cotizaciones y recorta al máximo. Si queda contenido inseguro
 * devuelve `null` (se descarta: nunca se "sanea" HTML para conservarlo).
 */
export function repairDocText(raw: string, field: DocTextField, path: DocIssuePath): RepairTextResult {
  const spec = docTextSpec(field)
  const issues: DocIssue[] = []
  let text = sanitizeDocText(raw, { multiline: spec.multiline })
  const reason = unsafeTextReason(text)
  if (reason) return { text: null, issues: [issue('warning', 'unsafe_text', path, { reason })] }
  text = stripInvalidPlaceholders(text, 'quote')
  if (text.length > spec.max) {
    text = truncateText(text, spec.max)
    issues.push(issue('warning', 'text_truncated', path, { max: spec.max }))
  }
  return { text, issues }
}

/** Quita llaves sueltas / marcadores desconocidos o no permitidos para el tipo (deja el texto interior). */
export function stripInvalidPlaceholders(text: string, kind: 'quote' | 'catalog'): string {
  let out = text.replace(/\{([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*)\}/g, (whole, key: string) =>
    isPlaceholderKey(key) && placeholderAllowed(key, kind) ? whole : '',
  )
  if (invalidBraces(out).length) {
    // Conserva los marcadores válidos y elimina cualquier otra llave.
    const keep: string[] = []
    out = out.replace(/\{([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*)\}/g, (whole) => {
      keep.push(whole)
      return `\u0000${keep.length - 1}\u0000`
    })
    out = out.replace(/[{}]/g, '').replace(/\u0000(\d+)\u0000/g, (_m, n: string) => keep[Number(n)])
  }
  return out.replace(/ {2,}/g, ' ').trim()
}

// ── Migración v1 → v2 ───────────────────────────────────────────────────────────────────────────

const V1_TEXT_FIELDS: readonly [keyof DocumentPrefs | 'notes', DocTextField][] = [
  ['intro', 'intro'],
  ['conditions', 'conditions'],
  ['paymentTerms', 'paymentTerms'],
  ['warranty', 'warranty'],
  ['leadTimeText', 'leadTimeText'],
  ['signatureName', 'signatureName'],
  ['footer', 'footer'],
  ['notes', 'clientNote'],
  ['includes', 'includes'],
  ['excludes', 'excludes'],
]

export interface MigrateOverridesOptions {
  /**
   * `quote` (por defecto): `Quote.documentOverrides` — todo lo explícito se conserva.
   * `org`: `OrgSettings.documents` como capa de organización sobre el diseño: conserva política y
   * marca (papel, precio unitario, acento elegido, textos, validez) pero no la tipografía ni los
   * demás interruptores de presentación v4, que ahora define cada diseño.
   */
  source?: 'quote' | 'org'
}

export interface MigrateOverridesResult {
  overrides: QuoteDocOverridesV2
  issues: DocIssue[]
  /** Venía en formato v1 (o era inválido) y se convirtió. */
  migrated: boolean
}

/** Valida días de validez como en v4 (`parseQuoteValidityDays`): número o texto numérico, 1–365. */
export function parseValidityDays(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return undefined
  const days = Math.round(n)
  return days >= VALIDITY_DAYS_RANGE.min && days <= VALIDITY_DAYS_RANGE.max ? days : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Convierte `Quote.documentOverrides` (v1 plano, v2 o basura) en v2 válido. Nunca lanza ni pierde
 * datos válidos: lo que no se puede conservar se informa en `issues`.
 */
export function migrateQuoteDocOverrides(input: unknown, options: MigrateOverridesOptions = {}): MigrateOverridesResult {
  const source = options.source ?? 'quote'
  if (input === null || input === undefined) return { overrides: emptyQuoteDocOverrides(), issues: [], migrated: false }
  if (!isRecord(input)) return { overrides: emptyQuoteDocOverrides(), issues: withMessages([issue('warning', 'value_dropped', [])]), migrated: true }
  if (input.v === QUOTE_DOC_OVERRIDES_VERSION) return repairOverridesV2(input)

  const issues: DocIssue[] = []
  const out: QuoteDocOverridesV2 = emptyQuoteDocOverrides()
  const texts: DocTexts = {}
  for (const [from, to] of V1_TEXT_FIELDS) {
    const raw = input[from]
    if (typeof raw !== 'string') continue
    const repaired = repairDocText(raw, to, ['texts', to])
    issues.push(...repaired.issues)
    if (repaired.text !== null) texts[to] = repaired.text
  }
  if (Object.keys(texts).length) out.texts = texts

  const days = parseValidityDays(input.validityDays)
  if (days !== undefined) out.validityDays = days

  if (source === 'quote') {
    const ref = resolveDocTemplateRef(input.quoteTemplate, 'quote')
    if (ref.source === 'preset' || ref.source === 'legacy') out.templateId = ref.id
  }

  const theme: DocThemePatch = {}
  const accent = normalizeHex(input.accent)
  if (accent) theme.palette = { accent }
  if (source === 'quote' && (input.font === 'instrument' || input.font === 'serif' || input.font === 'grotesk')) {
    const pair = fontPairById(LEGACY_DOC_FONT_PAIRS[input.font])!
    theme.fonts = { heading: pair.heading, body: pair.body, mono: pair.mono }
  }
  if (Object.keys(theme).length) out.theme = theme

  const size = pageSizeFromPaper(input.paper)
  if (size) out.page = { size }

  const display: ItemDisplay = {}
  if (typeof input.showUnitPrice === 'boolean') display.showUnitPrices = input.showUnitPrice
  if (source === 'quote') {
    if (typeof input.showArea === 'boolean') display.showArea = input.showArea
    if (typeof input.showGlass === 'boolean') display.showGlass = input.showGlass
    if (typeof input.showLine === 'boolean') display.showSystem = input.showLine
    if (typeof input.showColorSwatch === 'boolean') display.showSwatches = input.showColorSwatch
    if (typeof input.showExteriorView === 'boolean') display.drawingView = input.showExteriorView ? 'both' : 'interior'
  }
  if (Object.keys(display).length) out.itemDisplay = display

  // Capa del taller: decisiones que valen para todas sus cotizaciones.
  if (source === 'org' && input.settings !== undefined) {
    const parsed = DocSettingsSchema.safeParse(input.settings)
    if (parsed.success) out.settings = parsed.data
    else issues.push(issue('warning', 'value_dropped', ['settings']))
  }

  if (Object.keys(input).length) issues.push(issue('info', 'legacy_migrated', []))
  const parsed = QuoteDocOverridesV2Schema.safeParse(out)
  if (!parsed.success) {
    // No debería pasar (todo se construyó validado); por seguridad, se reparan campo a campo.
    return { ...repairOverridesV2(out as unknown as Record<string, unknown>), migrated: true }
  }
  return { overrides: compactQuoteDocOverrides(out), issues: withMessages(issues), migrated: true }
}

/** Valida un v2 y descarta, campo por campo, lo que no cumpla (no todo o nada). */
function repairOverridesV2(input: Record<string, unknown>): MigrateOverridesResult {
  const whole = QuoteDocOverridesV2Schema.safeParse(input)
  if (whole.success) return { overrides: compactQuoteDocOverrides(whole.data as QuoteDocOverridesV2), issues: [], migrated: false }
  const issues: DocIssue[] = []
  const out: Record<string, unknown> = { v: QUOTE_DOC_OVERRIDES_VERSION }
  const objectShape = QuoteDocOverridesV2BaseSchema.shape as Record<string, z.ZodType>
  for (const [key, value] of Object.entries(input)) {
    if (key === 'v') continue
    const field = Object.hasOwn(objectShape, key) ? objectShape[key] : undefined
    if (!field) {
      issues.push(issue('warning', 'value_dropped', [key]))
      continue
    }
    if ((key === 'texts' || key === 'sections' || key === 'items') && isRecord(value)) {
      const entrySchema = key === 'texts' ? null : key === 'sections' ? SectionOverrideSchema : ItemOverrideSchema
      const kept: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        if (key === 'texts') {
          if (!(DOC_TEXT_FIELDS as readonly string[]).includes(k) || typeof v !== 'string') {
            issues.push(issue('warning', 'value_dropped', [key, k]))
            continue
          }
          const repaired = repairDocText(v, k as DocTextField, [key, k])
          issues.push(...repaired.issues)
          if (repaired.text !== null) kept[k] = repaired.text
          continue
        }
        const keyOk = key === 'sections' ? isSectionId(k) : ItemIdSchema.safeParse(k).success
        if (keyOk && entrySchema!.safeParse(v).success) kept[k] = v
        else issues.push(issue('warning', 'value_dropped', [key, k]))
      }
      if (Object.keys(kept).length) out[key] = kept
      continue
    }
    if (key === 'added' && Array.isArray(value)) {
      const seen = new Set<string>()
      const kept = value.filter((s, i) => {
        const ok = AddedSectionSchema.safeParse(s).success && !seen.has((s as { id: string }).id)
        if (ok) seen.add((s as { id: string }).id)
        else issues.push(issue('warning', 'section_dropped', [key, i]))
        return ok
      })
      if (kept.length) out.added = kept.slice(0, L.addedSectionsMax)
      continue
    }
    if (key === 'order' && Array.isArray(value)) {
      const order = [...new Set(value.filter((id): id is string => isSectionId(id)))]
      if (order.length) out.order = order.slice(0, L.sectionsMax + L.addedSectionsMax)
      continue
    }
    if (field.safeParse(value).success) out[key] = value
    else issues.push(issue('warning', 'value_dropped', [key]))
  }
  const final = QuoteDocOverridesV2Schema.safeParse(out)
  if (!final.success) {
    issues.push(...fromZodIssues(final.error.issues, [], out).map((i) => ({ ...i, severity: 'warning' as const })))
    return { overrides: emptyQuoteDocOverrides(), issues: withMessages(issues), migrated: true }
  }
  return { overrides: compactQuoteDocOverrides(final.data as QuoteDocOverridesV2), issues: withMessages(issues), migrated: true }
}

// ── Fusión plantilla ⊕ ajustes ──────────────────────────────────────────────────────────────────

/** Posición por defecto para insertar: antes de la sección de cierre (aceptación/contacto). */
export function defaultInsertIndex(sections: readonly { type: DocSectionType }[], type: DocSectionType): number {
  if (type === 'cover') return 0
  const first = (types: readonly DocSectionType[]) => sections.findIndex((s) => types.includes(s.type))
  // El cierre mantiene su orden: total → opcionales → pago → garantía → condiciones → aceptación.
  const before = (types: readonly DocSectionType[]) => {
    const at = first(types)
    return at >= 0 ? at : sections.length
  }
  if (type === 'acceptance') return sections.length
  if (type === 'terms') return before(['acceptance'])
  if (type === 'warranty') return before(['terms', 'acceptance'])
  if (type === 'payment') return before(['warranty', 'terms', 'acceptance'])
  if (type === 'options_comparison') return before(['payment', 'warranty', 'terms', 'acceptance'])
  if (type === 'totals') return before(['options_comparison', 'payment', 'warranty', 'terms', 'acceptance'])
  return before(CLOSING_SECTIONS)
}

/**
 * Reordena según `order`: los ids listados ocupan, en ese orden, los lugares que ya ocupaban entre
 * todos ellos; los no listados no se mueven. Con un orden completo (lo que escriben las operaciones)
 * el resultado es exactamente ese orden; una sección nueva de la plantilla que el orden guardado no
 * conoce queda en su lugar de la plantilla. Ids desconocidos o repetidos se ignoran.
 */
export function applySectionOrder<T extends { id: string }>(sections: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order || order.length === 0) return [...sections]
  const byId = new Map(sections.map((s) => [s.id, s]))
  const listed = [...new Set(order)].filter((id) => byId.has(id))
  const listedSet = new Set(listed)
  let next = 0
  return sections.map((s) => (listedSet.has(s.id) ? byId.get(listed[next++])! : s))
}

export interface MergeResult {
  template: DocTemplate
  issues: DocIssue[]
}

/** Aplica ajustes de presentación de ítems a todas las secciones de ítems. */
function applyItemDisplay(sections: DocSection[], display: ItemDisplay, issues: DocIssue[]): void {
  sections.forEach((s, i) => {
    if (s.type !== 'items') return
    const patched = applyOptionsPatch<'items'>(s.options, display as Record<string, unknown>)
    const { options, adjusted } = normalizeSectionOptions('items', patched)
    s.options = options
    for (const key of adjusted) issues.push(issue('info', 'variant_adjusted', ['sections', i, 'options', key], { option: key, variant: options.variant }))
  })
}

/**
 * Plantilla de la organización ⊕ ajustes por cotización → plantilla resuelta (lista para renderizar).
 * Tolerante: ignora con aviso lo que ya no calza (ids viejos, tipos cambiados), repara contraste y
 * vuelve a mostrar secciones obligatorias. Pura; nunca lanza ni muta sus entradas.
 */
export function mergeTemplateOverrides(template: DocTemplate, overrides?: QuoteDocOverridesV2 | null): MergeResult {
  if (!overrides) return { template, issues: [] }
  const issues: DocIssue[] = []
  const t = cloneJson(template) as DocTemplate

  if (overrides.theme) {
    const locked = overrides.theme.palette ? (PALETTE_ROLES.filter((r) => overrides.theme!.palette![r] !== undefined) as PaletteRole[]) : []
    const repaired = repairTheme(applyThemePatch(t.theme, overrides.theme), { locked })
    t.theme = repaired.theme
    issues.push(...repaired.issues)
  }
  if (overrides.page) t.page = applyPagePatch(t.page, overrides.page)
  if (overrides.settings) t.settings = { ...(t.settings ?? {}), ...overrides.settings }
  if (overrides.itemDisplay) applyItemDisplay(t.sections, overrides.itemDisplay, issues)

  if (overrides.sections) {
    for (const [id, ov] of Object.entries(overrides.sections)) {
      const idx = t.sections.findIndex((s) => s.id === id)
      const section = t.sections[idx]
      if (!section || section.type !== ov.type) {
        issues.push(issue('warning', 'override_ignored', ['sections', id], { id }))
        continue
      }
      applySectionOverride(section, ov, ['sections', idx], issues)
    }
  }

  if (overrides.added?.length) {
    const taken = new Set(t.sections.map((s) => s.id))
    for (const raw of overrides.added) {
      const added = cloneJson(raw) as DocSection
      const max = SECTION_META[added.type].max
      if (t.sections.filter((s) => s.type === added.type).length >= max) {
        issues.push(issue('warning', 'section_dropped', ['added', added.id]))
        continue
      }
      if (taken.has(added.id)) {
        const newId = newSectionId(added.type, taken)
        issues.push(issue('info', 'id_renamed', ['added', added.id], { id: added.id, newId }))
        added.id = newId
      }
      taken.add(added.id)
      t.sections.splice(defaultInsertIndex(t.sections, added.type), 0, added)
    }
  }

  t.sections = applySectionOrder(t.sections, overrides.order)
  // El total va al final aunque un orden guardado diga otra cosa.
  if (t.kind === 'quote' && closingOrderViolation(t.sections) >= 0) {
    t.sections = withClosingLast(t.sections)
    issues.push(issue('info', 'section_moved', ['sections'], { section: 'totals' }))
  }
  const coverIdx = t.sections.findIndex((s) => s.type === 'cover')
  if (coverIdx > 0) {
    const [cover] = t.sections.splice(coverIdx, 1)
    t.sections.unshift(cover)
    issues.push(issue('info', 'section_moved', ['sections', 0], { section: 'cover' }))
  }
  ensureRequiredVisible(t, issues)

  const parsed = DocTemplateSchema.safeParse(t)
  if (!parsed.success) {
    const errs = fromZodIssues(parsed.error.issues, [], t).map((i) => ({ ...i, severity: 'warning' as const }))
    return { template, issues: withMessages([issue('error', 'template_invalid', []), ...errs]) }
  }
  return { template: parsed.data, issues: withMessages(issues) }
}

function applySectionOverride(section: DocSection, ov: SectionOverride, path: DocIssuePath, issues: DocIssue[]): void {
  const meta = SECTION_META[section.type]
  if (ov.enabled !== undefined) section.enabled = ov.enabled
  if (ov.pageBreak !== undefined) section.pageBreak = ov.pageBreak
  if (ov.tone !== undefined) {
    if (meta.tones.includes(ov.tone)) section.tone = ov.tone
    else issues.push(issue('warning', 'override_ignored', [...path, 'tone'], { id: section.id }))
  }
  if (ov.title !== undefined && meta.allowsTitle) {
    if (ov.title === null) delete section.title
    else section.title = ov.title
  }
  if (ov.options) {
    const parsed = sectionOptionsPatchSchema(section.type).safeParse(ov.options)
    if (!parsed.success) {
      issues.push(issue('warning', 'override_ignored', [...path, 'options'], { id: section.id }))
      return
    }
    const patched = applyOptionsPatch(section.options, parsed.data as Record<string, unknown>)
    const { options, adjusted } = normalizeSectionOptions(section.type, patched as never)
    ;(section as { options: unknown }).options = options
    for (const key of adjusted) issues.push(issue('info', 'variant_adjusted', [...path, 'options', key], { option: key, variant: String((options as { variant?: string }).variant ?? '') }))
  }
}

/** Vuelve a mostrar (o agrega) las secciones obligatorias si un ajuste las ocultó. */
function ensureRequiredVisible(t: DocTemplate, issues: DocIssue[]): void {
  const req = REQUIRED_SECTIONS[t.kind]
  for (const type of req.all) {
    if (t.sections.some((s) => s.type === type && s.enabled)) continue
    const first = t.sections.find((s) => s.type === type)
    if (first) {
      first.enabled = true
      issues.push(issue('warning', 'section_reenabled', ['sections', first.id], { section: type }))
    }
  }
  if (req.any.length && !t.sections.some((s) => req.any.includes(s.type) && s.enabled)) {
    const first = t.sections.find((s) => req.any.includes(s.type))
    if (first) {
      first.enabled = true
      issues.push(issue('warning', 'section_reenabled', ['sections', first.id], { section: first.type }))
    }
  }
}

/** Partes de los ajustes que describen la presentación: lo único que una plantilla puede recibir. */
const TEMPLATE_OVERRIDE_KEYS = ['theme', 'page', 'settings', 'itemDisplay', 'sections', 'order', 'added'] as const

/** Ajustes de presentación de una cotización (sección, tema, página…), sin textos ni datos propios. */
export function templateOverridesOf(overrides: QuoteDocOverridesV2): QuoteDocOverridesV2 {
  const out: Record<string, unknown> = { v: QUOTE_DOC_OVERRIDES_VERSION }
  for (const key of TEMPLATE_OVERRIDE_KEYS) if (overrides[key] !== undefined) out[key] = overrides[key]
  return compactQuoteDocOverrides(out as QuoteDocOverridesV2)
}

export interface PromotedOverrides {
  /** La plantilla con la presentación de la cotización ya incorporada (válida para guardar). */
  template: DocTemplate
  /** Lo que sigue siendo solo de la cotización: plantilla elegida, idioma, textos, vigencia, campos y notas. */
  rest: QuoteDocOverridesV2
}

/**
 * «Guardar en la plantilla»: pasa la presentación de una cotización a su plantilla y deja en la
 * cotización solo lo que es de ella. Pura; lo que no calce con la plantilla se ignora como al imprimir.
 */
export function promoteOverridesToTemplate(template: DocTemplate, overrides: QuoteDocOverridesV2): PromotedOverrides {
  const merged = mergeTemplateOverrides(template, templateOverridesOf(overrides)).template
  const rest = cloneJson(overrides) as QuoteDocOverridesV2
  for (const key of TEMPLATE_OVERRIDE_KEYS) delete rest[key]
  return { template: merged, rest: compactQuoteDocOverrides(rest) }
}

// ── Resolución completa para el renderizador ────────────────────────────────────────────────────

export interface ResolveQuoteDocumentInput {
  /** Plantilla elegida, ya validada (diseño predefinido o plantilla de la organización). */
  template: DocTemplate
  /** `OrgSettings.documents` (v4): textos, validez, papel, precio unitario y acento por defecto. */
  orgPrefs?: Partial<DocumentPrefs> | null
  /** `Quote.documentOverrides` crudo (v1 o v2). */
  overrides?: unknown
  /**
   * Color de marca de la organización (`Org.accent`). Junto con `orgPrefs.accent` sólo se aplica a
   * diseños predefinidos: una plantilla propia ya trae sus colores elegidos.
   */
  brandAccent?: string | null
  /** Idioma de documento por defecto de la organización. */
  orgLocale?: DocLocale | null
}

/** Campo personalizado del encabezado con su valor en esta cotización. */
export interface ResolvedCustomField extends CustomField {
  value: string
}

export interface ResolvedQuoteDocument {
  template: DocTemplate
  /** Textos efectivos (cotización sobre organización). Faltantes → textos por defecto del renderizador. */
  texts: DocTexts
  validityDays?: number
  locale: DocLocale | undefined
  /** Notas por id de ítem. */
  itemNotes: Record<string, string>
  /** Plantilla ⊕ taller ⊕ cotización, con los valores por defecto. */
  settings: ResolvedDocSettings
  /** Campos personalizados que tienen valor. */
  customFields: ResolvedCustomField[]
  /** Ajustes v2 migrados (para guardar de vuelta si `migrated`). */
  overrides: QuoteDocOverridesV2
  migrated: boolean
  issues: DocIssue[]
}

/**
 * Color de marca sobre un diseño predefinido: si el diseño usa un mismo color para acento y campos
 * intensos (la portada), la marca cambia ambos; si no, la portada quedaría con el color del diseño.
 */
export function brandPalette(template: Pick<DocTemplate, 'theme'>, accent: string): { accent: string; strong?: string } {
  const p = template.theme.palette
  return normalizeHex(p.strong) === normalizeHex(p.accent) ? { accent, strong: accent } : { accent }
}

/**
 * Todo lo que necesita el renderizador de una cotización: plantilla ⊕ capa de organización ⊕ ajustes
 * de la cotización, textos efectivos, validez, idioma y notas por ítem.
 */
export function resolveQuoteDocument(input: ResolveQuoteDocumentInput): ResolvedQuoteDocument {
  const issues: DocIssue[] = []
  const org = migrateQuoteDocOverrides(input.orgPrefs ? cleanSeededPrefs(input.orgPrefs) : null, { source: 'org' })
  const orgLayer = org.overrides
  const isPreset = isDocPresetId(input.template.id) && input.template.presetId === input.template.id
  if (isPreset) {
    const accent = normalizeHex(input.orgPrefs?.accent) ?? normalizeHex(input.brandAccent)
    if (accent) orgLayer.theme = { ...(orgLayer.theme ?? {}), palette: { ...(orgLayer.theme?.palette ?? {}), ...brandPalette(input.template, accent) } }
  } else if (orgLayer.theme?.palette?.accent) {
    delete orgLayer.theme.palette.accent
  }
  // La capa de organización no elige plantilla ni secciones.
  delete orgLayer.templateId

  const quote = migrateQuoteDocOverrides(input.overrides ?? null, { source: 'quote' })
  const first = mergeTemplateOverrides(input.template, compactQuoteDocOverrides(orgLayer))
  const second = mergeTemplateOverrides(first.template, quote.overrides)
  issues.push(...quote.issues, ...first.issues, ...second.issues)

  const itemNotes: Record<string, string> = {}
  for (const [id, it] of Object.entries(quote.overrides.items ?? {})) if (it.note) itemNotes[id] = it.note

  const locale = quote.overrides.locale ?? (isDocLocale(input.orgLocale) ? input.orgLocale : undefined)
  const texts: DocTexts = { ...(orgLayer.texts ?? {}), ...(quote.overrides.texts ?? {}) }
  for (const field of SEEDED_TEXT_FIELDS) if (isSeededText(field, texts[field])) texts[field] = ''
  const settings = resolveDocSettings(second.template.settings)
  const values = quote.overrides.fields ?? {}
  const customFields = settings.customFields.flatMap((f) => {
    const value = ownValue(values, f.id)?.trim()
    return value ? [{ ...f, value }] : []
  })
  return {
    template: second.template,
    texts,
    validityDays: quote.overrides.validityDays ?? orgLayer.validityDays,
    locale,
    itemNotes,
    settings,
    customFields,
    overrides: quote.overrides,
    migrated: quote.migrated,
    issues: withMessages(issues),
  }
}

/**
 * Plantilla a usar para una cotización: la elegida en la cotización o, si no, la de la organización
 * (ids v4 traducidos; ids desconocidos → diseño por defecto).
 */
export function pickQuoteTemplateRef(orgPrefs: Partial<DocumentPrefs> | null | undefined, overrides: unknown): ResolvedTemplateRef {
  const quote = migrateQuoteDocOverrides(overrides ?? null, { source: 'quote' }).overrides
  const chosen = quote.templateId ?? (orgPrefs as { quoteTemplate?: unknown } | null | undefined)?.quoteTemplate
  return resolveDocTemplateRef(isTemplateId(chosen) ? chosen : undefined, 'quote')
}

/** Lectura segura de un ajuste de sección (sin cadena de prototipos). */
export function sectionOverrideOf(o: QuoteDocOverridesV2, id: string): SectionOverride | undefined {
  return ownValue(o.sections, id)
}
