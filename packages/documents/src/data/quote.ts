/**
 * Datos de la cotización para el cliente (QuoteDocData) a partir de la cotización guardada,
 * el catálogo efectivo y los ajustes de la organización. Puro y determinista: lo usan la
 * vista previa en vivo de la web y el servidor para el PDF, así ambos muestran lo mismo.
 *
 * - Las cifras salen siempre del motor (`evaluateQuote`); nunca de la plantilla.
 * - Las preferencias del documento combinan `settings.documents` con `quote.documentOverrides`.
 * - Las notas internas (`quote.notes`) nunca llegan al documento.
 */
import {
  computeLayout,
  designName,
  evaluateQuote,
  includedLineIds,
  matchTypology,
  safeLayout,
  type AssemblyKind,
  type Bom,
  type Catalog,
  type Color,
  type CutSettings,
  type DesignNode,
  type GlassKind,
  type Id,
  type Layout,
  type LayoutAssemblyPlan,
  type Material,
  type PricingSettings,
  type QuoteEvaluation,
  type QuoteLineRole,
  type QuoteTotals,
  type WindowDesign,
  type WindowExtras,
} from '@dekopen/engine'
import {
  cleanSeededPrefs,
  isTemplateId,
  migrateQuoteDocOverrides,
  type Client,
  type DocTemplate,
  type DocumentPrefs,
  type Locale,
  type Org,
  type Quote,
  type QuoteDocOverridesV2,
  type QuoteTemplateId,
} from '@dekopen/shared'
import { pdfPaymentDetails, type PaymentSettings } from '@dekopen/shared'
import type { DocClient, DocOrg } from '../base/types'
import type { QuoteDocData, QuoteDocItem } from '../sales/types'

// ── Datos v5 (aditivos: un QuoteDocData v4 sigue siendo válido) ─────────────────

/** Color tal como lo necesita el documento (nombre del catálogo, sin traducir). */
export interface QuoteDocColor {
  id: string
  name: string
  hex: string
  code?: string
  texture?: Color['texture']
}

export interface QuoteDocGlass {
  id: string
  name: string
  kind: GlassKind
  thickness?: number
  composition?: string
}

export interface QuoteDocLine {
  id: string
  /** «PVC Proline PRO6004»: el nombre completo (taller, listas internas). */
  name: string
  /** Solo la línea: «PRO6004». Es lo que dice el documento: la marca va con su logo. */
  series?: string
  brand?: string
  brandId?: string
  material: Material
  depth?: number
  chambers?: number
  description?: string
}

/** Ventana del documento con lo que necesitan las plantillas v5 (todo opcional). */
export interface QuoteDocItemV5 extends QuoteDocItem {
  /** Tipología reconocida por el motor (para nombrarla en el idioma del documento). */
  typologyId?: string
  colorOut?: QuoteDocColor
  /** Solo si difiere del exterior (bicolor). */
  colorIn?: QuoteDocColor
  /** Vidrios distintos de la ventana (el primero es el principal). */
  glasses?: QuoteDocGlass[]
  line?: QuoteDocLine
  extras?: WindowExtras
  /** Herrajes del despiece (nombres del catálogo, sin repetir). */
  hardware?: string[]
  /** Piso o nivel. */
  floor?: string
  /** Medida de vano cargada por el taller (mm). */
  rough?: { width?: number; height?: number }
  /** Base (sin dato), opcional o alternativa. */
  role?: QuoteLineRole
  altGroup?: string
  /** Cuenta en el total. Solo se informa cuando no es una línea base. */
  included?: boolean
  /** Descuento de la línea en %. `unitPrice` queda de lista; `total` ya viene descontado. */
  lineDiscountPct?: number
  /**
   * Le falta precio (ver `ItemPrice.pending`): `all` = la ventana entera, fuera del total; `partial` =
   * en un conjunto, solo `pendingParts`. Nunca se imprime como $0 ni como incluida.
   */
  pending?: 'all' | 'partial'
  /** Unidades y uniones de un conjunto que faltan por precio. */
  pendingParts?: { kind: 'unit' | 'joint'; label: string }[]
  /** Conjunto de ventanas (acopladas, esquina, bay, bow). */
  assembly?: QuoteDocAssembly
}

/** Conjunto tal como lo muestra el documento: sus unidades, sus uniones y su planta. */
export interface QuoteDocAssembly {
  kind: AssemblyKind
  units: { id: string; width: number; height: number; typologyId?: string; design: WindowDesign }[]
  joints: { label: string; angle: number; kind: 'coupler' | 'corner_post' | 'variable_post'; missing: boolean }[]
  plan?: LayoutAssemblyPlan
}

/** Cómo se agrupan las ventanas. */
export type QuoteDocGroupBy = 'room' | 'floor' | 'line'

/** Grupo de ventanas (recinto, piso o línea) con su subtotal ya calculado desde las cifras del motor. */
export interface QuoteDocGroup {
  key: string
  /** Nombre tal como lo escribió el taller ('' = sin recinto o sin piso). */
  label: string
  refs: string[]
  /** Suma de los totales netos de sus ventanas (cifras del motor, antes de descuento e impuesto). */
  subtotal: number
  units: number
}

/** Contexto v5 del documento: idioma, moneda, plantilla, ajustes y recursos. */
export interface QuoteDocDocument {
  /** Idioma del documento ya resuelto (cotización → organización → español). */
  locale?: Locale
  /** Moneda ISO 4217 de la organización (CLP por defecto). */
  currency?: string
  /** Rótulo del impuesto («IVA», «VAT»). */
  taxLabel?: string
  /** Tasa del impuesto en % (la de `pricing.ivaPct`). */
  taxRate?: number
  /** `OrgSettings.documents` (capa de organización). */
  orgPrefs?: Partial<DocumentPrefs>
  /** `Quote.documentOverrides` crudo (v1 o v2). */
  overrides?: unknown
  /** Plantilla elegida ya cargada (diseño predefinido o plantilla de la organización). */
  template?: DocTemplate
  /** Imágenes subidas que usa la plantilla (id de recurso → data URL). */
  assets?: Record<string, string>
  /** Texturas subidas que usan los colores (id de recurso → data URL). */
  textures?: Record<string, string>
  /** Ventanas agrupadas por recinto, con subtotales del motor. */
  groups?: QuoteDocGroup[]
  /** Ventanas agrupadas por piso y por línea (`groups` es por recinto). */
  groupsByFloor?: QuoteDocGroup[]
  groupsByLine?: QuoteDocGroup[]
}

export interface QuoteDocDataV5 extends QuoteDocData {
  items: QuoteDocItemV5[]
  document?: QuoteDocDocument
}

/**
 * Textos propios de una cotización. Además de cualquier preferencia del documento, admite
 * `notes`: nota visible para el cliente escrita directamente en la vista previa.
 */
export type QuoteDocOverrides = Partial<DocumentPrefs> & { notes?: string }

/** Ajustes mínimos de la organización que necesita el documento. */
export interface QuoteDocSettings {
  /** Datos de pago del taller: solo se imprimen si eligió `showInPdf`. */
  payments?: PaymentSettings
  pricing?: Partial<PricingSettings>
  cut?: Partial<CutSettings>
  documents?: Partial<DocumentPrefs>
  /** Idioma de documentos de la organización (`OrgSettings.locale`). */
  locale?: Locale
  /** Moneda de la organización (`OrgSettings.currency`). */
  currency?: string
  /** Rótulo del impuesto (`OrgSettings.taxLabel`). */
  taxLabel?: string
}

export interface BuildQuoteDocInput {
  quote: Quote
  org: DocOrg | Org
  catalog: Catalog
  settings: QuoteDocSettings
  /** Cliente a mostrar (si no, `quote.client`). `null` = sin cliente. */
  client?: Client | DocClient | null
  /** Enlace al portal: el documento invita a revisar y aceptar en línea. */
  portalUrl?: string
  /** Fecha de emisión (ISO). Por defecto, la del último envío o la última edición. */
  date?: string
  /** Evaluación ya calculada con el mismo motor (la web la tiene en vivo; evita recalcular). */
  evaluation?: QuoteEvaluation
  /** Geometría para el dibujo (por defecto `computeLayout` del motor, a prueba de fallos). */
  layout?: (design: WindowDesign, catalog: Catalog) => Layout
  /** Plantilla ya cargada (p. ej. la plantilla propia de la organización elegida). */
  template?: DocTemplate
  /** Imágenes de la plantilla (id de recurso → data URL), resueltas dentro de la organización. */
  assets?: Record<string, string>
  /** Texturas subidas de los colores (id de recurso → data URL). */
  textures?: Record<string, string>
  /** Fuerza el idioma del documento (si no: el de la cotización, luego el de la organización). */
  locale?: Locale
}


/**
 * Preferencias neutras para completar ajustes parciales. Los textos por defecto reales los
 * define la organización (el servidor siembra unos cálidos); aquí solo evitamos huecos.
 */
export const QUOTE_DOC_FALLBACK_PREFS: DocumentPrefs = Object.freeze({
  quoteTemplate: 'esencial',
  catalogTemplate: 'vitrina',
  font: 'instrument',
  showUnitPrice: true,
  showArea: true,
  showGlass: true,
  showLine: true,
  showColorSwatch: true,
  showExteriorView: false,
  paper: 'letter',
  intro: '',
  conditions: '',
  paymentTerms: '',
  warranty: '',
  validityDays: 0,
  leadTimeText: '',
}) as DocumentPrefs

const BOOLEAN_KEYS = [
  'showUnitPrice',
  'showArea',
  'showGlass',
  'showLine',
  'showColorSwatch',
  'showExteriorView',
] as const satisfies readonly (keyof DocumentPrefs)[]

const TEXT_KEYS = [
  'intro',
  'conditions',
  'paymentTerms',
  'warranty',
  'leadTimeText',
  'signatureName',
  'footer',
  'accent',
] as const satisfies readonly (keyof DocumentPrefs)[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Días de validez desde número o texto («20», «20 días»); null si no se entiende. */
export function parseQuoteValidityDays(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
  if (typeof value !== 'string') return null
  const match = /\d+/.exec(value.replace(/\./g, ''))
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? Math.min(n, 3650) : null
}

/**
 * Combina las preferencias de la organización con las de la cotización. Ignora valores vacíos
 * o de tipo incorrecto (los datos guardados pueden venir de versiones anteriores).
 */
export function mergeQuoteDocPrefs(base?: Partial<DocumentPrefs> | null, overrides?: QuoteDocOverrides | QuoteDocOverridesV2 | Record<string, unknown> | null): DocumentPrefs {
  const out: DocumentPrefs = { ...QUOTE_DOC_FALLBACK_PREFS }
  for (const raw of [base ? cleanSeededPrefs(base) : base, overrides] as unknown[]) {
    if (!isRecord(raw)) continue
    // Ajustes v2 (`{ v: 2, texts, templateId… }`) se leen como sus equivalentes v4.
    const s = (raw.v === 2 ? v2AsPrefs(raw) : raw) as Record<string, unknown>
    // Plantilla: diseño predefinido, id v4 o plantilla propia (id validado; se resuelve al dibujar).
    if (isTemplateId(s.quoteTemplate)) out.quoteTemplate = s.quoteTemplate as QuoteTemplateId
    if (isTemplateId(s.catalogTemplate)) out.catalogTemplate = s.catalogTemplate as DocumentPrefs['catalogTemplate']
    if (s.font === 'instrument' || s.font === 'serif' || s.font === 'grotesk') out.font = s.font
    if (s.paper === 'letter' || s.paper === 'a4') out.paper = s.paper
    for (const key of BOOLEAN_KEYS) if (typeof s[key] === 'boolean') out[key] = s[key] as boolean
    for (const key of TEXT_KEYS) {
      const value = s[key]
      // Un texto vacío en la cotización es una decisión («sin condiciones»); en la base, también.
      if (typeof value === 'string') (out as unknown as Record<string, unknown>)[key] = value
    }
    const days = parseQuoteValidityDays(s.validityDays)
    if (days !== null) out.validityDays = days
  }
  // El acento vacío vuelve al color de la organización.
  if (!out.accent) delete out.accent
  for (const key of ['signatureName', 'footer'] as const) if (!out[key]) delete out[key]
  return out
}

/** Ajustes por cotización v2 → claves v4 equivalentes (textos, validez, plantilla, papel, acento, interruptores). */
function v2AsPrefs(raw: Record<string, unknown>): Record<string, unknown> {
  const { overrides } = migrateQuoteDocOverrides(raw)
  const out: Record<string, unknown> = { ...(overrides.texts ?? {}) }
  if (overrides.validityDays !== undefined) out.validityDays = overrides.validityDays
  if (overrides.templateId) out.quoteTemplate = overrides.templateId
  if (overrides.page?.size) out.paper = overrides.page.size === 'A4' ? 'a4' : 'letter'
  const accent = overrides.theme?.palette?.accent
  if (accent) out.accent = accent
  const d = overrides.itemDisplay
  if (d) {
    if (d.showUnitPrices !== undefined) out.showUnitPrice = d.showUnitPrices
    if (d.showArea !== undefined) out.showArea = d.showArea
    if (d.showGlass !== undefined) out.showGlass = d.showGlass
    if (d.showSystem !== undefined) out.showLine = d.showSystem
    if (d.showSwatches !== undefined) out.showColorSwatch = d.showSwatches
    if (d.drawingView !== undefined) out.showExteriorView = d.drawingView !== 'interior'
  }
  return out
}

/** Fecha ISO yyyy-mm-dd en hora de Chile (determinista para una misma entrada). */
export function quoteDocDate(value: string | Date | undefined | null): string {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const out = `${get('year')}-${get('month')}-${get('day')}`
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : date.toISOString().slice(0, 10)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t ? t : undefined
}

/** Recorte de la empresa para el documento (sin campos internos). */
export function quoteDocOrg(org: DocOrg | Org): DocOrg {
  const out: DocOrg = { name: trimmed(org.name) ?? '' }
  for (const key of ['legalName', 'rut', 'address', 'city', 'phone', 'email', 'website', 'logo', 'accent'] as const) {
    const value = trimmed(org[key])
    if (value) out[key] = value
  }
  return out
}

/** Recorte del cliente para el documento; sin nombre no hay cliente que mostrar. */
export function quoteDocClient(client: Client | DocClient | null | undefined): DocClient | undefined {
  if (!client) return undefined
  const name = trimmed(client.name)
  if (!name) return undefined
  const out: DocClient = { name }
  for (const key of ['rut', 'email', 'phone', 'address', 'city'] as const) {
    const value = trimmed(client[key])
    if (value) out[key] = value
  }
  return out
}

/** «PVC Serie 60», «Aluminio Proline AL25» (sin repetir la marca si la línea ya la nombra). */
export function quoteDocLine(design: WindowDesign, catalog: Catalog): string {
  const line = catalog.lines?.find((l) => l.id === design.lineId)
  if (!line) return ''
  const material = line.material === 'aluminum' ? 'Aluminio' : 'PVC'
  const brand = catalog.brands?.find((b) => b.id === line.brandId)?.name?.trim()
  const name = line.name?.trim() ?? ''
  const withBrand = brand && !name.toLowerCase().includes(brand.toLowerCase()) && !/gen[eé]ric/i.test(brand) && !/ejemplo/i.test(brand) ? `${brand} ${name}` : name
  return `${material} ${withBrand}`.trim()
}

/** «Blanco» o «Nogal exterior, blanco interior». */
export function quoteDocColor(design: WindowDesign, catalog: Catalog): string {
  const name = (id: Id | undefined) => (id ? catalog.colors?.find((c) => c.id === id)?.name?.trim() : undefined)
  const ext = name(design.colorId)
  const int = design.colorInId && design.colorInId !== design.colorId ? name(design.colorInId) : undefined
  if (ext && int) return `${ext} exterior, ${int.charAt(0).toLowerCase()}${int.slice(1)} interior`
  return ext ?? int ?? ''
}

/**
 * Vidrios de cada paño. El árbol guardado puede venir incompleto (la API solo valida `id` y
 * `type` de la raíz): se saltan nodos nulos, listas que no son listas y paneles vacíos.
 */
function glassIdsOf(node: DesignNode | null | undefined, fallback: Id, out: Id[], depth = 0): Id[] {
  if (!node || typeof node !== 'object' || depth > 64) return out
  const n = node as Partial<Record<'type' | 'fill' | 'glassId' | 'children' | 'panels', unknown>>
  if (n.type === 'leaf') {
    if (n.fill !== 'panel') out.push((typeof n.glassId === 'string' && n.glassId) || fallback)
  } else if (n.type === 'split') {
    if (Array.isArray(n.children)) for (const child of n.children) glassIdsOf(child as DesignNode, fallback, out, depth + 1)
  } else if (n.type === 'sliding') {
    if (Array.isArray(n.panels)) {
      for (const panel of n.panels as ({ glassId?: unknown } | null)[]) {
        if (panel && typeof panel === 'object') out.push((typeof panel.glassId === 'string' && panel.glassId) || fallback)
      }
    }
  }
  return out
}

/** Vidrio del diseño; si hay paños con vidrios distintos, todos: «Termopanel 4-12-4 y laminado 3+3». */
export function quoteDocGlass(design: WindowDesign, catalog: Catalog): string {
  const ids = design.root ? glassIdsOf(design.root, design.glassId, []) : [design.glassId]
  const unique = [...new Set(ids.length ? ids : [design.glassId])]
  const names = unique.map((id) => catalog.glass?.find((g) => g.id === id)?.name?.trim()).filter((n): n is string => !!n)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  const rest = names.slice(1).map((n) => n.charAt(0).toLowerCase() + n.slice(1))
  return [names[0], ...rest.slice(0, -1)].join(', ') + ` y ${rest[rest.length - 1]}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function defaultLayout(design: WindowDesign, catalog: Catalog): Layout {
  return safeLayout({ computeLayout }, design, catalog)
}

/** Nota visible para el cliente (vive en documentOverrides.notes). */
export function quoteClientNotes(quote: Pick<Quote, 'documentOverrides'>): string | undefined {
  const raw = quote.documentOverrides as Record<string, unknown> | undefined
  if (isRecord(raw) && raw.v === 2) return trimmed(migrateQuoteDocOverrides(raw).overrides.texts?.clientNote)
  return trimmed((raw as QuoteDocOverrides | undefined)?.notes)
}

/** Color del catálogo para el documento (o nada si el id no existe). */
export function quoteDocColorOf(id: Id | undefined, catalog: Catalog): QuoteDocColor | undefined {
  if (!id) return undefined
  const color = catalog.colors?.find((c) => c.id === id)
  if (!color) return undefined
  const out: QuoteDocColor = { id: color.id, name: color.name?.trim() || color.id, hex: color.hex }
  if (color.code) out.code = color.code
  if (color.texture) out.texture = color.texture
  return out
}

/** Vidrios distintos de la ventana con su composición (el principal primero). */
export function quoteDocGlasses(design: WindowDesign, catalog: Catalog): QuoteDocGlass[] {
  const ids = design.root ? glassIdsOf(design.root, design.glassId, []) : [design.glassId]
  const unique = [...new Set(ids.length ? ids : [design.glassId])]
  const out: QuoteDocGlass[] = []
  for (const id of unique) {
    const glass = catalog.glass?.find((g) => g.id === id)
    if (!glass) continue
    const doc: QuoteDocGlass = { id: glass.id, name: glass.name?.trim() || glass.id, kind: glass.kind }
    if (Number.isFinite(glass.thickness) && glass.thickness > 0) doc.thickness = glass.thickness
    if (glass.composition?.trim()) doc.composition = glass.composition.trim()
    out.push(doc)
  }
  return out
}

/** Línea del sistema con sus datos técnicos verificados (profundidad, cámaras). */
export function quoteDocLineOf(design: WindowDesign, catalog: Catalog): QuoteDocLine | undefined {
  const line = catalog.lines?.find((l) => l.id === design.lineId)
  if (!line) return undefined
  const out: QuoteDocLine = { id: line.id, name: quoteDocLine(design, catalog) || line.name, material: line.material, brandId: line.brandId }
  const brand = catalog.brands?.find((b) => b.id === line.brandId)?.name?.trim()
  if (brand && !/gen[eé]ric/i.test(brand) && !/ejemplo/i.test(brand)) out.brand = brand
  const series = lineSeries(line.name, brand)
  if (series) out.series = series
  if (Number.isFinite(line.depth) && (line.depth ?? 0) > 0) out.depth = line.depth
  if (Number.isFinite(line.chambers) && (line.chambers ?? 0) > 0) out.chambers = line.chambers
  if (line.description?.trim()) out.description = line.description.trim()
  return out
}

/** Conjunto ya resuelto por el motor, sin dibujar nada aquí. */
export function quoteDocAssembly(layout: Layout): QuoteDocAssembly | undefined {
  const asm = layout.assembly
  if (!asm) return undefined
  const out: QuoteDocAssembly = {
    kind: asm.kind,
    units: asm.units.map((u) => {
      const typologyId = safeValue(() => matchTypology(u.design))
      return { id: u.unitId, width: u.rect.w, height: u.rect.h, design: u.design, ...(typologyId ? { typologyId } : {}) }
    }),
    joints: asm.joints.map((j) => ({ label: j.label, angle: j.angle, kind: j.kind, missing: j.status === 'missing' })),
  }
  if (asm.plan) out.plan = asm.plan
  return out
}

/** La línea sin la marca delante: «Proline PRO6004» → «PRO6004». La marca va con su logo. */
export function lineSeries(name: string | undefined, brand: string | undefined): string {
  const clean = name?.trim() ?? ''
  if (!brand || !clean.toLowerCase().startsWith(`${brand.toLowerCase()} `)) return clean
  return clean.slice(brand.length).trim()
}

/** Herrajes del despiece, sin repetir (nombres del catálogo; nunca cantidades ni códigos internos). */
export function quoteDocHardware(bom: Pick<Bom, 'items'> | undefined): string[] {
  const names = new Set<string>()
  for (const line of bom?.items ?? []) {
    if (line?.kind !== 'hardware') continue
    const name = line.name?.trim()
    if (name) names.add(name)
    if (names.size >= 8) break
  }
  return [...names]
}

type GroupableItem = Pick<QuoteDocItem, 'ref' | 'location' | 'total' | 'qty'> & Pick<QuoteDocItemV5, 'floor' | 'line' | 'included' | 'assembly'>

/**
 * Ventanas por recinto, piso o línea (en el orden en que aparecen) con su subtotal: la suma de los
 * totales netos de cada ventana que cuenta en el total (cifras del motor). La plantilla nunca suma: lee
 * estos grupos.
 */
export function quoteDocGroups(items: readonly GroupableItem[], by: QuoteDocGroupBy = 'room'): QuoteDocGroup[] {
  const groups = new Map<string, QuoteDocGroup>()
  for (const item of items) {
    const label = (by === 'floor' ? item.floor : by === 'line' ? (item.line?.series ?? item.line?.name) : item.location)?.trim() ?? ''
    const key = label.toLocaleLowerCase('es')
    let group = groups.get(key)
    if (!group) {
      group = { key: key || '-', label, refs: [], subtotal: 0, units: 0 }
      groups.set(key, group)
    }
    group.refs.push(item.ref)
    if (item.included === false) continue
    group.subtotal += Math.round(item.total)
    group.units += item.qty * Math.max(1, item.assembly?.units.length ?? 1)
  }
  return [...groups.values()]
}

/** Los tres agrupamientos del documento. */
function allGroups(items: readonly GroupableItem[]): Pick<QuoteDocDocument, 'groups' | 'groupsByFloor' | 'groupsByLine'> {
  return { groups: quoteDocGroups(items), groupsByFloor: quoteDocGroups(items, 'floor'), groupsByLine: quoteDocGroups(items, 'line') }
}

/**
 * Arma los datos de la cotización para cualquier plantilla (v4 o v5).
 * Nunca lanza: un diseño roto se dibuja como contorno y se cotiza con avisos del motor.
 */
export function buildQuoteDocData(input: BuildQuoteDocInput): QuoteDocDataV5 {
  const { quote, catalog, settings } = input
  const items = Array.isArray(quote.items) ? quote.items : []
  const extras = Array.isArray(quote.extras) ? quote.extras : []
  const evaluation =
    input.evaluation ??
    evaluateQuote({ items, extras, discountPct: quote.discountPct ?? 0, pricing: quote.pricing }, catalog, settings.pricing ?? {}, { cut: settings.cut })
  const byId = new Map(evaluation.items.map((e) => [e.id, e]))
  const toLayout = input.layout ?? defaultLayout
  // Una evaluación inyectada puede venir de otro motor en pruebas: la regla de qué cuenta es una sola.
  const counted = includedLineIds([...items.filter(Boolean), ...extras.filter(Boolean)])

  const docItems: QuoteDocItemV5[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || !item.design || typeof item.design !== 'object') continue
    const qty = Number.isFinite(item.qty) ? item.qty : 0
    // Una ventana con cantidad 0 queda fuera del documento (sirve para dejar opciones en pausa).
    if (qty <= 0) continue
    const evaluated = byId.get(item.id)
    const design = item.design
    const price = evaluated?.price
    const unitPrice = price?.unitNet ?? 0
    const width = finiteOr0(design.width)
    const height = finiteOr0(design.height)
    const area = evaluated?.bom.area ?? (width * height) / 1_000_000
    // Una ventana rota no tumba el documento: cada dato descriptivo cae a vacío por separado.
    const docItem: QuoteDocItemV5 = {
      id: item.id,
      ref: item.ref || '',
      qty,
      description: safeName(design),
      lineName: safeText(() => quoteDocLine(design, catalog)),
      colorName: safeText(() => quoteDocColor(design, catalog)),
      glassName: safeText(() => quoteDocGlass(design, catalog)),
      width,
      height,
      area: round2(Number.isFinite(area) ? area : 0),
      unitPrice,
      total: price?.totalNet ?? unitPrice * qty,
      layout: safeItemLayout(toLayout, design, catalog),
      design,
    }
    const name = trimmed(item.name)
    if (name) docItem.name = name
    const location = trimmed(item.location)
    if (location) docItem.location = location
    const notes = trimmed(item.notes)
    if (notes) docItem.notes = notes
    if (price?.manual) docItem.manual = true
    // Datos v5: cada uno a prueba de fallos, por separado.
    const typologyId = safeValue(() => matchTypology(design))
    if (typologyId) docItem.typologyId = typologyId
    const colorOut = safeValue(() => quoteDocColorOf(design.colorId, catalog))
    if (colorOut) docItem.colorOut = colorOut
    if (design.colorInId && design.colorInId !== design.colorId) {
      const colorIn = safeValue(() => quoteDocColorOf(design.colorInId, catalog))
      if (colorIn) docItem.colorIn = colorIn
    }
    const glasses = safeValue(() => quoteDocGlasses(design, catalog))
    if (glasses?.length) docItem.glasses = glasses
    const line = safeValue(() => quoteDocLineOf(design, catalog))
    if (line) docItem.line = line
    if (design.extras && typeof design.extras === 'object') docItem.extras = { ...design.extras }
    const hardware = quoteDocHardware(evaluated?.bom)
    if (hardware.length) docItem.hardware = hardware
    const floor = trimmed(item.floor)
    if (floor) docItem.floor = floor
    if (item.rough && (item.rough.width || item.rough.height)) docItem.rough = { ...item.rough }
    if (item.role && item.role !== 'base') {
      docItem.role = item.role
      const altGroup = trimmed(item.altGroup)
      if (altGroup) docItem.altGroup = altGroup
      docItem.included = counted.has(item.id)
    }
    if (price?.lineDiscountPct) docItem.lineDiscountPct = price.lineDiscountPct
    if (price?.pending?.length) {
      docItem.pending = (price.totalNet ?? 0) > 0 ? 'partial' : 'all'
      // Las uniones sin pieza en el catálogo no tienen precio propio: solo vienen en `pending`.
      const parts = (price.units ?? []).filter((u) => u.pending).map((u) => ({ kind: u.kind, label: u.label }))
      for (const p of price.pending) if (p.code === 'joint_missing') parts.push({ kind: 'joint', label: p.ref.replace(/^unión\s+/, '') })
      if (parts.length) docItem.pendingParts = parts
    }
    const assembly = safeValue(() => quoteDocAssembly(docItem.layout))
    if (assembly) docItem.assembly = assembly
    docItems.push(docItem)
  }

  const prefs = mergeQuoteDocPrefs(settings.documents, quote.documentOverrides)
  const client = input.client === null ? undefined : quoteDocClient(input.client ?? quote.client)
  const date = quoteDocDate(input.date ?? quote.sentAt ?? quote.updatedAt ?? quote.createdAt) || quoteDocDate(new Date(0))

  const docQuote: QuoteDocData['quote'] = {
    number: quote.number,
    title: trimmed(quote.title) ?? '',
    revision: Math.max(0, quote.revision ?? 0),
    date,
  }
  const validUntil = trimmed(quote.validUntil)
  if (validUntil) docQuote.validUntil = quoteDocDate(validUntil)
  const siteAddress = trimmed(quote.siteAddress)
  if (siteAddress) docQuote.siteAddress = siteAddress
  const notes = quoteClientNotes(quote)
  if (notes) docQuote.notes = notes
  if (quote.acceptedBy?.name) docQuote.acceptedBy = { ...quote.acceptedBy }
  const portalUrl = trimmed(input.portalUrl)
  if (portalUrl) docQuote.portalUrl = portalUrl

  const overrides = migrateQuoteDocOverrides(quote.documentOverrides ?? null).overrides
  const locale = input.locale ?? overrides.locale ?? settings.locale
  const document: QuoteDocDocument = {
    currency: (settings.currency || 'CLP').toUpperCase(),
    orgPrefs: settings.documents ?? {},
    overrides: quote.documentOverrides ?? null,
    ...allGroups(docItems),
  }
  if (locale) document.locale = locale
  const taxLabel = trimmed(settings.taxLabel)
  if (taxLabel) document.taxLabel = taxLabel
  const taxRate = evaluation.pricing?.ivaPct ?? settings.pricing?.ivaPct
  if (typeof taxRate === 'number' && Number.isFinite(taxRate)) document.taxRate = taxRate
  if (input.template) document.template = input.template
  if (input.assets && Object.keys(input.assets).length) document.assets = { ...input.assets }
  if (input.textures && Object.keys(input.textures).length) document.textures = { ...input.textures }

  const data: QuoteDocDataV5 = {
    org: quoteDocOrg(input.org),
    quote: docQuote,
    items: docItems,
    totals: evaluation.totals,
    extras: extras.map((e) => ({ ...e })),
    prefs,
    catalog,
    document,
  }
  if (client) data.client = client
  const paymentDetails = pdfPaymentDetails(settings.payments)
  if (paymentDetails) data.paymentDetails = paymentDetails
  return data
}

/** Precio fijado por ítem (id del ítem de la cotización → neto unitario y total). */
export type PinnedItemPrices = Record<string, { unitNet: number; totalNet: number; pending?: boolean }>

/**
 * Cifras congeladas al enviar (portal): el cliente ve exactamente lo que se le mandó, aunque
 * después cambien los precios del catálogo. Cada ventana del documento se cruza con su ítem por
 * id (o por ref si el documento no trae id), nunca por posición: el documento omite las ventanas
 * con cantidad 0. Los totales fijados nunca muestran costo ni margen.
 */
export function pinQuoteDocPrices(data: QuoteDocData, quote: Pick<Quote, 'items'>, itemPrices?: PinnedItemPrices | null, totals?: QuoteTotals | null): QuoteDocData {
  if (!itemPrices && !totals) return data
  const sourceItems = Array.isArray(quote.items) ? quote.items : []
  const byId = new Map(sourceItems.map((i) => [i.id, i]))
  const used = new Set<string>()
  const items = data.items.map((docItem) => {
    let source = docItem.id ? byId.get(docItem.id) : undefined
    // Sin id: por ref, sin repetir ítems (las refs pueden repetirse) y saltando las de cantidad 0.
    source ??= sourceItems.find((i) => !used.has(i.id) && i.ref === docItem.ref && Number.isFinite(i.qty) && i.qty > 0)
    if (source) used.add(source.id)
    const pinned = source ? itemPrices?.[source.id] : undefined
    if (!pinned) return docItem
    const fixed: QuoteDocItemV5 = { ...docItem, unitPrice: pinned.unitNet, total: pinned.totalNet }
    // Lo fijado manda: si al enviar tenía precio, hoy no pasa a pendiente porque cambió el catálogo.
    if (pinned.totalNet > 0 && !pinned.pending) {
      delete fixed.pending
      delete fixed.pendingParts
    }
    return fixed
  })
  const out = { ...data, items, ...(totals ? { totals: { ...totals, cost: 0, marginPct: 0 } } : {}) }
  // Los subtotales por recinto siguen a los precios fijados.
  const doc = (data as QuoteDocDataV5).document
  if (doc) (out as QuoteDocDataV5).document = { ...doc, ...allGroups(items) }
  return out
}

function safeName(design: WindowDesign): string {
  try {
    const name = designName(design)
    return typeof name === 'string' && name ? name : 'Ventana'
  } catch {
    return 'Ventana'
  }
}

function safeValue<T>(read: () => T): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

function safeText(read: () => string): string {
  try {
    const text = read()
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

const finiteOr0 = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/** El layout inyectado (la web pasa el suyo) también puede lanzar: se cae al contorno del motor. */
function safeItemLayout(toLayout: (design: WindowDesign, catalog: Catalog) => Layout, design: WindowDesign, catalog: Catalog): Layout {
  try {
    const layout = toLayout(design, catalog)
    if (layout) return layout
  } catch {
    // contorno
  }
  return defaultLayout(design, catalog)
}
