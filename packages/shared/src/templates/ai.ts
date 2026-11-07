/**
 * Contrato con la IA para plantillas: esquema JSON para salidas estructuradas / herramientas,
 * especificación textual compacta para el prompt de sistema, y parseo seguro de respuestas:
 * rechaza contenido inseguro (HTML, scripts, URLs, CSS, llaves prohibidas, tamaños abusivos) y
 * repara lo menor (rangos, campos desconocidos, contraste, secciones obligatorias).
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L, PAGE_MARGIN_RANGE_MM } from './limits'
import { DOC_TEMPLATE_KINDS, type DocTemplateKind } from './kinds'
import { AssetIdSchema, SectionIdSchema, docText } from './fields'
import { DOC_FONT_PAIRS, DOC_BODY_FONT_IDS, DOC_HEADING_FONT_IDS, DOC_MONO_FONT_IDS, DOC_HEADING_WEIGHTS } from './fonts'
import { ACCENT_USAGES, CONTRAST_RULES, DENSITIES, DRAWING_STYLES, IMAGE_TREATMENTS, LABEL_CASES, PALETTE_ROLES, RADII, RULE_STYLES, ThemePatchSchema, TYPE_SCALES } from './theme'
import { DOC_COMPOSITIONS } from './theme'
import { PAGE_ORIENTATIONS } from './page'
import { PAGE_FOOTERS, PAGE_HEADERS, PAGE_NUMBER_ALIGNS, PAGE_NUMBER_STYLES, PAGE_SIZES, PagePatchSchema } from './page'
import { BRAND_PLACEMENTS, BRAND_SIZES, DOC_TITLES, DocSettingsSchema, LETTERHEAD_LAYOUTS, LINE_DETAILS, LOGO_SIZES, TERMS_PLACEMENTS } from './settings'
import { RichTextSchema } from './richtext'
import {
  GalleryImageSchema,
  LAYOUT_RULES,
  PAGE_BREAKS,
  RECOMMENDED_SECTIONS,
  REQUIRED_SECTIONS,
  SECTION_META,
  SECTION_OPTION_SCHEMAS,
  SECTION_TONES,
  sectionTypesFor,
  type DocSectionType,
} from './sections'
import { DOC_PRESET_IDS, QUOTE_PRESET_IDS, CATALOG_PRESET_IDS } from './preset-ids'
import { DocOpSchema, parseDocOps, type DocOp } from './ops'
import { DocTemplateSchema, templateIssues, type DocTemplate } from './template'
import { repairDocTemplate, type RepairTemplateOptions } from './repair'
import { findUnsafeStrings, measureJson } from './safety'
import { placeholdersFor } from './placeholders'
import { fromZodIssues, issue, type DocIssue } from './issues'
import { withMessages } from './i18n'

function aiSectionSchemas(kind?: DocTemplateKind) {
  const types = kind ? sectionTypesFor(kind) : (Object.keys(SECTION_OPTION_SCHEMAS) as DocSectionType[])
  return types.map((type) =>
    z.strictObject({
      type: z.literal(type),
      id: SectionIdSchema.optional(),
      enabled: z.boolean().optional(),
      pageBreak: z.enum(PAGE_BREAKS).optional(),
      tone: z.enum(SECTION_META[type].tones as unknown as [string, ...string[]]).optional(),
      title: docText({ max: L.sectionTitleMax, multiline: false, placeholders: true }).optional(),
      options: SECTION_OPTION_SCHEMAS[type].partial().optional(),
    }),
  )
}

/**
 * Forma que se le pide a la IA: como `DocTemplate` pero sin id (lo asigna el servidor) y con todo lo
 * opcional rellenable por defecto (tema/página parciales, opciones parciales por sección).
 */
export function docTemplateAiSchema(kind?: DocTemplateKind) {
  const sections = aiSectionSchemas(kind)
  return z.strictObject({
    schemaVersion: z.literal(1).optional(),
    kind: kind ? z.literal(kind) : z.enum(DOC_TEMPLATE_KINDS),
    name: docText({ max: L.nameMax, multiline: false, placeholders: false, required: true }),
    description: docText({ max: L.descriptionMax, multiline: false, placeholders: false }).optional(),
    presetId: z.enum((kind === 'quote' ? QUOTE_PRESET_IDS : kind === 'catalog' ? CATALOG_PRESET_IDS : DOC_PRESET_IDS) as unknown as [string, ...string[]]).optional(),
    theme: ThemePatchSchema.optional(),
    page: PagePatchSchema.optional(),
    settings: DocSettingsSchema.optional(),
    sections: z
      .array(z.discriminatedUnion('type', sections as unknown as [(typeof sections)[number], ...(typeof sections)[number][]]))
      .min(1)
      .max(L.sectionsMax),
  })
}

const jsonSchemaCache = new Map<string, Record<string, unknown>>()

/** Esquema JSON (draft 2020-12) de una plantilla para la IA. Memoizado por tipo. */
export function docTemplateJsonSchema(kind?: DocTemplateKind): Record<string, unknown> {
  const key = kind ?? 'any'
  let schema = jsonSchemaCache.get(key)
  if (!schema) {
    schema = z.toJSONSchema(docTemplateAiSchema(kind), { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>
    jsonSchemaCache.set(key, schema)
  }
  return schema
}

/** Esquema JSON de un lote de operaciones (`{ ops: DocOp[] }`), para la herramienta de edición de la IA. */
export function docOpsJsonSchema(): Record<string, unknown> {
  let schema = jsonSchemaCache.get('ops')
  if (!schema) {
    schema = z.toJSONSchema(z.strictObject({ ops: z.array(DocOpSchema).min(1).max(L.opsPerBatchMax) }), { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>
    jsonSchemaCache.set('ops', schema)
  }
  return schema
}

/**
 * Objeto que se calcula recién al primer acceso (generar el esquema cuesta ~20 ms y este módulo
 * también lo carga la web). Se comporta como un objeto JSON de sólo lectura (`JSON.stringify`,
 * `Object.keys`, acceso a propiedades); para un objeto plano (p. ej. `structuredClone`) usa
 * `docTemplateJsonSchema()` / `docOpsJsonSchema()`.
 */
function lazyJson(factory: () => Record<string, unknown>): Record<string, unknown> {
  let value: Record<string, unknown> | undefined
  const real = () => (value ??= factory())
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, p) => Reflect.get(real(), p),
    has: (_t, p) => Reflect.has(real(), p),
    ownKeys: () => Reflect.ownKeys(real()),
    getOwnPropertyDescriptor: (_t, p) => {
      const d = Reflect.getOwnPropertyDescriptor(real(), p)
      return d ? { ...d, configurable: true } : undefined
    },
    set: () => false,
    deleteProperty: () => false,
    defineProperty: () => false,
  })
}

/** Esquema JSON (draft 2020-12) de una plantilla, ambos tipos. */
export const DOC_TEMPLATE_JSON_SCHEMA: Record<string, unknown> = lazyJson(() => docTemplateJsonSchema())

/** Esquema JSON de `{ ops: DocOp[] }` (herramienta de edición de documentos de la IA). */
export const DOC_OPS_JSON_SCHEMA: Record<string, unknown> = lazyJson(() => docOpsJsonSchema())

// ── Especificación textual compacta (prompt de sistema) ─────────────────────────────────────────

type AnyDef = { type: string; [k: string]: unknown }
const defOf = (s: z.ZodType) => (s as unknown as { def: AnyDef }).def

function arrayMax(s: z.ZodType): number | undefined {
  const checks = (defOf(s).checks as { _zod: { def: { check: string; maximum?: number } } }[] | undefined) ?? []
  return checks.find((c) => c._zod.def.check === 'max_length')?._zod.def.maximum
}

function describeZod(s: z.ZodType): string {
  if (s === (AssetIdSchema as z.ZodType)) return 'assetId'
  if (s === (RichTextSchema as z.ZodType)) return 'richText'
  if (s === (GalleryImageSchema as z.ZodType)) return `{assetId, caption?: text≤${L.captionMax}, alt?: text≤${L.captionMax}}`
  const d = defOf(s)
  switch (d.type) {
    case 'optional':
      return describeZod(d.innerType as z.ZodType)
    case 'nullable':
      return `${describeZod(d.innerType as z.ZodType)}|null`
    case 'enum':
      return (s as unknown as { options: string[] }).options.join('|')
    case 'literal':
      return (d.values as unknown[]).map(String).join('|')
    case 'union':
      return (d.options as z.ZodType[]).map(describeZod).join('|')
    case 'boolean':
      return 'bool'
    case 'number': {
      const n = s as unknown as { minValue: number | null; maxValue: number | null; isInt: boolean }
      return `${n.isInt ? 'int' : 'number'} ${n.minValue ?? ''}–${n.maxValue ?? ''}`
    }
    case 'string': {
      const max = (s as unknown as { maxLength: number | null }).maxLength
      return max ? `text≤${max}` : 'text'
    }
    case 'array': {
      const max = arrayMax(s)
      const element = d.element as z.ZodType
      return `[${describeZod(element)}]${max ? `≤${max}` : ''}${defOf(element).type === 'enum' ? ' unique' : ''}`
    }
    case 'default':
      return describeZod(d.innerType as z.ZodType)
    default:
      return d.type
  }
}

function describeOptions(type: DocSectionType): string {
  const shape = SECTION_OPTION_SCHEMAS[type].shape as Record<string, z.ZodType>
  return Object.entries(shape)
    .map(([key, schema]) => `${key}${defOf(schema).type === 'optional' || defOf(schema).type === 'default' ? '?' : ''}: ${describeZod(schema)}`)
    .join('; ')
}

function layoutRuleText(type: DocSectionType): string {
  if (type !== 'items' && type !== 'product_cards' && type !== 'gallery') return ''
  const rules = LAYOUT_RULES[type] as Record<string, { columns: readonly number[]; sizes?: Partial<Record<number, readonly string[]>> }>
  const parts = Object.entries(rules).map(([variant, r]) => {
    const sizes = r.sizes ? ' ' + r.columns.map((c) => `${c}col→${(r.sizes![c] ?? []).join('/')}`).join(', ') : ''
    return `${variant}: columns ${r.columns.join('|')}${sizes}`
  })
  return `\n    layout rules — ${parts.join('; ')}`
}

const promptCache = new Map<string, string>()

/** Especificación compacta del esquema para el prompt de sistema (inglés técnico, estable). */
export function docTemplatePromptSpec(kind?: DocTemplateKind): string {
  const key = kind ?? 'any'
  const cached = promptCache.get(key)
  if (cached) return cached
  const kinds: DocTemplateKind[] = kind ? [kind] : ['quote', 'catalog']
  const lines: string[] = []
  lines.push('DEKOPEN DocTemplate v1 — answer with ONE JSON object, nothing else.')
  lines.push('Never output HTML, CSS, JavaScript, URLs, Markdown links, code or template expressions in any string. Images only by uploaded assetId. Money, quantities, prices, taxes, dimensions and acceptance links are NOT part of a template: the engine/server provides them.')
  lines.push(`Top level: {"schemaVersion":1, "kind":${kind ? `"${kind}"` : '"quote"|"catalog"'}, "name": text≤${L.nameMax}, "description"?: text≤${L.descriptionMax}, "presetId"?: base design, "theme"?: {...}, "page"?: {...}, "sections": [1–${L.sectionsMax}, printed in order]}. Omitted fields take the base design's values.`)
  for (const k of kinds) lines.push(`presetId (${k}): ${(k === 'quote' ? QUOTE_PRESET_IDS : CATALOG_PRESET_IDS).join('|')}`)
  lines.push(`theme.palette: ${PALETTE_ROLES.join(', ')} — each "#RRGGBB".`)
  lines.push(`  contrast (WCAG): ${CONTRAST_RULES.filter((r) => r.severity === 'error').map((r) => `${r.fg}/${r.bg}≥${r.min}`).join(', ')}.`)
  lines.push(`theme.fonts: heading ${DOC_HEADING_FONT_IDS.join('|')}; body ${DOC_BODY_FONT_IDS.join('|')}; mono ${DOC_MONO_FONT_IDS.join('|')} (documents print figures in the text face; mono is kept for compatibility).`)
  lines.push(`  curated pairs heading+body: ${DOC_FONT_PAIRS.map((p) => `${p.heading}+${p.body}`).join(', ')}.`)
  lines.push(`theme.headingWeight ${DOC_HEADING_WEIGHTS.join('|')} (must exist in the heading font); labelCase ${LABEL_CASES.join('|')}; density ${DENSITIES.join('|')}; typeScale ${TYPE_SCALES.join('|')}; radius ${RADII.join('|')}; rules ${RULE_STYLES.join('|')}; accentUsage ${ACCENT_USAGES.join('|')}; drawingStyle ${DRAWING_STYLES.join('|')}; imageTreatment ${IMAGE_TREATMENTS.join('|')}.`)
  lines.push(`page: size ${PAGE_SIZES.join('|')}; margins {top,right,bottom,left} int ${PAGE_MARGIN_RANGE_MM.min}–${PAGE_MARGIN_RANGE_MM.max} mm; header ${PAGE_HEADERS.join('|')}; footer ${PAGE_FOOTERS.join('|')} (custom = configured footer text); pageNumbers ${PAGE_NUMBER_STYLES.join('|')}; pageNumberAlign ${PAGE_NUMBER_ALIGNS.join('|')}; chromeOnCover bool.`)
  lines.push(`settings (all optional): docTitle ${DOC_TITLES.join('|')}; customTitle text; numberPrefix text≤12; numberPad 0–6; showRevision bool; letterhead ${LETTERHEAD_LAYOUTS.join('|')}; logoSize ${LOGO_SIZES.join('|')}; termsPlacement ${TERMS_PLACEMENTS.join('|')}; brandProfile bool; brandHardware bool; brandPlacement ${BRAND_PLACEMENTS.join('|')}; brandSize ${BRAND_SIZES.join('|')}; lineDetail ${LINE_DETAILS.join('|')} (series = only the line name; full = verified catalog data too); customFields [{id,label}]≤${L.customFieldsMax}.`)
  lines.push(`section: {"type", "id"?: a-z0-9_- stable id, "enabled"?: bool, "pageBreak"?: ${PAGE_BREAKS.join('|')}, "tone"?: ${SECTION_TONES.join('|')} (allowed per type), "title"?: text≤${L.sectionTitleMax}, "options"?: partial options}.`)
  for (const k of kinds) {
    const req = REQUIRED_SECTIONS[k]
    lines.push(`Sections for ${k}${req.all.length ? ` (required visible: ${req.all.join(', ')})` : ''}${req.any.length ? ` (at least one visible of: ${req.any.join(', ')})` : ''}; recommended: ${RECOMMENDED_SECTIONS[k].join(', ')}:`)
    for (const type of sectionTypesFor(k)) {
      const meta = SECTION_META[type]
      const flags = [`max ${meta.max}`, `tones ${meta.tones.join('|')}`, type === 'cover' ? 'must be first' : '', meta.allowsTitle ? '' : 'no title'].filter(Boolean).join(', ')
      const opts = type === 'page_break' ? 'no options' : describeOptions(type)
      lines.push(`  - ${type} [${flags}]: ${opts}${layoutRuleText(type)}`)
    }
  }
  if (kinds.includes('catalog')) lines.push('Catalog cover: showClient must be false.')
  if (kinds.includes('quote')) {
    lines.push('Hard rule: the total and the final price appear only once, never before its closing, after all the windows. Default order: everything else, then totals, options_comparison, payment, warranty, terms, acceptance. Only those may follow totals; payment never goes before totals; settings.termsPlacement moves warranty and terms (after_total, own_page, before_total). No cover, letter, summary, strip, header, footer or index can show a total, and no custom text may state an amount.')
    lines.push('A quote opens with who issues it, what it is, for whom and until when: no greeting, no thanks, no marketing. The cover letter stays disabled unless asked for. Never write warranty years, lead times, payment percentages or validity: those are empty until the workshop fills them, and an empty section does not print.')
    lines.push(`theme.composition ${DOC_COMPOSITIONS.join('|')} sets the page grid; keep the base design's value. page.orientation ${PAGE_ORIENTATIONS.join('|')}.`)
  }
  lines.push(`richText: {"blocks":[ {"type":"paragraph","align"?:"start"|"center","children":[inline…]}, {"type":"heading","level":2|3,"children":[inline…]}, {"type":"bullet_list"|"ordered_list","items":[{"children":[inline…]}]} ]} ≤${L.richTextBlocksMax} blocks, ≤${L.richTextTotalCharsMax} chars. inline: {"type":"text","text":…,"bold"?:true,"italic"?:true} | {"type":"placeholder","key":…} | {"type":"line_break"}. No braces inside text nodes.`)
  for (const k of kinds) lines.push(`placeholders (${k}): ${placeholdersFor(k).join(', ')}. In titles write {key}; in richText use placeholder nodes.`)
  lines.push('Prefer designed variants over many knobs. Keep technical pages light. Never invent certifications, performance values, guarantees or legal claims in custom text.')
  const spec = lines.join('\n')
  promptCache.set(key, spec)
  return spec
}

/** Especificación textual para ambos tipos. */
export const DOC_TEMPLATE_PROMPT_SPEC: string = docTemplatePromptSpec()

// ── Parseo de respuestas ────────────────────────────────────────────────────────────────────────

export interface ParseAiTemplateResult {
  ok: boolean
  template?: DocTemplate
  issues: DocIssue[]
}

/** Extrae el JSON de una respuesta (quita ```json … ``` y texto alrededor). */
export function extractJsonText(text: string): string {
  let t = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)
  if (fence) t = fence[1].trim()
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) t = t.slice(start, end + 1)
  }
  return t
}

function decode(input: unknown, issues: DocIssue[]): { ok: boolean; value?: unknown } {
  let value = input
  if (typeof input === 'string') {
    if (input.length > L.maxJsonBytes) {
      issues.push(issue('error', 'too_large', [], { max: Math.round(L.maxJsonBytes / 1024) }))
      return { ok: false }
    }
    try {
      value = JSON.parse(extractJsonText(input))
    } catch {
      issues.push(issue('error', 'invalid_json', []))
      return { ok: false }
    }
  }
  const shape = measureJson(value, { maxDepth: L.maxJsonDepth, maxNodes: L.maxJsonNodes, maxChars: L.maxJsonBytes })
  if (shape.forbiddenKey) {
    issues.push(issue('error', 'forbidden_key', [], { key: shape.forbiddenKey }))
    return { ok: false }
  }
  if (shape.nonJson) {
    issues.push(issue('error', 'non_json', []))
    return { ok: false }
  }
  if (shape.exceeded) {
    issues.push(issue('error', shape.depth > L.maxJsonDepth ? 'too_deep' : 'too_large', [], { max: Math.round(L.maxJsonBytes / 1024) }))
    return { ok: false }
  }
  const unsafe = findUnsafeStrings(value, 20)
  if (unsafe.length) {
    for (const u of unsafe) issues.push(issue('error', 'unsafe_text', u.path, { reason: u.reason }))
    return { ok: false }
  }
  return { ok: true, value }
}

/**
 * Respuesta de la IA (texto o JSON) → plantilla válida o rechazo con motivos. Rechaza contenido
 * inseguro en CUALQUIER string (aunque esté en un campo que se descartaría); repara lo menor.
 */
export function parseAiTemplate(input: unknown, options: RepairTemplateOptions = {}): ParseAiTemplateResult {
  const issues: DocIssue[] = []
  const decoded = decode(input, issues)
  if (!decoded.ok) return { ok: false, issues: withMessages(issues) }
  const repaired = repairDocTemplate(decoded.value, options)
  issues.push(...repaired.issues)
  const parsed = DocTemplateSchema.safeParse(repaired.template)
  if (!parsed.success) {
    issues.push(...fromZodIssues(parsed.error.issues, [], repaired.template))
    return { ok: false, issues: withMessages(issues) }
  }
  for (const i of templateIssues(parsed.data)) if (i.severity !== 'error') issues.push(i)
  return { ok: true, template: parsed.data, issues: withMessages(issues) }
}

/**
 * Operaciones propuestas por la IA (texto JSON, `{ops:[…]}` o arreglo) → operaciones validadas.
 * Mismo filtro de seguridad que las plantillas; luego `applyDocOps` valida contra el destino.
 */
export function parseAiDocOps(input: unknown): { ok: boolean; ops: DocOp[]; issues: DocIssue[] } {
  const issues: DocIssue[] = []
  const decoded = decode(input, issues)
  if (!decoded.ok) return { ok: false, ops: [], issues: withMessages(issues) }
  const value = decoded.value
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { ops?: unknown }).ops : undefined
  return parseDocOps(list)
}
