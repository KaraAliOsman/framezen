import type { Catalog, Layout, QuoteExtra, QuoteTotals, TypologyId, WindowDesign } from '@framezen/engine'
import type { DocumentPrefs } from '@framezen/shared'
import type { DocOrg } from '../../base/types'
import { addDays } from '../../base/format'
import { TYPOLOGY_ICON_LABELS } from '../../drawing/TypologyIcon'
import type { CatalogDocData, QuoteDocData, QuoteDocItem } from '../types'
import { SAMPLE_CATALOG, SAMPLE_CLIENT, SAMPLE_ORG, SAMPLE_PREFS } from './catalog'
import { SLIDING_TYPOLOGIES, sampleDesign } from './designs'
import { fixtureLayout } from './fixtureLayout'

export { SAMPLE_CATALOG, SAMPLE_CLIENT, SAMPLE_ORG, SAMPLE_PREFS } from './catalog'
export { sampleDesign, sampleTree } from './designs'
export { fixtureLayout, type FixtureLayoutOptions } from './fixtureLayout'

export type LayoutFn = (design: WindowDesign, catalog: Catalog) => Layout

interface SampleRow {
  typologyId: TypologyId
  width: number
  height: number
  qty: number
  colorId: string
  colorInId?: string
  glassId?: string
  name?: string
  location: string
  notes?: string
}

const ROWS: SampleRow[] = [
  { typologyId: 'sliding_2', width: 2000, height: 1400, qty: 1, colorId: 'walnut', colorInId: 'white', name: 'Ventanal del living', location: 'Living' },
  { typologyId: 'tilt_turn', width: 700, height: 1000, qty: 2, colorId: 'white', location: 'Cocina' },
  { typologyId: 'fixed_casement', width: 1500, height: 1200, qty: 1, colorId: 'white', location: 'Dormitorio principal' },
  { typologyId: 'awning', width: 600, height: 500, qty: 2, colorId: 'white', glassId: 'lam-33', location: 'Baños' },
  { typologyId: 'door_transom', width: 900, height: 2400, qty: 1, colorId: 'anthracite', name: 'Puerta de acceso', location: 'Acceso', notes: 'Cerradura multipunto con llave por ambos lados.' },
  { typologyId: 'casement_double', width: 1200, height: 1300, qty: 1, colorId: 'golden-oak', location: 'Escritorio' },
  { typologyId: 'fixed_3', width: 2400, height: 900, qty: 1, colorId: 'anthracite', location: 'Comedor' },
  { typologyId: 'sliding_2_fixed', width: 1600, height: 1100, qty: 1, colorId: 'white', location: 'Dormitorio 2' },
  { typologyId: 'casement_transom', width: 800, height: 1600, qty: 1, colorId: 'white', location: 'Pasillo' },
  { typologyId: 'fixed_awning_bottom', width: 1000, height: 1300, qty: 2, colorId: 'white', location: 'Dormitorio 3' },
  { typologyId: 'door', width: 900, height: 2100, qty: 1, colorId: 'white', location: 'Logia' },
  { typologyId: 'sliding_4', width: 3200, height: 2100, qty: 1, colorId: 'anthracite', name: 'Puerta corredera a la terraza', location: 'Terraza' },
]

const PRICE_PER_M2: Partial<Record<TypologyId, number>> = {
  fixed: 118000,
  fixed_3: 124000,
  sliding_2: 168000,
  sliding_2_fixed: 158000,
  sliding_4: 176000,
  tilt_turn: 238000,
  awning: 226000,
  casement_double: 232000,
  fixed_casement: 192000,
  casement_transom: 205000,
  fixed_awning_bottom: 186000,
  door: 262000,
  door_transom: 248000,
}

const COLOR_NAME = (catalog: Catalog, id: string) => catalog.colors.find((c) => c.id === id)?.name ?? id
const GLASS_NAME = (catalog: Catalog, id: string) => catalog.glass.find((g) => g.id === id)?.name ?? id
const roundUp = (n: number, to = 100) => Math.ceil(n / to) * to

export interface SampleQuoteOptions {
  /** Cantidad de ventanas (se repiten variantes; 24 para ver la plantilla compacta). */
  items?: number
  /** Geometría real del motor (computeLayout); por defecto, la aproximada de muestra. */
  layout?: LayoutFn
  prefs?: Partial<DocumentPrefs>
  org?: Partial<DocOrg>
  catalog?: Catalog
  date?: string
  discountPct?: number
  extras?: QuoteExtra[]
}

/** Cotización de ejemplo completa (galería de plantillas, landing y pruebas). */
export function buildSampleQuoteDoc(options: SampleQuoteOptions = {}): QuoteDocData {
  const catalog = options.catalog ?? SAMPLE_CATALOG
  const toLayout: LayoutFn = options.layout ?? ((design) => fixtureLayout(design))
  const count = Math.max(1, options.items ?? 6)
  const date = options.date ?? '2026-10-31'
  const prefs: DocumentPrefs = { ...SAMPLE_PREFS, ...options.prefs }
  const items: QuoteDocItem[] = Array.from({ length: count }, (_, i) => {
    const row = ROWS[i % ROWS.length]
    const lap = Math.floor(i / ROWS.length)
    const sliding = SLIDING_TYPOLOGIES.includes(row.typologyId)
    const line = catalog.lines.find((l) => l.kind === (sliding ? 'sliding' : 'casement')) ?? catalog.lines[0]
    const glassId = row.glassId ?? catalog.glass[0]?.id ?? 'glass'
    const width = row.width - lap * 50
    const height = row.height
    const design = sampleDesign({ typologyId: row.typologyId, width, height, lineId: line?.id ?? 'line', colorId: row.colorId, colorInId: row.colorInId, glassId })
    const area = Math.round((width * height) / 10000) / 100
    const unitPrice = roundUp(area * (PRICE_PER_M2[row.typologyId] ?? 190000) + 24000)
    const colorName = row.colorInId && row.colorInId !== row.colorId ? `${COLOR_NAME(catalog, row.colorId)} exterior, ${COLOR_NAME(catalog, row.colorInId).toLowerCase()} interior` : COLOR_NAME(catalog, row.colorId)
    return {
      ref: `V${i + 1}`,
      name: row.name,
      location: lap ? `${row.location} ${lap + 1}` : row.location,
      qty: row.qty,
      description: TYPOLOGY_ICON_LABELS[row.typologyId],
      lineName: line ? `PVC ${line.name}` : 'PVC',
      colorName,
      glassName: GLASS_NAME(catalog, glassId),
      width,
      height,
      area,
      unitPrice,
      total: unitPrice * row.qty,
      layout: toLayout(design, catalog),
      design,
      notes: row.notes,
    }
  })
  const extras: QuoteExtra[] = options.extras ?? [
    { id: 'install', label: 'Instalación y sellado', amount: 180000 },
    { id: 'removal', label: 'Retiro de ventanas antiguas', amount: 45000 },
  ]
  const subtotal = items.reduce((acc, it) => acc + it.total, 0)
  const discountPct = options.discountPct ?? 5
  const discount = Math.round((subtotal * discountPct) / 100)
  const extrasSum = extras.reduce((acc, e) => acc + e.amount, 0)
  const net = subtotal - discount + extrasSum
  const iva = Math.round(net * 0.19)
  const totals: QuoteTotals = {
    subtotal,
    discountPct,
    discount,
    extras: extrasSum,
    net,
    iva,
    total: net + iva,
    area: Math.round(items.reduce((acc, it) => acc + it.area * it.qty, 0) * 100) / 100,
    units: items.reduce((acc, it) => acc + it.qty, 0),
    cost: Math.round(subtotal * 0.6),
    marginPct: 40,
  }
  return {
    org: { ...SAMPLE_ORG, ...options.org },
    client: SAMPLE_CLIENT,
    quote: {
      number: 412,
      title: 'Casa Muñoz · Puerto Varas',
      revision: 1,
      date,
      validUntil: addDays(date, prefs.validityDays || 15),
      portalUrl: 'https://framezen.cl/c/demo',
    },
    items,
    totals,
    extras,
    prefs,
    catalog,
  }
}

export const SAMPLE_QUOTE_DOC: QuoteDocData = buildSampleQuoteDoc()

const CATALOG_SIZES: Partial<Record<TypologyId, [number, number]>> = {
  fixed: [1000, 1000],
  casement: [700, 1100],
  tilt_turn: [700, 1100],
  awning: [900, 600],
  casement_double: [1200, 1200],
  fixed_casement: [1400, 1100],
  casement_transom: [800, 1500],
  door: [900, 2100],
  door_transom: [900, 2400],
  sliding_2: [1600, 1200],
  sliding_2_fixed: [1600, 1200],
  sliding_3: [2400, 1200],
  sliding_4: [3000, 2000],
}

export interface SampleCatalogOptions {
  layout?: LayoutFn
  prefs?: Partial<DocumentPrefs>
  org?: Partial<DocOrg>
  catalog?: Catalog
}

/** Catálogo de productos de ejemplo (líneas del catálogo de muestra con sus tipologías). */
export function buildSampleCatalogDoc(options: SampleCatalogOptions = {}): CatalogDocData {
  const catalog = options.catalog ?? SAMPLE_CATALOG
  const toLayout: LayoutFn = options.layout ?? ((design) => fixtureLayout(design))
  const entries = catalog.lines.map((line) => {
    const brand = catalog.brands.find((b) => b.id === line.brandId) ?? { id: line.brandId, name: 'Perfiles', kind: 'profiles' as const }
    const typologies = (line.typologyIds as TypologyId[]).map((typologyId, i) => {
      const [width, height] = CATALOG_SIZES[typologyId] ?? [1000, 1000]
      const colorId = line.colorIds[0] ?? catalog.colors[0]?.id ?? 'white'
      const design = sampleDesign({ typologyId, width, height, lineId: line.id, colorId, glassId: catalog.glass[0]?.id ?? 'glass' })
      return {
        typologyId,
        name: TYPOLOGY_ICON_LABELS[typologyId],
        layout: toLayout(design, catalog),
        design,
        fromPricePerM2: roundUp((PRICE_PER_M2[typologyId] ?? 190000) * (i % 3 === 2 ? 1.04 : 1), 1000),
      }
    })
    return { line, brand, typologies }
  })
  return {
    org: { ...SAMPLE_ORG, ...options.org },
    prefs: { ...SAMPLE_PREFS, ...options.prefs },
    catalog,
    entries,
    title: 'Ventanas y puertas de PVC',
    date: '2026-10-31',
  }
}

export const SAMPLE_CATALOG_DOC: CatalogDocData = buildSampleCatalogDoc()
