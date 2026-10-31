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
  safeLayout,
  type Catalog,
  type CutSettings,
  type DesignNode,
  type Id,
  type Layout,
  type PricingSettings,
  type QuoteEvaluation,
  type QuoteTotals,
  type WindowDesign,
} from '@framezen/engine'
import type { Client, DocumentPrefs, Org, Quote, QuoteTemplateId } from '@framezen/shared'
import type { DocClient, DocOrg } from '../base/types'
import type { QuoteDocData, QuoteDocItem } from '../sales/types'

/**
 * Textos propios de una cotización. Además de cualquier preferencia del documento, admite
 * `notes`: nota visible para el cliente escrita directamente en la vista previa.
 */
export type QuoteDocOverrides = Partial<DocumentPrefs> & { notes?: string }

/** Ajustes mínimos de la organización que necesita el documento. */
export interface QuoteDocSettings {
  pricing?: Partial<PricingSettings>
  cut?: Partial<CutSettings>
  documents?: Partial<DocumentPrefs>
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
}

const TEMPLATES: readonly QuoteTemplateId[] = ['esencial', 'galeria', 'compacta', 'editorial']

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
  validityDays: 15,
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
export function mergeQuoteDocPrefs(base?: Partial<DocumentPrefs> | null, overrides?: QuoteDocOverrides | null): DocumentPrefs {
  const out: DocumentPrefs = { ...QUOTE_DOC_FALLBACK_PREFS }
  for (const source of [base, overrides]) {
    if (!isRecord(source)) continue
    const s = source as Record<string, unknown>
    if (typeof s.quoteTemplate === 'string' && (TEMPLATES as readonly string[]).includes(s.quoteTemplate)) {
      out.quoteTemplate = s.quoteTemplate as QuoteTemplateId
    }
    if (s.catalogTemplate === 'vitrina' || s.catalogTemplate === 'ficha' || s.catalogTemplate === 'lookbook') out.catalogTemplate = s.catalogTemplate
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
  const overrides = quote.documentOverrides as QuoteDocOverrides | undefined
  return trimmed(overrides?.notes)
}

/**
 * Arma los datos de la cotización para cualquiera de las cuatro plantillas.
 * Nunca lanza: un diseño roto se dibuja como contorno y se cotiza con avisos del motor.
 */
export function buildQuoteDocData(input: BuildQuoteDocInput): QuoteDocData {
  const { quote, catalog, settings } = input
  const items = Array.isArray(quote.items) ? quote.items : []
  const extras = Array.isArray(quote.extras) ? quote.extras : []
  const evaluation =
    input.evaluation ??
    evaluateQuote({ items, extras, discountPct: quote.discountPct ?? 0, pricing: quote.pricing }, catalog, settings.pricing ?? {}, { cut: settings.cut })
  const byId = new Map(evaluation.items.map((e) => [e.id, e]))
  const toLayout = input.layout ?? defaultLayout

  const docItems: QuoteDocItem[] = []
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
    const docItem: QuoteDocItem = {
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
    docItems.push(docItem)
  }

  const prefs = mergeQuoteDocPrefs(settings.documents, quote.documentOverrides as QuoteDocOverrides | undefined)
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
  const notes = quoteClientNotes(quote)
  if (notes) docQuote.notes = notes
  if (quote.acceptedBy?.name) docQuote.acceptedBy = { ...quote.acceptedBy }
  const portalUrl = trimmed(input.portalUrl)
  if (portalUrl) docQuote.portalUrl = portalUrl

  const data: QuoteDocData = {
    org: quoteDocOrg(input.org),
    quote: docQuote,
    items: docItems,
    totals: evaluation.totals,
    extras: extras.map((e) => ({ ...e })),
    prefs,
    catalog,
  }
  if (client) data.client = client
  return data
}

/** Precio fijado por ítem (id del ítem de la cotización → neto unitario y total). */
export type PinnedItemPrices = Record<string, { unitNet: number; totalNet: number }>

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
    return pinned ? { ...docItem, unitPrice: pinned.unitNet, total: pinned.totalNet } : docItem
  })
  return { ...data, items, ...(totals ? { totals: { ...totals, cost: 0, marginPct: 0 } } : {}) }
}

function safeName(design: WindowDesign): string {
  try {
    const name = designName(design)
    return typeof name === 'string' && name ? name : 'Ventana'
  } catch {
    return 'Ventana'
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
