/**
 * Reparación tolerante de una plantilla que viene de fuera (respuesta de la IA, importación, datos
 * viejos): completa con valores por defecto, recorta, ajusta rangos, descarta campos y secciones
 * desconocidas, reubica la portada, agrega obligatorias y corrige contraste. NO "arregla" contenido
 * inseguro: eso se rechaza antes (`parseAiTemplate`). El resultado siempre se valida con el esquema.
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L, PAGE_MARGIN_RANGE_MM } from './limits'
import type { DocTemplateKind } from './kinds'
import { isAssetId, isSectionId, isTemplateId } from './fields'
import { normalizeHex } from './color'
import { DOC_FONT_IDS, currentDocFontId, fontAllows, nearestFontWeight, type DocFontId } from './fonts'
import { PALETTE_ROLES, ThemeBaseSchema, repairTheme, type DocTheme } from './theme'
import { PAGE_MARGIN_PRESETS, PageSchema, pageSizeFromPaper, type DocPage } from './page'
import { coerceRichText, RichTextSchema, type RichBlock, type RichInline, type RichText } from './richtext'
import {
  REQUIRED_SECTIONS,
  SECTION_DEFAULT_OPTIONS,
  SECTION_META,
  SECTION_OPTION_SCHEMAS,
  createSection,
  isSectionType,
  newSectionId,
  normalizeSectionOptions,
  closingOrderViolation,
  withClosingLast,
  type DocSection,
  type DocSectionType,
} from './sections'
import { defaultInsertIndex, stripInvalidPlaceholders } from './overrides'
import { DocSettingsSchema, type DocSettings } from './settings'
import { getDocPreset } from './presets'
import { DEFAULT_CATALOG_PRESET_ID, DEFAULT_QUOTE_PRESET_ID, isDocPresetId, presetKind } from './preset-ids'
import { cloneJson, sanitizeDocText, truncateText } from './safety'
import { placeholderAllowed } from './placeholders'
import { issue, type DocIssue, type DocIssuePath } from './issues'
import { migrateDocTemplateInput, type DocTemplate } from './template'

export interface RepairTemplateOptions {
  /** Tipo esperado (manda sobre lo que diga la entrada). */
  kind?: DocTemplateKind
  /** Id definitivo (lo asigna el servidor). */
  id?: string
  /** Nombre por defecto si falta. */
  name?: string
  /** Plantilla de la que se toman los valores que falten (por defecto, el diseño de `presetId` o el predeterminado). */
  base?: DocTemplate
}

export interface RepairTemplateResult {
  template: DocTemplate
  issues: DocIssue[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function cleanLine(raw: unknown, max: number, kind: DocTemplateKind, placeholders: boolean): string | undefined {
  if (typeof raw !== 'string') return undefined
  let text = sanitizeDocText(raw)
  text = placeholders ? stripInvalidPlaceholders(text, kind) : text.replace(/[{}]/g, '')
  text = truncateText(text, max)
  return text || undefined
}

/** Quita marcadores no permitidos para el tipo dentro de un AST. */
function filterRichPlaceholders(doc: RichText, kind: DocTemplateKind): RichText {
  const ok = (n: RichInline) => n.type !== 'placeholder' || placeholderAllowed(n.key, kind)
  const blocks: RichBlock[] = []
  for (const b of doc.blocks) {
    if (b.type === 'paragraph' || b.type === 'heading') {
      const children = b.children.filter(ok)
      if (children.length) blocks.push({ ...b, children })
    } else {
      const items = b.items.map((it) => ({ children: it.children.filter(ok) })).filter((it) => it.children.length > 0)
      if (items.length) blocks.push({ ...b, items })
    }
  }
  return { blocks }
}

/** Ajustes del documento: lo válido se conserva llave por llave. */
function repairSettings(raw: unknown, base: DocSettings | undefined, issues: DocIssue[]): DocSettings | undefined {
  if (raw === undefined) return base ? (cloneJson(base) as DocSettings) : undefined
  if (!isRecord(raw)) {
    issues.push(issue('warning', 'value_dropped', ['settings']))
    return base ? (cloneJson(base) as DocSettings) : undefined
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (DocSettingsSchema.safeParse({ [key]: value }).success) out[key] = value
    else issues.push(issue('warning', 'value_dropped', ['settings', key]))
  }
  return { ...(base ?? {}), ...(out as DocSettings) }
}

function repairThemeInput(raw: unknown, base: DocTheme, issues: DocIssue[]): DocTheme {
  const theme = cloneJson(base) as DocTheme
  if (!isRecord(raw)) {
    if (raw !== undefined) issues.push(issue('warning', 'value_dropped', ['theme']))
    return repairTheme(theme, { path: ['theme'] }).theme
  }
  if (isRecord(raw.palette)) {
    for (const role of PALETTE_ROLES) {
      if (raw.palette[role] === undefined) continue
      const hex = normalizeHex(raw.palette[role])
      if (hex) theme.palette[role] = hex
      else issues.push(issue('warning', 'value_dropped', ['theme', 'palette', role]))
    }
  }
  if (isRecord(raw.fonts)) {
    for (const role of ['heading', 'body', 'mono'] as const) {
      const id = currentDocFontId(raw.fonts[role])
      if (id === undefined) continue
      if (typeof id === 'string' && (DOC_FONT_IDS as readonly string[]).includes(id) && fontAllows(id as DocFontId, role)) theme.fonts[role] = id as DocFontId
      else issues.push(issue('warning', 'value_dropped', ['theme', 'fonts', role]))
    }
  }
  if (typeof raw.headingWeight === 'number' && Number.isFinite(raw.headingWeight)) {
    const w = nearestFontWeight(theme.fonts.heading, raw.headingWeight)
    if (w !== raw.headingWeight) issues.push(issue('info', 'value_repaired', ['theme', 'headingWeight']))
    theme.headingWeight = w
  } else theme.headingWeight = nearestFontWeight(theme.fonts.heading, theme.headingWeight)
  const shape = ThemeBaseSchema.shape as Record<string, z.ZodType>
  for (const key of ['labelCase', 'density', 'typeScale', 'radius', 'rules', 'accentUsage', 'drawingStyle', 'imageTreatment', 'composition'] as const) {
    if (raw[key] === undefined) continue
    const value = typeof raw[key] === 'string' ? (raw[key] as string).trim().toLowerCase() : raw[key]
    if (shape[key].safeParse(value).success) (theme as Record<string, unknown>)[key] = value
    else issues.push(issue('warning', 'value_dropped', ['theme', key]))
  }
  const repaired = repairTheme(theme, { path: ['theme'] })
  issues.push(...repaired.issues)
  return repaired.theme
}

function repairPageInput(raw: unknown, base: DocPage, issues: DocIssue[]): DocPage {
  const page = cloneJson(base) as DocPage
  if (!isRecord(raw)) {
    if (raw !== undefined) issues.push(issue('warning', 'value_dropped', ['page']))
    return page
  }
  if (raw.size !== undefined) {
    const size = pageSizeFromPaper(typeof raw.size === 'string' ? raw.size.trim() : raw.size)
    if (size) page.size = size
    else issues.push(issue('warning', 'value_dropped', ['page', 'size']))
  }
  const margins = raw.margins
  if (typeof margins === 'string' && Object.hasOwn(PAGE_MARGIN_PRESETS, margins)) page.margins = { ...PAGE_MARGIN_PRESETS[margins as keyof typeof PAGE_MARGIN_PRESETS] }
  else if (typeof margins === 'number' && Number.isFinite(margins)) {
    const m = Math.round(Math.min(PAGE_MARGIN_RANGE_MM.max, Math.max(PAGE_MARGIN_RANGE_MM.min, margins)))
    page.margins = { top: m, right: m, bottom: m, left: m }
  } else if (isRecord(margins)) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const v = margins[side]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      const m = Math.round(Math.min(PAGE_MARGIN_RANGE_MM.max, Math.max(PAGE_MARGIN_RANGE_MM.min, v)))
      if (m !== v) issues.push(issue('info', 'value_repaired', ['page', 'margins', side]))
      page.margins[side] = m
    }
  }
  const shape = PageSchema.shape as Record<string, z.ZodType>
  for (const key of ['orientation', 'header', 'footer', 'pageNumbers', 'pageNumberAlign', 'chromeOnCover'] as const) {
    if (raw[key] === undefined) continue
    if (shape[key].safeParse(raw[key]).success) (page as Record<string, unknown>)[key] = raw[key]
    else issues.push(issue('warning', 'value_dropped', ['page', key]))
  }
  return page
}

const unwrapOptional = (s: z.ZodType): { inner: z.ZodType; optional: boolean } =>
  s instanceof z.ZodOptional ? { inner: s.unwrap() as z.ZodType, optional: true } : { inner: s, optional: false }

function clampNumber(schema: z.ZodType, value: number): number | undefined {
  const n = schema as unknown as { minValue?: number | null; maxValue?: number | null; isInt?: boolean }
  if (typeof n.minValue !== 'number' && typeof n.maxValue !== 'number') return undefined
  let v = value
  if (typeof n.minValue === 'number') v = Math.max(n.minValue, v)
  if (typeof n.maxValue === 'number') v = Math.min(n.maxValue, v)
  return n.isInt ? Math.round(v) : v
}

/** Opciones de una sección: parte de los valores por defecto y conserva lo que valide clave por clave. */
function repairOptions(type: DocSectionType, raw: unknown, kind: DocTemplateKind, path: DocIssuePath, issues: DocIssue[]): Record<string, unknown> {
  const out = cloneJson(SECTION_DEFAULT_OPTIONS[type]) as Record<string, unknown>
  if (!isRecord(raw)) return out
  const shape = SECTION_OPTION_SCHEMAS[type].shape as Record<string, z.ZodType>
  let dropped = false
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(shape, key)) {
      dropped = true
      continue
    }
    const { inner, optional } = unwrapOptional(shape[key])
    if (value === null || value === undefined) {
      if (optional) delete out[key]
      continue
    }
    if (key === 'content') {
      const doc = filterRichPlaceholders(coerceRichText(value), kind)
      if (RichTextSchema.safeParse(doc).success) out.content = doc
      else issues.push(issue('warning', 'value_dropped', [...path, key]))
      continue
    }
    if (key === 'images' && Array.isArray(value)) {
      out.images = value
        .filter((img): img is Record<string, unknown> => isRecord(img) && isAssetId(img.assetId))
        .slice(0, L.galleryImagesMax)
        .map((img) => {
          const caption = cleanLine(img.caption, L.captionMax, kind, false)
          const alt = cleanLine(img.alt, L.captionMax, kind, false)
          return { assetId: img.assetId as string, ...(caption ? { caption } : {}), ...(alt ? { alt } : {}) }
        })
      continue
    }
    if (key === 'title' || key === 'subtitle') {
      const text = cleanLine(value, key === 'title' ? L.coverTitleMax : L.coverSubtitleMax, kind, true)
      if (text) out[key] = text
      continue
    }
    if (key === 'assetId') {
      if (isAssetId(value)) out.assetId = value
      else issues.push(issue('warning', 'value_dropped', [...path, key]))
      continue
    }
    let candidate: unknown = typeof value === 'string' ? value.trim() : value
    if (Array.isArray(candidate)) candidate = [...new Set(candidate)]
    if (inner.safeParse(candidate).success) {
      out[key] = candidate
      continue
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const clamped = clampNumber(inner, candidate)
      if (clamped !== undefined && inner.safeParse(clamped).success) {
        out[key] = clamped
        issues.push(issue('info', 'value_repaired', [...path, key]))
        continue
      }
    }
    if (Array.isArray(candidate)) {
      const element = (inner as unknown as { element?: z.ZodType }).element
      if (element) {
        const kept = candidate.filter((v) => element.safeParse(v).success)
        if (kept.length && inner.safeParse(kept).success) {
          out[key] = kept
          issues.push(issue('info', 'value_repaired', [...path, key]))
          continue
        }
      }
    }
    issues.push(issue('warning', 'value_dropped', [...path, key]))
  }
  if (dropped) issues.push(issue('info', 'value_dropped', path))
  if (type === 'cover' && kind === 'catalog') out.showClient = false
  const { options, adjusted } = normalizeSectionOptions(type, out as never)
  for (const key of adjusted) issues.push(issue('info', 'variant_adjusted', [...path, key], { option: key, variant: String((options as { variant?: string }).variant ?? '') }))
  return options as Record<string, unknown>
}

function basePreset(kind: DocTemplateKind, raw: Record<string, unknown>): DocTemplate {
  if (isDocPresetId(raw.presetId) && presetKind(raw.presetId) === kind) return getDocPreset(raw.presetId)
  return getDocPreset(kind === 'quote' ? DEFAULT_QUOTE_PRESET_ID : DEFAULT_CATALOG_PRESET_ID)
}

/** Repara un borrador de plantilla. Siempre devuelve una plantilla con forma completa (validar después). */
export function repairDocTemplate(source: unknown, options: RepairTemplateOptions = {}): RepairTemplateResult {
  const issues: DocIssue[] = []
  const input = migrateDocTemplateInput(source)
  const raw = isRecord(input) ? input : {}
  if (!isRecord(input)) issues.push(issue('warning', 'value_dropped', []))
  const rawKind = raw.kind === 'quote' || raw.kind === 'catalog' ? raw.kind : undefined
  const kind: DocTemplateKind = options.kind ?? rawKind ?? options.base?.kind ?? 'quote'
  if (options.kind && rawKind && rawKind !== options.kind) issues.push(issue('warning', 'kind_mismatch', ['kind']))
  const base = options.base && options.base.kind === kind ? options.base : basePreset(kind, raw)

  const name = cleanLine(raw.name, L.nameMax, kind, false) ?? options.name ?? base.name
  const description = cleanLine(raw.description, L.descriptionMax, kind, false)
  const presetId = isDocPresetId(raw.presetId) && presetKind(raw.presetId) === kind ? raw.presetId : base.presetId
  if (raw.presetId !== undefined && presetId !== raw.presetId) issues.push(issue('info', 'value_dropped', ['presetId']))

  const theme = repairThemeInput(raw.theme, base.theme, issues)
  const page = repairPageInput(raw.page, base.page, issues)

  let sections: DocSection[] = []
  const counts = new Map<DocSectionType, number>()
  const taken = new Set<string>()
  if (Array.isArray(raw.sections)) {
    raw.sections.slice(0, L.sectionsMax * 2).forEach((entry, i) => {
      const path: DocIssuePath = ['sections', i]
      if (!isRecord(entry) || !isSectionType(entry.type)) {
        issues.push(issue('warning', 'section_dropped', path))
        return
      }
      const type = entry.type
      const meta = SECTION_META[type]
      if (!meta.kinds.includes(kind)) {
        issues.push(issue('warning', 'section_not_allowed', path, { section: type, kind }))
        return
      }
      if ((counts.get(type) ?? 0) >= meta.max || sections.length >= L.sectionsMax) {
        issues.push(issue('warning', 'section_dropped', path))
        return
      }
      let id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : ''
      if (!isSectionId(id) || taken.has(id)) {
        const newId = newSectionId(type, taken)
        if (entry.id !== undefined) issues.push(issue('info', 'id_renamed', [...path, 'id'], { id: String(entry.id).slice(0, 48), newId }))
        id = newId
      }
      const tone = typeof entry.tone === 'string' && (meta.tones as readonly string[]).includes(entry.tone) ? entry.tone : 'paper'
      if (entry.tone !== undefined && tone !== entry.tone) issues.push(issue('info', 'value_repaired', [...path, 'tone']))
      const title = meta.allowsTitle ? cleanLine(entry.title, L.sectionTitleMax, kind, true) : undefined
      const section = createSection(
        {
          type,
          id,
          enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
          pageBreak: entry.pageBreak === 'before' ? 'before' : 'auto',
          tone: tone as DocSection['tone'],
          title,
          options: repairOptions(type, entry.options, kind, [...path, 'options'], issues) as never,
        },
        taken,
      ) as DocSection
      sections.push(section)
      taken.add(id)
      counts.set(type, (counts.get(type) ?? 0) + 1)
    })
  } else if (raw.sections !== undefined) {
    issues.push(issue('warning', 'value_dropped', ['sections']))
  }
  if (sections.length === 0) {
    sections = cloneJson(base.sections) as DocSection[]
    sections.forEach((s) => taken.add(s.id))
  }

  const coverIdx = sections.findIndex((s) => s.type === 'cover')
  if (coverIdx > 0) {
    const [cover] = sections.splice(coverIdx, 1)
    sections.unshift(cover)
    issues.push(issue('info', 'section_moved', ['sections', 0], { section: 'cover' }))
  }

  const req = REQUIRED_SECTIONS[kind]
  const ensure = (type: DocSectionType) => {
    const existing = sections.find((s) => s.type === type)
    if (existing) {
      if (!existing.enabled) {
        existing.enabled = true
        issues.push(issue('warning', 'section_reenabled', ['sections'], { section: type }))
      }
      return
    }
    const fromBase = base.sections.find((s) => s.type === type)
    const section = (fromBase ? { ...(cloneJson(fromBase) as DocSection), id: taken.has(fromBase.id) ? newSectionId(type, taken) : fromBase.id, enabled: true } : createSection({ type }, taken)) as DocSection
    sections.splice(defaultInsertIndex(sections, type), 0, section)
    taken.add(section.id)
    issues.push(issue('warning', 'section_added', ['sections'], { section: type }))
  }
  for (const type of req.all) ensure(type)
  if (req.any.length && !sections.some((s) => req.any.includes(s.type) && s.enabled)) ensure(req.any[0])
  if (kind === 'quote' && closingOrderViolation(sections) >= 0) {
    sections = withClosingLast(sections)
    issues.push(issue('info', 'section_moved', ['sections'], { section: 'totals' }))
  }

  const id = options.id ?? (isTemplateId(raw.id) && !isDocPresetId(raw.id) ? raw.id : 'draft')
  const settings = repairSettings(raw.settings, base.settings, issues)
  const template: DocTemplate = {
    schemaVersion: 1,
    id,
    kind,
    name,
    ...(description ? { description } : {}),
    ...(presetId ? { presetId } : {}),
    theme,
    page,
    ...(settings ? { settings } : {}),
    sections,
  }
  return { template, issues }
}
