/**
 * Datos para las plantillas de `@framezen/documents` armados con el motor real: la última
 * cotización del taller, una de ejemplo con sus propias líneas y precios, y el catálogo de
 * productos con «desde $X/m²». Ninguna cifra se inventa aquí: todas salen del motor.
 *
 * La cotización usa `buildQuoteDocData` y el catálogo `buildCatalogDocData`: los mismos
 * constructores que el PDF del servidor, para que lo que se ve aquí sea exactamente lo que se
 * descarga.
 */
import { createDesign, type Catalog, type CutSettings, type Id, type Line, type PricingSettings, type QuoteExtra, type TypologyId, type WindowDesign } from '@framezen/engine'
import { buildCatalogDocData, buildQuoteDocData, type CatalogDocData, type DocClient, type DocOrg, type QuoteDocData } from '@framezen/documents'
import type { DocumentPrefs, Org, Quote, QuoteItem } from '@framezen/shared'

export interface DocContext {
  catalog: Catalog
  pricing: Partial<PricingSettings>
  cut?: Partial<CutSettings>
  prefs: DocumentPrefs
  org: DocOrg
  defaults?: { lineId?: Id; colorId?: Id; glassId?: Id }
}

export function toDocOrg(org: Partial<Org> & { name: string }): DocOrg {
  return {
    name: org.name,
    legalName: org.legalName,
    rut: org.rut,
    address: org.address,
    city: org.city,
    phone: org.phone,
    email: org.email,
    website: org.website,
    logo: org.logo,
    accent: org.accent,
  }
}

export function colorLabel(catalog: Catalog, design: Pick<WindowDesign, 'colorId' | 'colorInId'>): string {
  const name = (id: Id) => catalog.colors.find((c) => c.id === id)?.name ?? id
  if (design.colorInId && design.colorInId !== design.colorId) return `${name(design.colorId)} exterior, ${name(design.colorInId).toLowerCase()} interior`
  return name(design.colorId)
}

/** Documento de una cotización real del taller (con los textos propios de esa cotización). */
export function quoteDocFromQuote(quote: Quote, ctx: DocContext): QuoteDocData {
  return buildQuoteDocData({
    quote,
    org: ctx.org,
    catalog: ctx.catalog,
    settings: { pricing: ctx.pricing, cut: ctx.cut, documents: ctx.prefs },
  })
}

const COMPLETENESS_RANK: Record<NonNullable<Line['completeness']>, number> = { verified: 0, complete: 1, partial: 2 }

function bestLine(catalog: Catalog, kind: Line['kind'], preferred?: Id): Line | undefined {
  const pref = catalog.lines.find((l) => l.id === preferred && l.kind === kind)
  if (pref) return pref
  return [...catalog.lines]
    .filter((l) => l.kind === kind)
    .sort((a, b) => COMPLETENESS_RANK[a.completeness ?? 'partial'] - COMPLETENESS_RANK[b.completeness ?? 'partial'] || b.typologyIds.length - a.typologyIds.length)[0]
}

/** Vidrio por defecto del taller; si no, el primero del catálogo (misma regla que el PDF). */
function defaultGlass(catalog: Catalog, preferred?: Id): Id | undefined {
  if (preferred && catalog.glass.some((g) => g.id === preferred)) return preferred
  return catalog.glass[0]?.id
}

interface SampleRow {
  typologyId: TypologyId
  fallback?: TypologyId
  width: number
  height: number
  qty: number
  kind: Line['kind']
  location: string
  name?: string
  wood?: boolean
}

const SAMPLE_ROWS: SampleRow[] = [
  { typologyId: 'sliding_2', width: 2000, height: 1400, qty: 1, kind: 'sliding', location: 'Living', name: 'Ventanal del living', wood: true },
  { typologyId: 'tilt_turn', fallback: 'casement', width: 700, height: 1000, qty: 2, kind: 'casement', location: 'Cocina' },
  { typologyId: 'fixed_casement', fallback: 'casement', width: 1500, height: 1200, qty: 1, kind: 'casement', location: 'Dormitorio principal' },
  { typologyId: 'awning', fallback: 'fixed', width: 600, height: 500, qty: 2, kind: 'casement', location: 'Baños' },
  { typologyId: 'door', fallback: 'casement', width: 900, height: 2100, qty: 1, kind: 'casement', location: 'Acceso', name: 'Puerta de acceso' },
]

/** Cliente ficticio de la muestra. RUT de prueba conocido (12.345.678-5), nunca uno que pueda ser de una persona real. */
export const SAMPLE_DOC_CLIENT: DocClient = {
  name: 'Carolina Muñoz',
  rut: '12.345.678-5',
  email: 'carolina.munoz@correo.cl',
  phone: '+56 9 8765 4321',
  address: 'Los Arrayanes 220',
  city: 'Puerto Varas',
}

/** Ítems de una cotización de ejemplo con las líneas, colores y vidrio del propio taller. */
export function sampleQuoteItems(ctx: Pick<DocContext, 'catalog' | 'defaults'>, count = SAMPLE_ROWS.length): QuoteItem[] {
  const { catalog } = ctx
  const casement = bestLine(catalog, 'casement', ctx.defaults?.lineId)
  const sliding = bestLine(catalog, 'sliding', ctx.defaults?.lineId)
  const glassId = defaultGlass(catalog, ctx.defaults?.glassId)
  if ((!casement && !sliding) || !glassId) return []
  const items: QuoteItem[] = []
  for (const row of SAMPLE_ROWS.slice(0, Math.max(1, count))) {
    const line = (row.kind === 'sliding' ? sliding : casement) ?? casement ?? sliding!
    const own = new Set(line.typologyIds)
    const typologyId = line.kind !== row.kind ? (line.kind === 'sliding' ? 'sliding_2' : 'tilt_turn') : own.has(row.typologyId) || !row.fallback ? row.typologyId : row.fallback
    const base = ctx.defaults?.colorId && line.colorIds.includes(ctx.defaults.colorId) ? ctx.defaults.colorId : (line.colorIds[0] ?? catalog.colors[0]?.id ?? 'blanco')
    const wood = row.wood ? line.colorIds.find((c) => /nogal|roble|winchester/i.test(c)) : undefined
    try {
      const design = createDesign(typologyId, { lineId: line.id, width: row.width, height: row.height, colorId: wood ?? base, glassId })
      items.push({
        id: `ej-${items.length + 1}`,
        ref: `V${items.length + 1}`,
        name: row.name,
        location: row.location,
        qty: row.qty,
        design: wood && wood !== base ? { ...design, colorInId: base } : design,
      })
    } catch {
      // Una tipología que la línea no puede dibujar no rompe el ejemplo.
    }
  }
  return items
}

/**
 * Cotización de ejemplo con las líneas, colores, vidrios y precios del propio taller.
 * Devuelve null si el catálogo no tiene líneas (sin marcas activas).
 */
export function sampleQuoteDoc(ctx: DocContext, options: { items?: number; date?: string } = {}): QuoteDocData | null {
  const items = sampleQuoteItems(ctx, options.items)
  if (!items.length) return null
  const extras: QuoteExtra[] = [{ id: 'ej-instalacion', label: 'Instalación y sellado', amount: 180_000 }]
  const now = options.date ?? new Date().toISOString().slice(0, 10)
  const quote: Quote = {
    id: 'ejemplo',
    number: 412,
    title: 'Casa Muñoz · Puerto Varas',
    status: 'sent',
    items,
    extras,
    discountPct: 0,
    revision: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
  return buildQuoteDocData({
    quote,
    org: ctx.org,
    catalog: ctx.catalog,
    client: SAMPLE_DOC_CLIENT,
    date: now,
    settings: { pricing: ctx.pricing, cut: ctx.cut, documents: ctx.prefs },
  })
}

// ── Catálogo de productos (el mismo constructor que GET /api/catalog/pdf) ──────

/** «Desde $X/m²» del motor (el mismo cálculo del PDF): reexportado desde @framezen/documents. */
export { CATALOG_DOC_MAX_TYPOLOGIES as CATALOG_MAX_TYPOLOGIES, fromPricePerM2 } from '@framezen/documents'

export interface CatalogDocOptions {
  /** Líneas a incluir (por defecto, todas las activas). */
  lineIds?: readonly Id[]
  /** Máximo de tipologías por línea (en el orden que declara la línea). */
  maxTypologies?: number
  title?: string
  date?: string
}

/**
 * Catálogo de productos con las líneas activas, sus tipologías dibujadas y «desde $X/m²».
 * Usa `buildCatalogDocData`, el mismo constructor del PDF del servidor: la vista previa calza
 * exacto con lo que se descarga.
 */
export function catalogDocFromCatalog(ctx: DocContext, options: CatalogDocOptions = {}): CatalogDocData {
  return buildCatalogDocData({
    org: ctx.org,
    catalog: ctx.catalog,
    settings: { pricing: ctx.pricing, cut: ctx.cut, documents: ctx.prefs, defaults: ctx.defaults },
    ...(options.lineIds ? { lineIds: options.lineIds } : {}),
    ...(options.maxTypologies ? { maxTypologies: options.maxTypologies } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.date ? { date: options.date } : {}),
  })
}
