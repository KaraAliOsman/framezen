/**
 * Operaciones de edición tipadas (`DocOp`) y `applyDocOps`, compartidas por el editor (una entrada de
 * deshacer por operación), los comandos locales, la validación del servidor y las herramientas de la
 * IA. Direccionan por id estable (no por índice), validan cada valor y el resultado final, son puras
 * (no mutan la entrada) e idempotentes cuando el significado lo permite (`toggleSection` con
 * `enabled` explícito, `set*`, `removeSection` de algo ya quitado → sin cambios).
 *
 * No existen operaciones sobre montos, cantidades, geometría ni destino de aceptación.
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L } from './limits'
import { DOC_LOCALES } from './locales'
import { HexColorSchema, ItemIdSchema, SectionIdSchema, TemplateIdSchema } from './fields'
import { DOC_FONT_IDS, DOC_FONT_PAIR_IDS, DOC_FONTS, fontAllows, fontPairById, fontPairLabel, nearestFontWeight, type DocFontId } from './fonts'
import { DRAWING_STYLES, PALETTE_ROLES, ThemePatchSchema, applyThemePatch, repairTheme, type DocThemePatch, type PaletteRole } from './theme'
import { PagePatchSchema, applyPagePatch } from './page'
import { RichBlockSchema, RichTextSchema, emptyRichText, richTextFromPlain, type RichText } from './richtext'
import { DocSettingsPatchSchema, DocSettingsSchema, applySettingsPatch, applyTermsPlacement, resolveDocSettings, type DocSettings } from './settings'
import {
  PAGE_BREAKS,
  REQUIRED_SECTIONS,
  SECTION_META,
  SECTION_TONES,
  SECTION_TYPES,
  applyOptionsPatch,
  createSection,
  newSectionId,
  normalizeSectionOptions,
  closingOrderViolation,
  sectionOptionsPatchSchema,
  sectionRichText,
  type DocSection,
  type DocSectionType,
} from './sections'
import { DocTemplateSchema, type DocTemplate } from './template'
import {
  DOC_TEXT_FIELDS,
  ItemDisplaySchema,
  QuoteDocOverridesV2Schema,
  compactQuoteDocOverrides,
  defaultInsertIndex,
  docTextSpec,
  mergeTemplateOverrides,
  type AddedSection,
  type QuoteDocOverridesV2,
  type SectionOverride,
} from './overrides'
import { DOC_PRESETS } from './presets'
import { DOC_PRESET_IDS, isDocPresetId } from './preset-ids'
import { cloneJson, jsonEqual, ownValue, sanitizeDocText, truncateText, unsafeTextReason } from './safety'
import { invalidBraces, placeholderAllowed, placeholdersIn } from './placeholders'
import { fromZodIssues, hasErrors, issue, type DocIssue, type DocIssueCode, type DocIssueParams, type DocIssuePath } from './issues'
import type { DocTemplateKind } from './kinds'
import { docLocaleLabel, docOpText, paletteRoleLabel, presetName, sectionLabel, templateMessages, textFieldLabel, variantLabel, withMessages } from './i18n'

export const SECTION_TEXT_SLOTS = ['title', 'subtitle', 'content'] as const
export const RESET_SCOPES = ['all', 'theme', 'texts', 'sections', 'order', 'page', 'items', 'locale', 'template', 'settings'] as const
/** Cuánto precio se ve antes del cierre: unitario y por ítem, por ítem, por grupo o solo el total. */
export const PRICE_LEVELS = ['full', 'lines', 'groups', 'total'] as const
export type PriceLevel = (typeof PRICE_LEVELS)[number]
export const RICH_TEXT_ACTIONS = ['append', 'insert', 'replace', 'remove', 'move'] as const
export type ResetScope = (typeof RESET_SCOPES)[number]

const sectionTypeEnum = z.enum(SECTION_TYPES as unknown as [DocSectionType, ...DocSectionType[]])
const optionsRecord = z.record(z.string().regex(/^[a-zA-Z]{1,40}$/), z.unknown())
const index = z.number().int().min(0).max(1000)
const rawLine = (max: number) => z.string().max(max * 2)

const anchor = {
  /** Insertar/mover justo después de esta sección. */
  afterId: SectionIdSchema.optional(),
  /** Insertar/mover justo antes de esta sección. */
  beforeId: SectionIdSchema.optional(),
  position: z.enum(['start', 'end']).optional(),
}

const itemDisplayPatch = z.strictObject(
  Object.fromEntries(Object.entries(ItemDisplaySchema.shape).map(([k, s]) => [k, (s as z.ZodOptional<z.ZodType>).unwrap().nullable().optional()])),
)

/** Lo que un nivel de precio escribe en la presentación de ítems. */
export function priceLevelDisplay(level: PriceLevel): Record<string, boolean> {
  if (level === 'full') return { showUnitPrices: true, showLineTotals: true }
  if (level === 'lines') return { showUnitPrices: false, showLineTotals: true }
  return { showUnitPrices: false, showLineTotals: false, showGroupSubtotals: level === 'groups' }
}

/** Nivel de precio que corresponde a unas opciones de ítems. */
export function priceLevelOf(o: { showUnitPrices: boolean; showLineTotals: boolean; showGroupSubtotals: boolean }): PriceLevel {
  if (o.showLineTotals) return o.showUnitPrices ? 'full' : 'lines'
  return o.showGroupSubtotals ? 'groups' : 'total'
}

export const AddSectionInputSchema = z.strictObject({
  type: sectionTypeEnum,
  id: SectionIdSchema.optional(),
  enabled: z.boolean().optional(),
  pageBreak: z.enum(PAGE_BREAKS).optional(),
  tone: z.enum(SECTION_TONES).optional(),
  title: rawLine(L.sectionTitleMax).optional(),
  /** Opciones parciales del tipo (el resto toma valores por defecto). */
  options: optionsRecord.optional(),
})

export const DocOpSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('rename'), name: rawLine(L.nameMax) }),
  z.strictObject({ op: z.literal('setDescription'), description: rawLine(L.descriptionMax).nullable() }),
  z.strictObject({ op: z.literal('setTheme'), patch: ThemePatchSchema }),
  z.strictObject({ op: z.literal('setColor'), role: z.enum(PALETTE_ROLES), value: HexColorSchema }),
  z.strictObject({
    op: z.literal('setFontPair'),
    pairId: z.enum(DOC_FONT_PAIR_IDS).optional(),
    heading: z.enum(DOC_FONT_IDS).optional(),
    body: z.enum(DOC_FONT_IDS).optional(),
    mono: z.enum(DOC_FONT_IDS).optional(),
  }),
  z.strictObject({ op: z.literal('setDrawingStyle'), style: z.enum(DRAWING_STYLES), sectionId: SectionIdSchema.optional() }),
  z.strictObject({ op: z.literal('setPage'), patch: PagePatchSchema }),
  z.strictObject({ op: z.literal('addSection'), section: AddSectionInputSchema, ...anchor }),
  z.strictObject({ op: z.literal('removeSection'), sectionId: SectionIdSchema }),
  z.strictObject({ op: z.literal('moveSection'), sectionId: SectionIdSchema, ...anchor, toIndex: index.optional() }),
  z.strictObject({ op: z.literal('updateSectionOptions'), sectionId: SectionIdSchema, options: optionsRecord }),
  z.strictObject({
    op: z.literal('updateSection'),
    sectionId: SectionIdSchema,
    patch: z.strictObject({
      enabled: z.boolean().optional(),
      title: rawLine(L.sectionTitleMax).nullable().optional(),
      tone: z.enum(SECTION_TONES).optional(),
      pageBreak: z.enum(PAGE_BREAKS).optional(),
    }),
  }),
  z.strictObject({ op: z.literal('toggleSection'), sectionId: SectionIdSchema, enabled: z.boolean().optional() }),
  z.strictObject({ op: z.literal('duplicateSection'), sectionId: SectionIdSchema, newId: SectionIdSchema.optional() }),
  z.strictObject({ op: z.literal('setText'), field: z.enum(DOC_TEXT_FIELDS), value: z.string().max(16_000).nullable() }),
  z.strictObject({
    op: z.literal('setSectionText'),
    sectionId: SectionIdSchema,
    slot: z.enum(SECTION_TEXT_SLOTS),
    value: z.union([z.string().max(L.richTextTotalCharsMax * 2), RichTextSchema]).nullable(),
  }),
  z.strictObject({
    op: z.literal('editRichText'),
    sectionId: SectionIdSchema,
    action: z.enum(RICH_TEXT_ACTIONS),
    index: index.optional(),
    toIndex: index.optional(),
    block: RichBlockSchema.optional(),
  }),
  z.strictObject({ op: z.literal('setTemplate'), templateId: TemplateIdSchema }),
  z.strictObject({ op: z.literal('setLocale'), locale: z.enum(DOC_LOCALES).nullable() }),
  z.strictObject({ op: z.literal('setValidityDays'), days: z.number().int().min(1).max(365).nullable() }),
  z.strictObject({ op: z.literal('setItemNote'), itemId: ItemIdSchema, note: z.string().max(L.itemNoteMax * 2).nullable() }),
  z.strictObject({ op: z.literal('setItemDisplay'), patch: itemDisplayPatch }),
  z.strictObject({ op: z.literal('setPriceLevel'), level: z.enum(PRICE_LEVELS) }),
  z.strictObject({ op: z.literal('setDocSettings'), patch: DocSettingsPatchSchema }),
  z.strictObject({ op: z.literal('setCustomField'), fieldId: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/), value: z.string().max(L.customFieldValueMax * 2).nullable() }),
  z.strictObject({ op: z.literal('resetSection'), sectionId: SectionIdSchema }),
  z.strictObject({ op: z.literal('reset'), scope: z.enum(RESET_SCOPES) }),
  z.strictObject({ op: z.literal('resetToPreset'), presetId: z.enum(DOC_PRESET_IDS).optional() }),
])

export type DocOp = z.infer<typeof DocOpSchema>
export type DocOpName = DocOp['op']
export const DOC_OP_NAMES = DocOpSchema.options.map((o) => o.shape.op.value) as DocOpName[]

/** Operaciones válidas sobre una plantilla / sobre los ajustes de una cotización. */
export const TEMPLATE_OPS: readonly DocOpName[] = [
  'rename', 'setDescription', 'setTheme', 'setColor', 'setFontPair', 'setDrawingStyle', 'setPage', 'addSection', 'removeSection',
  'moveSection', 'updateSectionOptions', 'updateSection', 'toggleSection', 'duplicateSection', 'setSectionText', 'editRichText',
  'setItemDisplay', 'setPriceLevel', 'setDocSettings', 'resetToPreset',
]
export const OVERRIDE_OPS: readonly DocOpName[] = [
  'setTheme', 'setColor', 'setFontPair', 'setDrawingStyle', 'setPage', 'addSection', 'removeSection', 'moveSection',
  'updateSectionOptions', 'updateSection', 'toggleSection', 'duplicateSection', 'setText', 'setSectionText', 'editRichText',
  'setTemplate', 'setLocale', 'setValidityDays', 'setItemNote', 'setItemDisplay', 'setPriceLevel', 'setDocSettings', 'setCustomField', 'resetSection', 'reset',
]

export interface ApplyDocOpsOptions {
  /**
   * Plantilla base sobre la que se aplican los ajustes por cotización. Necesaria para operaciones de
   * sección/tema sobre `QuoteDocOverridesV2` (saber qué secciones existen y validar el resultado).
   */
  template?: DocTemplate
  /** `atomic` (por defecto): si algo falla no se aplica nada. `best_effort`: salta lo inválido. */
  mode?: 'atomic' | 'best_effort'
}

export interface ApplyDocOpsResult<T> {
  /** Sin errores (el resultado es válido y contiene todos los cambios pedidos). */
  ok: boolean
  /** Nuevo valor (o la MISMA referencia de entrada si nada cambió o se rechazó). */
  result: T
  issues: DocIssue[]
  /** Índices de operaciones aplicadas. */
  applied: number[]
  changed: boolean
}

interface OpCtx {
  issues: DocIssue[]
  opIndex: number
}

const push = (ctx: OpCtx, severity: DocIssue['severity'], code: DocIssueCode, path: DocIssuePath = [], params?: DocIssueParams) => {
  ctx.issues.push({ ...issue(severity, code, ['ops', ctx.opIndex, ...path], params), opIndex: ctx.opIndex })
}
const fail = (ctx: OpCtx, code: DocIssueCode, path: DocIssuePath = [], params?: DocIssueParams) => push(ctx, 'error', code, path, params)

interface TextSpec {
  max: number
  multiline: boolean
  placeholders: boolean
  kind: DocTemplateKind
}

/** Limpia y valida un texto de operación. `null` = rechazado (ya informado). */
function cleanText(raw: string, spec: TextSpec, ctx: OpCtx, path: DocIssuePath): string | null {
  let text = sanitizeDocText(raw, { multiline: spec.multiline })
  const reason = unsafeTextReason(text)
  if (reason) {
    fail(ctx, 'unsafe_text', path, { reason })
    return null
  }
  const bad = invalidBraces(text)
  if (bad.length) {
    fail(ctx, spec.placeholders ? 'invalid_placeholder' : 'placeholder_in_text', path, { value: bad[0] })
    return null
  }
  for (const key of placeholdersIn(text)) {
    if (!placeholderAllowed(key, spec.kind)) {
      fail(ctx, 'placeholder_not_allowed', path, { key })
      return null
    }
  }
  if (text.length > spec.max) {
    text = truncateText(text, spec.max)
    push(ctx, 'warning', 'text_truncated', path, { max: spec.max })
  }
  return text
}

function cleanRichText(value: string | RichText, ctx: OpCtx, path: DocIssuePath): RichText | null {
  if (typeof value !== 'string') return value
  const reason = unsafeTextReason(sanitizeDocText(value, { multiline: true }))
  if (reason) {
    fail(ctx, 'unsafe_text', path, { reason })
    return null
  }
  const doc = richTextFromPlain(value)
  const parsed = RichTextSchema.safeParse(doc)
  if (!parsed.success) {
    for (const i of fromZodIssues(parsed.error.issues, ['ops', ctx.opIndex, ...path], doc)) ctx.issues.push({ ...i, opIndex: ctx.opIndex })
    return null
  }
  return parsed.data
}

/** Parche de opciones validado para un tipo (errores informados). */
function parseOptionsPatch(type: DocSectionType, raw: Record<string, unknown>, ctx: OpCtx, path: DocIssuePath): Record<string, unknown> | null {
  const parsed = sectionOptionsPatchSchema(type).safeParse(raw)
  if (!parsed.success) {
    for (const i of fromZodIssues(parsed.error.issues, ['ops', ctx.opIndex, ...path], raw)) ctx.issues.push({ ...i, opIndex: ctx.opIndex })
    return null
  }
  return parsed.data as Record<string, unknown>
}

interface AnchorInput {
  afterId?: string
  beforeId?: string
  position?: 'start' | 'end'
  toIndex?: number
}

/** Índice destino en una lista (sin el elemento que se mueve). `undefined` = usar el predeterminado. */
function anchorIndex(list: readonly { id: string }[], a: AnchorInput, ctx: OpCtx): number | null | undefined {
  if (a.afterId !== undefined) {
    const i = list.findIndex((s) => s.id === a.afterId)
    if (i < 0) {
      fail(ctx, 'target_not_found', ['afterId'], { id: a.afterId })
      return null
    }
    return i + 1
  }
  if (a.beforeId !== undefined) {
    const i = list.findIndex((s) => s.id === a.beforeId)
    if (i < 0) {
      fail(ctx, 'target_not_found', ['beforeId'], { id: a.beforeId })
      return null
    }
    return i
  }
  if (a.position === 'start') return 0
  if (a.position === 'end') return list.length
  if (a.toIndex !== undefined) return Math.min(Math.max(0, a.toIndex), list.length)
  return undefined
}

/** La portada siempre queda primera: nada se inserta delante de ella. */
function respectCover(list: readonly { type: DocSectionType }[], at: number, movingType: DocSectionType, ctx: OpCtx): number {
  if (movingType === 'cover') return 0
  if (at === 0 && list[0]?.type === 'cover') {
    push(ctx, 'info', 'section_moved', [], { section: movingType })
    return 1
  }
  return at
}

function wouldHideLastRequired(sections: readonly DocSection[], kind: DocTemplateKind, id: string): DocSectionType | null {
  const target = sections.find((s) => s.id === id)
  if (!target || !target.enabled) return null
  const req = REQUIRED_SECTIONS[kind]
  const visibleOthers = (pred: (s: DocSection) => boolean) => sections.some((s) => s.id !== id && s.enabled && pred(s))
  if (req.all.includes(target.type) && !visibleOthers((s) => s.type === target.type)) return target.type
  if (req.any.includes(target.type) && !visibleOthers((s) => req.any.includes(s.type))) return target.type
  return null
}

function richEdit(current: RichText | undefined, op: Extract<DocOp, { op: 'editRichText' }>, ctx: OpCtx): RichText | null {
  const blocks = [...(current ?? emptyRichText()).blocks]
  const needIndex = (max: number) => {
    if (op.index === undefined || op.index > max) {
      fail(ctx, 'op_invalid', ['index'])
      return false
    }
    return true
  }
  switch (op.action) {
    case 'append':
      if (!op.block) return fail(ctx, 'missing_field', ['block']), null
      blocks.push(op.block)
      break
    case 'insert':
      if (!op.block) return fail(ctx, 'missing_field', ['block']), null
      if (!needIndex(blocks.length)) return null
      blocks.splice(op.index!, 0, op.block)
      break
    case 'replace':
      if (!op.block) return fail(ctx, 'missing_field', ['block']), null
      if (!needIndex(blocks.length - 1)) return null
      blocks[op.index!] = op.block
      break
    case 'remove':
      if (!needIndex(blocks.length - 1)) return null
      blocks.splice(op.index!, 1)
      break
    case 'move': {
      if (!needIndex(blocks.length - 1)) return null
      if (op.toIndex === undefined || op.toIndex > blocks.length - 1) return fail(ctx, 'op_invalid', ['toIndex']), null
      const [b] = blocks.splice(op.index!, 1)
      blocks.splice(op.toIndex, 0, b)
      break
    }
  }
  const parsed = RichTextSchema.safeParse({ blocks })
  if (!parsed.success) {
    for (const i of fromZodIssues(parsed.error.issues, ['ops', ctx.opIndex], { blocks })) ctx.issues.push({ ...i, opIndex: ctx.opIndex })
    return null
  }
  return parsed.data
}

function fontPatchFromOp(op: Extract<DocOp, { op: 'setFontPair' }>, ctx: OpCtx): { heading?: DocFontId; body?: DocFontId; mono?: DocFontId } | null {
  const pair = op.pairId ? fontPairById(op.pairId) : undefined
  const fonts = { heading: op.heading ?? pair?.heading, body: op.body ?? pair?.body, mono: op.mono ?? pair?.mono }
  if (!fonts.heading && !fonts.body && !fonts.mono) return fail(ctx, 'missing_field', ['pairId']), null
  for (const role of ['heading', 'body', 'mono'] as const) {
    const id = fonts[role]
    if (id && !fontAllows(id, role)) return fail(ctx, 'font_role', [role], { font: DOC_FONTS[id].family, role }), null
  }
  const out: { heading?: DocFontId; body?: DocFontId; mono?: DocFontId } = {}
  if (fonts.heading) out.heading = fonts.heading
  if (fonts.body) out.body = fonts.body
  if (fonts.mono) out.mono = fonts.mono
  return out
}

// ── Operaciones sobre plantillas ────────────────────────────────────────────────────────────────

function applyTemplateOp(t: DocTemplate, op: DocOp, ctx: OpCtx): void {
  const find = (id: string) => t.sections.findIndex((s) => s.id === id)
  const need = (id: string): DocSection | null => {
    const i = find(id)
    if (i < 0) {
      fail(ctx, 'target_not_found', ['sectionId'], { id })
      return null
    }
    return t.sections[i]
  }
  switch (op.op) {
    case 'rename': {
      const name = cleanText(op.name, { max: L.nameMax, multiline: false, placeholders: false, kind: t.kind }, ctx, ['name'])
      if (name === null) return
      if (!name) return fail(ctx, 'missing_field', ['name'])
      t.name = name
      return
    }
    case 'setDescription': {
      if (op.description === null) {
        delete t.description
        return
      }
      const d = cleanText(op.description, { max: L.descriptionMax, multiline: false, placeholders: false, kind: t.kind }, ctx, ['description'])
      if (d === null) return
      if (d) t.description = d
      else delete t.description
      return
    }
    case 'setTheme':
    case 'setColor':
    case 'setFontPair': {
      let patch: DocThemePatch
      let locked: PaletteRole[] = []
      if (op.op === 'setTheme') {
        patch = op.patch
        locked = op.patch.palette ? PALETTE_ROLES.filter((r) => op.patch.palette![r] !== undefined) : []
      } else if (op.op === 'setColor') {
        patch = { palette: { [op.role]: op.value } }
        locked = [op.role]
      } else {
        const fonts = fontPatchFromOp(op, ctx)
        if (!fonts) return
        patch = { fonts }
      }
      if (patch.fonts) {
        for (const role of ['heading', 'body', 'mono'] as const) {
          const id = patch.fonts[role]
          if (id && !fontAllows(id, role)) return fail(ctx, 'font_role', ['patch', 'fonts', role], { font: DOC_FONTS[id].family, role })
        }
      }
      const repaired = repairTheme(applyThemePatch(t.theme, patch), { locked, path: ['theme'] })
      for (const i of repaired.issues) ctx.issues.push({ ...i, opIndex: ctx.opIndex })
      t.theme = repaired.theme
      return
    }
    case 'setDrawingStyle': {
      if (op.sectionId) {
        const s = need(op.sectionId)
        if (!s) return
        if (s.type !== 'items' && s.type !== 'product_cards') return fail(ctx, 'op_invalid', ['sectionId'])
        s.options.drawingStyle = op.style
        return
      }
      t.theme.drawingStyle = op.style
      // "Dibujos técnicos" significa todos: las secciones con estilo propio vuelven a heredar.
      for (const s of t.sections) if ((s.type === 'items' || s.type === 'product_cards') && s.options.drawingStyle !== 'inherit') s.options.drawingStyle = 'inherit'
      return
    }
    case 'setPage':
      t.page = applyPagePatch(t.page, op.patch)
      return
    case 'setDocSettings': {
      if (t.kind !== 'quote') return fail(ctx, 'op_not_supported', ['op'], { op: op.op })
      const next = cleanSettings(applySettingsPatch(t.settings, op.patch), ctx)
      if (!next) return
      t.settings = next
      // La lista de secciones del editor siempre dice el orden en que se imprime.
      if ('termsPlacement' in op.patch) t.sections = applyTermsPlacement(t.sections, resolveDocSettings(next).termsPlacement)
      return
    }
    case 'setPriceLevel':
    case 'setItemDisplay': {
      const patch = op.op === 'setPriceLevel' ? priceLevelDisplay(op.level) : Object.fromEntries(Object.entries(op.patch).filter(([, v]) => v !== null && v !== undefined))
      if (!t.sections.some((s) => s.type === 'items')) return fail(ctx, 'op_not_supported')
      if (op.op === 'setPriceLevel' && op.level === 'groups') for (const s of t.sections) if (s.type === 'items' && s.options.groupBy === 'none') s.options.groupBy = 'room'
      t.sections.forEach((s, i) => {
        if (s.type !== 'items') return
        const { options, adjusted } = normalizeSectionOptions('items', applyOptionsPatch<'items'>(s.options, patch))
        s.options = options
        for (const key of adjusted) push(ctx, 'info', 'variant_adjusted', ['sections', i, key], { option: key, variant: options.variant })
      })
      return
    }
    case 'addSection': {
      const input = op.section
      const meta = SECTION_META[input.type]
      if (!meta.kinds.includes(t.kind)) return fail(ctx, 'section_not_allowed', ['section', 'type'], { section: input.type, kind: t.kind })
      if (t.sections.filter((s) => s.type === input.type).length >= meta.max) return fail(ctx, 'section_limit', ['section', 'type'], { section: input.type, max: meta.max })
      if (input.id && find(input.id) >= 0) return fail(ctx, 'duplicate_id', ['section', 'id'], { id: input.id })
      if (input.tone && !meta.tones.includes(input.tone)) return fail(ctx, 'tone_not_allowed', ['section', 'tone'], { section: input.type, tone: input.tone })
      let title: string | undefined
      if (input.title !== undefined) {
        if (!meta.allowsTitle) return fail(ctx, 'title_not_allowed', ['section', 'title'], { section: input.type })
        const clean = cleanText(input.title, { max: L.sectionTitleMax, multiline: false, placeholders: true, kind: t.kind }, ctx, ['section', 'title'])
        if (clean === null) return
        title = clean || undefined
      }
      const patch = input.options ? parseOptionsPatch(input.type, input.options, ctx, ['section', 'options']) : {}
      if (patch === null) return
      const options = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null))
      const section = createSection({ type: input.type, id: input.id, enabled: input.enabled, pageBreak: input.pageBreak, tone: input.tone, title, options } as never, t.sections.map((s) => s.id)) as DocSection
      const at = anchorIndex(t.sections, op, ctx)
      if (at === null) return
      t.sections.splice(respectCover(t.sections, at ?? defaultInsertIndex(t.sections, input.type), input.type, ctx), 0, section)
      return
    }
    case 'removeSection': {
      const i = find(op.sectionId)
      if (i < 0) return push(ctx, 'warning', 'target_not_found', ['sectionId'], { id: op.sectionId })
      const required = wouldHideLastRequired(t.sections, t.kind, op.sectionId)
      if (required) return fail(ctx, 'section_required', ['sectionId'], { section: required })
      t.sections.splice(i, 1)
      return
    }
    case 'moveSection': {
      const i = find(op.sectionId)
      if (i < 0) return fail(ctx, 'target_not_found', ['sectionId'], { id: op.sectionId })
      const [moving] = t.sections.splice(i, 1)
      const at = anchorIndex(t.sections, op, ctx)
      if (at === null || at === undefined) {
        t.sections.splice(i, 0, moving)
        if (at === undefined) fail(ctx, 'missing_field', ['afterId'])
        return
      }
      t.sections.splice(respectCover(t.sections, at, moving.type, ctx), 0, moving)
      // Mover garantía o condiciones por encima o por debajo del total es cambiar su ubicación.
      if (moving.type === 'terms' || moving.type === 'warranty') syncTermsPlacement(t)
      return
    }
    case 'updateSectionOptions': {
      const s = need(op.sectionId)
      if (!s) return
      const patch = parseOptionsPatch(s.type, op.options, ctx, ['options'])
      if (!patch) return
      const merged = applyOptionsPatch(s.options as never, patch)
      const { options, adjusted } = normalizeSectionOptions(s.type, merged)
      ;(s as { options: unknown }).options = options
      reportAdjusted(adjusted, patch, String((options as { variant?: string }).variant ?? ''), ctx)
      return
    }
    case 'updateSection':
    case 'toggleSection': {
      const s = need(op.sectionId)
      if (!s) return
      const meta = SECTION_META[s.type]
      const patch = op.op === 'toggleSection' ? { enabled: op.enabled ?? !s.enabled } : op.patch
      if (patch.enabled === false) {
        const required = wouldHideLastRequired(t.sections, t.kind, s.id)
        if (required) return fail(ctx, 'section_required', ['sectionId'], { section: required })
      }
      if ('tone' in patch && patch.tone !== undefined) {
        if (!meta.tones.includes(patch.tone)) return fail(ctx, 'tone_not_allowed', ['patch', 'tone'], { section: s.type, tone: patch.tone })
        s.tone = patch.tone
      }
      if ('title' in patch && patch.title !== undefined) {
        if (!meta.allowsTitle) return fail(ctx, 'title_not_allowed', ['patch', 'title'], { section: s.type })
        if (patch.title === null) delete s.title
        else {
          const title = cleanText(patch.title, { max: L.sectionTitleMax, multiline: false, placeholders: true, kind: t.kind }, ctx, ['patch', 'title'])
          if (title === null) return
          if (title) s.title = title
          else delete s.title
        }
      }
      if ('pageBreak' in patch && patch.pageBreak !== undefined) s.pageBreak = patch.pageBreak
      if (patch.enabled !== undefined) s.enabled = patch.enabled
      return
    }
    case 'duplicateSection': {
      const i = find(op.sectionId)
      if (i < 0) return fail(ctx, 'target_not_found', ['sectionId'], { id: op.sectionId })
      const source = t.sections[i]
      const meta = SECTION_META[source.type]
      if (t.sections.filter((s) => s.type === source.type).length >= meta.max) return fail(ctx, 'section_limit', ['sectionId'], { section: source.type, max: meta.max })
      if (op.newId && find(op.newId) >= 0) return fail(ctx, 'duplicate_id', ['newId'], { id: op.newId })
      const copy = cloneJson(source) as DocSection
      copy.id = op.newId ?? newSectionId(source.type, t.sections.map((s) => s.id))
      t.sections.splice(i + 1, 0, copy)
      return
    }
    case 'setSectionText': {
      const s = need(op.sectionId)
      if (!s) return
      const value = applySectionTextValue(s, op, t.kind, ctx)
      if (value === undefined) return
      writeSectionText(s, op.slot, value)
      return
    }
    case 'editRichText': {
      const s = need(op.sectionId)
      if (!s) return
      if (!SECTION_META[s.type].textSlots.includes('content')) return fail(ctx, 'op_invalid', ['sectionId'])
      const next = richEdit(sectionRichText(s), op, ctx)
      if (next) writeSectionText(s, 'content', next)
      return
    }
    case 'resetToPreset': {
      const presetId = op.presetId ?? t.presetId
      if (!presetId || !isDocPresetId(presetId)) return fail(ctx, 'op_invalid', ['presetId'])
      const preset = DOC_PRESETS[presetId]
      if (preset.kind !== t.kind) return fail(ctx, 'kind_mismatch', ['presetId'])
      t.theme = cloneJson(preset.theme)
      t.page = cloneJson(preset.page)
      t.sections = cloneJson(preset.sections) as DocSection[]
      t.presetId = presetId
      return
    }
    default:
      fail(ctx, 'op_not_supported', ['op'], { op: op.op })
  }
}

function syncTermsPlacement(t: DocTemplate): void {
  const totals = t.sections.findIndex((s) => s.type === 'totals')
  const terms = t.sections.findIndex((s) => s.type === 'terms')
  if (totals < 0 || terms < 0) return
  const current = resolveDocSettings(t.settings).termsPlacement
  const next = terms < totals ? 'before_total' : current === 'before_total' ? 'after_total' : current
  if (next !== current) t.settings = { ...(t.settings ?? {}), termsPlacement: next }
}

/** Valida los ajustes resultantes (textos limpios y campos sin repetir). */
function cleanSettings(settings: DocSettings, ctx: OpCtx): DocSettings | null {
  const out = { ...settings }
  for (const key of ['customTitle', 'numberPrefix'] as const) {
    if (out[key] === undefined) continue
    const text = cleanText(out[key], { max: key === 'customTitle' ? L.customFieldLabelMax : 12, multiline: false, placeholders: false, kind: 'quote' }, ctx, ['patch', key])
    if (text === null) return null
    if (text) out[key] = text
    else delete out[key]
  }
  if (out.customFields) {
    const ids = out.customFields.map((f) => f.id)
    if (new Set(ids).size !== ids.length) return fail(ctx, 'duplicate_id', ['patch', 'customFields'], { id: '' }), null
    const fields = []
    for (const f of out.customFields) {
      const label = cleanText(f.label, { max: L.customFieldLabelMax, multiline: false, placeholders: false, kind: 'quote' }, ctx, ['patch', 'customFields'])
      if (label === null) return null
      if (!label) return fail(ctx, 'missing_field', ['patch', 'customFields']), null
      fields.push({ id: f.id, label })
    }
    out.customFields = fields
  }
  const parsed = DocSettingsSchema.safeParse(out)
  if (!parsed.success) {
    for (const i of fromZodIssues(parsed.error.issues, ['ops', ctx.opIndex, 'patch'], out)) ctx.issues.push({ ...i, opIndex: ctx.opIndex })
    return null
  }
  return parsed.data
}

function reportAdjusted(adjusted: string[], patch: Record<string, unknown>, variant: string, ctx: OpCtx): void {
  for (const key of adjusted) push(ctx, Object.hasOwn(patch, key) ? 'warning' : 'info', 'variant_adjusted', ['options', key], { option: key, variant })
}

/**
 * Valida el valor de `setSectionText` para la sección. Devuelve `null` (borrar), el valor limpio, o
 * `undefined` si se rechazó.
 */
function applySectionTextValue(
  s: DocSection,
  op: Extract<DocOp, { op: 'setSectionText' }>,
  kind: DocTemplateKind,
  ctx: OpCtx,
): string | RichText | null | undefined {
  const meta = SECTION_META[s.type]
  if (!meta.textSlots.includes(op.slot)) return fail(ctx, 'op_invalid', ['slot']), undefined
  if (op.slot === 'content') {
    if (op.value === null) {
      if (s.type === 'custom_text') return emptyRichText()
      return null
    }
    return cleanRichText(op.value, ctx, ['value']) ?? undefined
  }
  if (op.value === null) return null
  if (typeof op.value !== 'string') return fail(ctx, 'invalid_value', ['value']), undefined
  const max = s.type === 'cover' ? (op.slot === 'title' ? L.coverTitleMax : L.coverSubtitleMax) : L.sectionTitleMax
  const text = cleanText(op.value, { max, multiline: false, placeholders: true, kind }, ctx, ['value'])
  if (text === null) return undefined
  return text || null
}

function writeSectionText(s: DocSection, slot: (typeof SECTION_TEXT_SLOTS)[number], value: string | RichText | null): void {
  const options = s.options as Record<string, unknown>
  if (slot === 'content') {
    if (value === null) delete options.content
    else options.content = value
    return
  }
  if (s.type === 'cover') {
    if (value === null) delete options[slot]
    else options[slot] = value
    return
  }
  if (value === null) delete s.title
  else s.title = value as string
}

// ── Operaciones sobre ajustes por cotización ────────────────────────────────────────────────────

function applyOverrideOp(o: QuoteDocOverridesV2, op: DocOp, base: DocTemplate | undefined, ctx: OpCtx): void {
  const needBase = (): DocTemplate | null => {
    if (!base) {
      fail(ctx, 'base_template_required')
      return null
    }
    return base
  }
  const merged = () => mergeTemplateOverrides(base!, o).template
  const added = (id: string) => (o.added ?? []).find((s) => s.id === id)
  const sectionOv = (section: DocSection): SectionOverride => {
    o.sections ??= {}
    const current = ownValue(o.sections, section.id)
    if (!current || current.type !== section.type) o.sections[section.id] = { type: section.type }
    return o.sections[section.id]
  }
  /** Sección del resultado (plantilla ⊕ ajustes) o error. */
  const resolve = (id: string): { section: DocSection; isAdded: boolean } | null => {
    if (!needBase()) return null
    const a = added(id)
    if (a) return { section: a as DocSection, isAdded: true }
    const section = merged().sections.find((s) => s.id === id)
    if (!section) {
      fail(ctx, 'target_not_found', ['sectionId'], { id })
      return null
    }
    return { section, isAdded: false }
  }
  const setOrder = (ids: string[]) => {
    o.order = ids
  }

  switch (op.op) {
    case 'setTemplate':
      o.templateId = op.templateId
      return
    case 'setLocale':
      if (op.locale === null) delete o.locale
      else o.locale = op.locale
      return
    case 'setValidityDays':
      if (op.days === null) delete o.validityDays
      else o.validityDays = op.days
      return
    case 'setText': {
      if (op.value === null) {
        if (o.texts) delete o.texts[op.field]
        return
      }
      const spec = docTextSpec(op.field)
      const text = cleanText(op.value, { ...spec, kind: 'quote' }, ctx, ['value'])
      if (text === null) return
      o.texts = { ...(o.texts ?? {}), [op.field]: text }
      return
    }
    case 'setItemNote': {
      if (op.note === null) {
        if (o.items && ownValue(o.items, op.itemId)) {
          const { note: _drop, ...rest } = o.items[op.itemId]
          if (Object.keys(rest).length) o.items[op.itemId] = rest
          else delete o.items[op.itemId]
        }
        return
      }
      const note = cleanText(op.note, { max: L.itemNoteMax, multiline: true, placeholders: false, kind: 'quote' }, ctx, ['note'])
      if (note === null) return
      o.items ??= {}
      if (!ownValue(o.items, op.itemId) && Object.keys(o.items).length >= L.itemNotesMax) return fail(ctx, 'too_many', ['itemId'], { max: L.itemNotesMax })
      o.items[op.itemId] = { ...(ownValue(o.items, op.itemId) ?? {}), note }
      return
    }
    case 'setPriceLevel':
    case 'setItemDisplay': {
      const next = { ...(o.itemDisplay ?? {}) } as Record<string, unknown>
      const patch: Record<string, unknown> = op.op === 'setPriceLevel' ? priceLevelDisplay(op.level) : op.patch
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue
        if (v === null) delete next[k]
        else next[k] = v
      }
      if (op.op === 'setPriceLevel' && op.level === 'groups' && base) {
        const items = merged().sections.find((s) => s.type === 'items')
        if (items?.type === 'items' && items.options.groupBy === 'none') next.groupBy = 'room'
      }
      o.itemDisplay = next
      // Lo último que se decidió manda: un ajuste anterior de la sección no tapa este cambio.
      for (const ov of Object.values(o.sections ?? {})) {
        if (ov.type !== 'items' || !ov.options) continue
        const options = Object.fromEntries(Object.entries(ov.options).filter(([k]) => !(k in patch)))
        ov.options = options
      }
      return
    }
    case 'setDocSettings': {
      const next = cleanSettings(applySettingsPatch(o.settings, op.patch), ctx)
      if (!next) return
      o.settings = next
      return
    }
    case 'setCustomField': {
      if (op.value === null || !op.value.trim()) {
        if (o.fields) delete o.fields[op.fieldId]
        return
      }
      const value = cleanText(op.value, { max: L.customFieldValueMax, multiline: false, placeholders: false, kind: 'quote' }, ctx, ['value'])
      if (value === null) return
      if (!ownValue(o.fields ?? {}, op.fieldId) && Object.keys(o.fields ?? {}).length >= L.customFieldsMax) return fail(ctx, 'too_many', ['fieldId'], { max: L.customFieldsMax })
      o.fields = { ...(o.fields ?? {}), [op.fieldId]: value }
      return
    }
    case 'setTheme':
    case 'setColor':
    case 'setFontPair': {
      let patch: DocThemePatch
      if (op.op === 'setTheme') patch = op.patch
      else if (op.op === 'setColor') patch = { palette: { [op.role]: op.value } }
      else {
        const fonts = fontPatchFromOp(op, ctx)
        if (!fonts) return
        patch = { fonts }
      }
      if (patch.fonts) {
        for (const role of ['heading', 'body', 'mono'] as const) {
          const id = patch.fonts[role]
          if (id && !fontAllows(id, role)) return fail(ctx, 'font_role', ['patch', 'fonts', role], { font: DOC_FONTS[id].family, role })
        }
      }
      const theme: DocThemePatch = { ...(o.theme ?? {}) }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue
        if (k === 'palette' || k === 'fonts') (theme as Record<string, unknown>)[k] = { ...((theme as Record<string, Record<string, unknown> | undefined>)[k] ?? {}), ...(v as object) }
        else (theme as Record<string, unknown>)[k] = v
      }
      // Peso del titular disponible en la nueva fuente.
      if (patch.fonts?.heading && base) {
        const weight = theme.headingWeight ?? base.theme.headingWeight
        const nearest = nearestFontWeight(patch.fonts.heading, weight)
        if (nearest !== weight) {
          theme.headingWeight = nearest
          push(ctx, 'info', 'font_weight', ['patch', 'fonts', 'heading'], { font: DOC_FONTS[patch.fonts.heading].family, weight, nearest })
        }
      }
      o.theme = theme
      if (base) for (const i of mergeTemplateOverrides(base, o).issues) if (i.code === 'contrast_repaired') ctx.issues.push({ ...i, opIndex: ctx.opIndex })
      return
    }
    case 'setPage': {
      const page = { ...(o.page ?? {}) }
      for (const [k, v] of Object.entries(op.patch)) {
        if (v === undefined) continue
        if (k === 'margins') page.margins = { ...(page.margins ?? {}), ...(v as object) }
        else (page as Record<string, unknown>)[k] = v
      }
      o.page = page
      return
    }
    case 'setDrawingStyle': {
      if (op.sectionId) {
        const r = resolve(op.sectionId)
        if (!r) return
        if (r.section.type !== 'items') return fail(ctx, 'op_invalid', ['sectionId'])
        if (r.isAdded) return fail(ctx, 'op_invalid', ['sectionId'])
        const ov = sectionOv(r.section)
        ov.options = { ...(ov.options ?? {}), drawingStyle: op.style }
        return
      }
      o.theme = { ...(o.theme ?? {}), drawingStyle: op.style }
      const display = { ...(o.itemDisplay ?? {}) }
      if (display.drawingStyle && display.drawingStyle !== 'inherit') display.drawingStyle = 'inherit'
      o.itemDisplay = display
      if (base) {
        for (const s of merged().sections) {
          if (s.type === 'items' && s.options.drawingStyle !== 'inherit') {
            const ov = sectionOv(s)
            ov.options = { ...(ov.options ?? {}), drawingStyle: 'inherit' }
          }
        }
      }
      return
    }
    case 'addSection': {
      const t = needBase()
      if (!t) return
      const input = op.section
      if (input.type !== 'custom_text' && input.type !== 'page_break') return fail(ctx, 'op_not_supported', ['section', 'type'])
      const current = merged()
      const meta = SECTION_META[input.type]
      if ((o.added ?? []).length >= L.addedSectionsMax) return fail(ctx, 'too_many', ['section'], { max: L.addedSectionsMax })
      if (current.sections.filter((s) => s.type === input.type).length >= meta.max) return fail(ctx, 'section_limit', ['section', 'type'], { section: input.type, max: meta.max })
      if (input.id && current.sections.some((s) => s.id === input.id)) return fail(ctx, 'duplicate_id', ['section', 'id'], { id: input.id })
      if (input.tone && !meta.tones.includes(input.tone)) return fail(ctx, 'tone_not_allowed', ['section', 'tone'], { section: input.type, tone: input.tone })
      let title: string | undefined
      if (input.title !== undefined) {
        if (!meta.allowsTitle) return fail(ctx, 'title_not_allowed', ['section', 'title'], { section: input.type })
        const clean = cleanText(input.title, { max: L.sectionTitleMax, multiline: false, placeholders: true, kind: 'quote' }, ctx, ['section', 'title'])
        if (clean === null) return
        title = clean || undefined
      }
      const patch = input.options ? parseOptionsPatch(input.type, input.options, ctx, ['section', 'options']) : {}
      if (patch === null) return
      const options = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null))
      const taken = [...current.sections.map((s) => s.id), ...Object.keys(o.sections ?? {})]
      const section = createSection({ type: input.type, id: input.id, enabled: input.enabled, pageBreak: input.pageBreak, tone: input.tone, title, options } as never, taken) as AddedSection
      const ids = current.sections.map((s) => s.id)
      const at = anchorIndex(current.sections, op, ctx)
      if (at === null) return
      const pos = respectCover(current.sections, at ?? defaultInsertIndex(current.sections, input.type), input.type, ctx)
      ids.splice(pos, 0, section.id)
      o.added = [...(o.added ?? []), section]
      setOrder(ids)
      return
    }
    case 'removeSection': {
      if (!needBase()) return
      const a = added(op.sectionId)
      if (a) {
        o.added = (o.added ?? []).filter((s) => s.id !== op.sectionId)
        if (o.order) o.order = o.order.filter((id) => id !== op.sectionId)
        return
      }
      const current = merged()
      const section = current.sections.find((s) => s.id === op.sectionId)
      if (!section) return push(ctx, 'warning', 'target_not_found', ['sectionId'], { id: op.sectionId })
      const required = wouldHideLastRequired(current.sections, current.kind, section.id)
      if (required) return fail(ctx, 'section_required', ['sectionId'], { section: required })
      sectionOv(section).enabled = false
      push(ctx, 'info', 'removed_as_hidden', ['sectionId'])
      return
    }
    case 'moveSection': {
      if (!needBase()) return
      const current = merged()
      const list = current.sections.filter((s) => s.id !== op.sectionId)
      const moving = current.sections.find((s) => s.id === op.sectionId)
      if (!moving) return fail(ctx, 'target_not_found', ['sectionId'], { id: op.sectionId })
      const at = anchorIndex(list, op, ctx)
      if (at === null) return
      if (at === undefined) return fail(ctx, 'missing_field', ['afterId'])
      const ids = list.map((s) => s.id)
      ids.splice(respectCover(list, at, moving.type, ctx), 0, moving.id)
      const ordered = ids.map((id) => current.sections.find((s) => s.id === id)!)
      if (closingOrderViolation(ordered) >= 0) return fail(ctx, 'total_not_final', ['sectionId'])
      setOrder(ids)
      // Igual que en una plantilla: mover las condiciones respecto del total es cambiar su ubicación.
      if (moving.type === 'terms' || moving.type === 'warranty') {
        const totals = ordered.findIndex((s) => s.type === 'totals')
        const terms = ordered.findIndex((s) => s.type === 'terms')
        const current = resolveDocSettings(current2Settings(base, o)).termsPlacement
        if (totals >= 0 && terms >= 0) {
          const next = terms < totals ? 'before_total' : current === 'before_total' ? 'after_total' : current
          if (next !== current) o.settings = { ...(o.settings ?? {}), termsPlacement: next }
        }
      }
      return
    }
    case 'updateSectionOptions': {
      const r = resolve(op.sectionId)
      if (!r) return
      const patch = parseOptionsPatch(r.section.type, op.options, ctx, ['options'])
      if (!patch) return
      const merged2 = applyOptionsPatch(r.section.options as never, patch)
      const { options, adjusted } = normalizeSectionOptions(r.section.type, merged2)
      reportAdjusted(adjusted, patch, String((options as { variant?: string }).variant ?? ''), ctx)
      if (r.isAdded) {
        replaceAdded(o, { ...r.section, options } as AddedSection)
        return
      }
      const ov = sectionOv(r.section)
      const stored = { ...(ov.options ?? {}), ...patch }
      for (const key of adjusted) stored[key] = (options as Record<string, unknown>)[key]
      ov.options = stored
      return
    }
    case 'updateSection':
    case 'toggleSection': {
      const r = resolve(op.sectionId)
      if (!r) return
      const { section } = r
      const meta = SECTION_META[section.type]
      const patch = op.op === 'toggleSection' ? { enabled: op.enabled ?? !section.enabled } : op.patch
      if (patch.enabled === false && !r.isAdded) {
        const current = merged()
        const required = wouldHideLastRequired(current.sections, current.kind, section.id)
        if (required) return fail(ctx, 'section_required', ['sectionId'], { section: required })
      }
      let title: string | null | undefined
      if ('title' in patch && patch.title !== undefined) {
        if (!meta.allowsTitle) return fail(ctx, 'title_not_allowed', ['patch', 'title'], { section: section.type })
        if (patch.title === null) title = null
        else {
          const clean = cleanText(patch.title, { max: L.sectionTitleMax, multiline: false, placeholders: true, kind: 'quote' }, ctx, ['patch', 'title'])
          if (clean === null) return
          title = clean || null
        }
      }
      const tone = 'tone' in patch ? patch.tone : undefined
      if (tone !== undefined && !meta.tones.includes(tone)) return fail(ctx, 'tone_not_allowed', ['patch', 'tone'], { section: section.type, tone })
      const pageBreak = 'pageBreak' in patch ? patch.pageBreak : undefined
      if (r.isAdded) {
        const next = cloneJson(section) as AddedSection
        if (patch.enabled !== undefined) next.enabled = patch.enabled
        if (tone !== undefined) next.tone = tone
        if (pageBreak !== undefined) next.pageBreak = pageBreak
        if (title === null) delete next.title
        else if (title !== undefined) next.title = title
        replaceAdded(o, next)
        return
      }
      const ov = sectionOv(section)
      if (patch.enabled !== undefined) ov.enabled = patch.enabled
      if (tone !== undefined) ov.tone = tone
      if (pageBreak !== undefined) ov.pageBreak = pageBreak
      if (title !== undefined) ov.title = title
      return
    }
    case 'duplicateSection': {
      const r = resolve(op.sectionId)
      if (!r) return
      if (r.section.type !== 'custom_text' && r.section.type !== 'page_break') return fail(ctx, 'op_not_supported', ['sectionId'])
      return applyOverrideOp(
        o,
        { op: 'addSection', section: { type: r.section.type, id: op.newId, enabled: r.section.enabled, pageBreak: r.section.pageBreak, tone: r.section.tone, title: r.section.title, options: cloneJson(r.section.options) as Record<string, unknown> }, afterId: op.sectionId },
        base,
        ctx,
      )
    }
    case 'setSectionText': {
      const r = resolve(op.sectionId)
      if (!r) return
      const value = applySectionTextValue(r.section, op, 'quote', ctx)
      if (value === undefined) return
      if (r.isAdded) {
        const next = cloneJson(r.section) as DocSection
        writeSectionText(next, op.slot, value)
        replaceAdded(o, next as AddedSection)
        return
      }
      const ov = sectionOv(r.section)
      if (op.slot === 'title' && r.section.type !== 'cover') ov.title = value as string | null
      else ov.options = { ...(ov.options ?? {}), [op.slot]: value }
      return
    }
    case 'editRichText': {
      const r = resolve(op.sectionId)
      if (!r) return
      if (!SECTION_META[r.section.type].textSlots.includes('content')) return fail(ctx, 'op_invalid', ['sectionId'])
      const next = richEdit(sectionRichText(r.section), op, ctx)
      if (!next) return
      if (r.isAdded) {
        const copy = cloneJson(r.section) as DocSection
        writeSectionText(copy, 'content', next)
        replaceAdded(o, copy as AddedSection)
        return
      }
      const ov = sectionOv(r.section)
      ov.options = { ...(ov.options ?? {}), content: next }
      return
    }
    case 'resetSection':
      if (o.sections && ownValue(o.sections, op.sectionId)) delete o.sections[op.sectionId]
      return
    case 'reset':
      resetOverrides(o, op.scope)
      return
    default:
      fail(ctx, 'op_not_supported', ['op'], { op: op.op })
  }
}

/** Ajustes vigentes para una cotización: los de la plantilla con los propios encima. */
function current2Settings(base: DocTemplate | undefined, o: QuoteDocOverridesV2): DocSettings {
  return { ...(base?.settings ?? {}), ...(o.settings ?? {}) }
}

function replaceAdded(o: QuoteDocOverridesV2, next: AddedSection): void {
  o.added = (o.added ?? []).map((s) => (s.id === next.id ? next : s))
}

function resetOverrides(o: QuoteDocOverridesV2, scope: ResetScope): void {
  const del = (...keys: (keyof QuoteDocOverridesV2)[]) => {
    for (const k of keys) delete (o as Record<string, unknown>)[k]
  }
  switch (scope) {
    case 'all':
      del('templateId', 'locale', 'texts', 'validityDays', 'theme', 'page', 'settings', 'fields', 'itemDisplay', 'sections', 'order', 'added', 'items')
      return
    case 'settings':
      return del('settings', 'fields')
    case 'theme':
      return del('theme')
    case 'texts':
      return del('texts', 'validityDays')
    case 'sections':
      return del('sections', 'order', 'added')
    case 'order':
      return del('order')
    case 'page':
      return del('page')
    case 'items':
      return del('items', 'itemDisplay')
    case 'locale':
      return del('locale')
    case 'template':
      return del('templateId')
  }
}

// ── Motor común ─────────────────────────────────────────────────────────────────────────────────

function isTemplate(value: unknown): value is DocTemplate {
  return !!value && typeof value === 'object' && (value as { schemaVersion?: unknown }).schemaVersion === 1
}

/**
 * Aplica operaciones a una plantilla o a los ajustes de una cotización. Pura: devuelve un objeto nuevo
 * (o la misma referencia si nada cambió / se rechazó). Valida cada operación y el resultado final.
 */
export function applyDocOps(target: DocTemplate, ops: readonly unknown[], options?: ApplyDocOpsOptions): ApplyDocOpsResult<DocTemplate>
export function applyDocOps(target: QuoteDocOverridesV2, ops: readonly unknown[], options?: ApplyDocOpsOptions): ApplyDocOpsResult<QuoteDocOverridesV2>
export function applyDocOps(
  target: DocTemplate | QuoteDocOverridesV2,
  ops: readonly unknown[],
  options: ApplyDocOpsOptions = {},
): ApplyDocOpsResult<DocTemplate | QuoteDocOverridesV2> {
  const mode = options.mode ?? 'atomic'
  const templateTarget = isTemplate(target)
  const issues: DocIssue[] = []
  const reject = (): ApplyDocOpsResult<DocTemplate | QuoteDocOverridesV2> => ({ ok: false, result: target, issues: withMessages(issues), applied: [], changed: false })

  if (!Array.isArray(ops)) {
    issues.push(issue('error', 'op_invalid', ['ops']))
    return reject()
  }
  if (ops.length > L.opsPerBatchMax) {
    issues.push(issue('error', 'too_many_ops', ['ops'], { max: L.opsPerBatchMax }))
    return reject()
  }

  let draft = cloneJson(target) as DocTemplate | QuoteDocOverridesV2
  const applied: number[] = []
  const allowed = templateTarget ? TEMPLATE_OPS : OVERRIDE_OPS

  const validate = (candidate: DocTemplate | QuoteDocOverridesV2, opIndex?: number): DocIssue[] => {
    const tag = (list: DocIssue[]) => list.map((i) => (opIndex === undefined ? i : { ...i, opIndex }))
    if (templateTarget) {
      const parsed = DocTemplateSchema.safeParse(candidate)
      return parsed.success ? [] : tag(fromZodIssues(parsed.error.issues, [], candidate))
    }
    const parsed = QuoteDocOverridesV2Schema.safeParse(compactQuoteDocOverrides(candidate as QuoteDocOverridesV2))
    if (!parsed.success) return tag(fromZodIssues(parsed.error.issues, [], candidate))
    if (options.template) {
      const m = mergeTemplateOverrides(options.template, candidate as QuoteDocOverridesV2)
      if (hasErrors(m.issues)) return tag(m.issues.filter((i) => i.severity === 'error'))
    }
    return []
  }

  for (let i = 0; i < ops.length; i++) {
    const ctx: OpCtx = { issues: [], opIndex: i }
    const parsed = DocOpSchema.safeParse(ops[i])
    if (!parsed.success) {
      const name = (ops[i] as { op?: unknown } | null)?.op
      const known = typeof name === 'string' && (DOC_OP_NAMES as string[]).includes(name)
      const list = known ? fromZodIssues(parsed.error.issues, ['ops', i], ops[i]) : [issue('error', 'op_invalid', ['ops', i, 'op'], { op: typeof name === 'string' ? name.slice(0, 40) : '' })]
      issues.push(...list.map((x) => ({ ...x, opIndex: i })))
      if (mode === 'atomic') return reject()
      continue
    }
    const op = parsed.data
    if (!allowed.includes(op.op)) {
      fail(ctx, 'op_not_supported', ['op'], { op: op.op })
      issues.push(...ctx.issues)
      if (mode === 'atomic') return reject()
      continue
    }
    const next = cloneJson(draft) as DocTemplate | QuoteDocOverridesV2
    if (templateTarget) applyTemplateOp(next as DocTemplate, op, ctx)
    else applyOverrideOp(next as QuoteDocOverridesV2, op, options.template, ctx)
    if (!hasErrors(ctx.issues) && mode === 'best_effort') ctx.issues.push(...validate(next, i))
    issues.push(...ctx.issues)
    if (hasErrors(ctx.issues)) {
      if (mode === 'atomic') return reject()
      continue
    }
    if (jsonEqual(next, draft)) issues.push({ ...issue('info', 'op_noop', ['ops', i]), opIndex: i })
    draft = next
    applied.push(i)
  }

  if (!templateTarget) draft = compactQuoteDocOverrides(draft as QuoteDocOverridesV2)
  const finalIssues = validate(draft)
  if (finalIssues.length) {
    issues.push(...finalIssues)
    return reject()
  }
  const changed = !jsonEqual(draft, templateTarget ? target : compactQuoteDocOverrides(target as QuoteDocOverridesV2))
  return { ok: true, result: changed ? draft : target, issues: withMessages(issues), applied, changed }
}

/** Una sola operación (atajo del editor: una entrada de deshacer por operación). */
export function applyDocOp(target: DocTemplate, op: unknown, options?: ApplyDocOpsOptions): ApplyDocOpsResult<DocTemplate>
export function applyDocOp(target: QuoteDocOverridesV2, op: unknown, options?: ApplyDocOpsOptions): ApplyDocOpsResult<QuoteDocOverridesV2>
export function applyDocOp(target: DocTemplate | QuoteDocOverridesV2, op: unknown, options?: ApplyDocOpsOptions): ApplyDocOpsResult<DocTemplate | QuoteDocOverridesV2> {
  return applyDocOps(target as DocTemplate, [op], options) as ApplyDocOpsResult<DocTemplate | QuoteDocOverridesV2>
}

/** Valida operaciones sin aplicarlas (p. ej. propuestas de la IA en modo Supervisado). */
export function parseDocOps(input: unknown): { ok: boolean; ops: DocOp[]; issues: DocIssue[] } {
  const issues: DocIssue[] = []
  if (!Array.isArray(input)) return { ok: false, ops: [], issues: withMessages([issue('error', 'op_invalid', ['ops'])]) }
  if (input.length > L.opsPerBatchMax) return { ok: false, ops: [], issues: withMessages([issue('error', 'too_many_ops', ['ops'], { max: L.opsPerBatchMax })]) }
  const ops: DocOp[] = []
  input.forEach((raw, i) => {
    const parsed = DocOpSchema.safeParse(raw)
    if (parsed.success) ops.push(parsed.data)
    else issues.push(...fromZodIssues(parsed.error.issues, ['ops', i], raw).map((x) => ({ ...x, opIndex: i })))
  })
  return { ok: issues.length === 0, ops, issues: withMessages(issues) }
}

// ── Descripciones legibles ──────────────────────────────────────────────────────────────────────

export interface DescribeDocOpContext {
  locale?: unknown
  /** Plantilla (base) para nombrar secciones por su título/tipo. */
  template?: DocTemplate
  /** Ajustes actuales (para nombrar secciones agregadas a la cotización). */
  overrides?: QuoteDocOverridesV2
  /** Etiqueta legible de un ítem (p. ej. "V-03"). */
  itemLabel?: (itemId: string) => string | undefined
  /** Nombre de una plantilla propia por id. */
  templateName?: (templateId: string) => string | undefined
}

export interface DocOpDescription {
  group: 'ops' | 'resetScopes'
  key: string
  params: DocIssueParams
}

function sectionName(id: string, ctx: DescribeDocOpContext): string {
  const s = ctx.template?.sections.find((x) => x.id === id) ?? ctx.overrides?.added?.find((x) => x.id === id)
  if (!s) return id
  return s.title ?? sectionLabel(s.type, ctx.locale)
}

/** Llave + parámetros (ya traducidos) de la descripción, para traductores propios de la UI. */
export function describeDocOpKey(op: DocOp, ctx: DescribeDocOpContext = {}): DocOpDescription {
  const L10n = ctx.locale
  const section = (id: string) => sectionName(id, ctx)
  switch (op.op) {
    case 'rename':
      return { group: 'ops', key: 'rename', params: { name: sanitizeDocText(op.name).slice(0, L.nameMax) } }
    case 'setColor':
      return { group: 'ops', key: 'setColor', params: { role: paletteRoleLabel(op.role, L10n), value: op.value.toUpperCase() } }
    case 'setFontPair': {
      const pair = op.pairId ? fontPairById(op.pairId) : undefined
      const heading = op.heading ?? pair?.heading
      const body = op.body ?? pair?.body ?? heading
      const fonts = heading && body ? fontPairLabel({ heading, body }) : heading ? fontPairLabel({ heading, body: heading }) : body ? fontPairLabel({ heading: body, body }) : ''
      return { group: 'ops', key: 'setFontPair', params: { fonts } }
    }
    case 'setDrawingStyle': {
      const style = templateMessages(L10n).drawingStyles[op.style]
      return op.sectionId
        ? { group: 'ops', key: 'drawingStyleSection', params: { section: section(op.sectionId), style } }
        : { group: 'ops', key: 'drawingStyle', params: { style } }
    }
    case 'setPage': {
      const keys = Object.keys(op.patch).filter((k) => (op.patch as Record<string, unknown>)[k] !== undefined)
      if (keys.length === 1 && op.patch.size) return { group: 'ops', key: 'setPageSize', params: { size: templateMessages(L10n).pageSizes[op.patch.size] } }
      return { group: 'ops', key: 'setPage', params: {} }
    }
    case 'addSection':
      return { group: 'ops', key: 'addSection', params: { section: op.section.title ? sanitizeDocText(op.section.title) : sectionLabel(op.section.type, L10n) } }
    case 'removeSection':
    case 'moveSection':
    case 'duplicateSection':
    case 'setSectionText':
    case 'editRichText':
    case 'resetSection':
    case 'updateSection':
      return { group: 'ops', key: op.op, params: { section: section(op.sectionId) } }
    case 'updateSectionOptions': {
      const keys = Object.keys(op.options)
      if (keys.length === 1 && typeof op.options.variant === 'string') {
        return { group: 'ops', key: 'updateSectionVariant', params: { section: section(op.sectionId), variant: variantLabel(op.options.variant, L10n) } }
      }
      return { group: 'ops', key: 'updateSectionOptions', params: { section: section(op.sectionId) } }
    }
    case 'toggleSection':
      return { group: 'ops', key: op.enabled === true ? 'showSection' : op.enabled === false ? 'hideSection' : 'toggleSection', params: { section: section(op.sectionId) } }
    case 'setText':
      return { group: 'ops', key: op.value === null ? 'clearText' : 'setText', params: { field: textFieldLabel(op.field, L10n) } }
    case 'setTemplate': {
      const name = isDocPresetId(op.templateId) ? presetName(op.templateId, L10n) : (ctx.templateName?.(op.templateId) ?? op.templateId)
      return { group: 'ops', key: 'setTemplate', params: { template: name } }
    }
    case 'setLocale':
      return op.locale === null ? { group: 'ops', key: 'clearLocale', params: {} } : { group: 'ops', key: 'setLocale', params: { locale: docLocaleLabel(op.locale, L10n) } }
    case 'setValidityDays':
      if (op.days === null) return { group: 'ops', key: 'clearValidityDays', params: {} }
      return { group: 'ops', key: op.days === 1 ? 'setValidityDaysOne' : 'setValidityDays', params: { days: op.days } }
    case 'setItemNote': {
      const item = ctx.itemLabel?.(op.itemId) ?? op.itemId
      return { group: 'ops', key: op.note === null ? 'clearItemNote' : 'setItemNote', params: { item } }
    }
    case 'setPriceLevel':
      return { group: 'ops', key: `priceLevel_${op.level}`, params: {} }
    case 'setDocSettings':
      return { group: 'ops', key: 'setDocSettings', params: {} }
    case 'setCustomField':
      return { group: 'ops', key: op.value === null ? 'clearCustomField' : 'setCustomField', params: {} }
    case 'reset':
      return { group: 'resetScopes', key: op.scope, params: {} }
    case 'resetToPreset': {
      const id = op.presetId ?? ctx.template?.presetId
      return { group: 'ops', key: 'resetToPreset', params: { preset: id ? presetName(id, L10n) : '' } }
    }
    default:
      return { group: 'ops', key: op.op, params: {} }
  }
}

/** Resumen legible (por defecto en español) de una operación: "Ocultó la sección «Garantía»". */
export function describeDocOp(op: DocOp, ctx: DescribeDocOpContext = {}): string {
  const d = describeDocOpKey(op, ctx)
  return docOpText(ctx.locale, d.group, d.key, d.params)
}

/** Resumen de un lote: una frase si es una operación, "N cambios en el documento" si son varias. */
export function summarizeDocOps(ops: readonly DocOp[], ctx: DescribeDocOpContext = {}): string {
  if (ops.length === 1) return describeDocOp(ops[0], ctx)
  return docOpText(ctx.locale, 'ops', 'batch', { count: ops.length })
}
