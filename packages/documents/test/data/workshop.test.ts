import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING, evaluateQuote, toSawCsv } from '@dekopen/engine'
import type { Org, OrgSettings, Quote, WorkOrder } from '@dekopen/shared'
import {
  buildWorkshopDocInput,
  calendarDate,
  canSeeWorkshopCosts,
  cutDiffers,
  isWorkshopDocumentKind,
  redactWorkshopCosts,
  uniqueRefs,
  workshopDocumentAccess,
  workshopDocumentFileName,
  workshopTint,
  WINDOW_TINTS,
} from '../../src/data/workshop'
import { WORKSHOP_DOCUMENTS, WorkshopDocument, sampleWorkshopCatalog, workshopCostSummary } from '../../src/workshop'

// El limitador de la muestra no tiene precio y sus líneas no traen todos los herrajes: aquí se completan
// para que las ventanas tengan venta (lo que no tiene precio o herraje queda fuera del total).
const catalog = (() => {
  const c = sampleWorkshopCatalog()
  const hardware = c.items.find((i) => i.kind === 'hardware')!
  return {
    ...c,
    items: c.items.map((i) => (i.price > 0 ? i : { ...i, price: 1500 })),
    lines: c.lines.map((l) => ({ ...l, hardwareRules: [...l.hardwareRules, { id: 'prueba-herraje', openings: [], itemId: hardware.id, qty: 2 }] })),
  }
})()

function design(typology: string, lineId: string, width: number, height: number, colorId = 'blanco') {
  return createDesign(typology, { lineId, width, height, colorId, glassId: 'dvh-4124' })
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    number: 412,
    title: 'Casa Pérez · Concepción',
    status: 'workshop',
    items: [
      { id: 'i1', ref: 'V1', qty: 1, design: design('fixed_casement', 'andino-60', 1200, 1350), name: 'Living', notes: 'Manilla con llave' },
      { id: 'i2', ref: 'V2', qty: 2, design: design('sliding_2', 'andino-c70', 1500, 1100), location: 'Dormitorio' },
      { id: 'i3', ref: 'V3', qty: 1, design: design('casement', 'andino-60', 700, 1100, 'winchester') },
    ],
    extras: [{ id: 'e1', label: 'Instalación', amount: 80000 }],
    discountPct: 5,
    revision: 1,
    version: 3,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-29T12:00:00.000Z',
    client: { id: 'c1', name: 'Pedro Pérez', createdAt: '', updatedAt: '' },
    ...overrides,
  }
}

const org: Org = { id: 'o1', name: 'Ventanas del Sur', accent: '#7A4A2A', createdAt: '2026-01-01T00:00:00Z' }

const settings: Pick<OrgSettings, 'pricing' | 'cut' | 'documents'> = {
  pricing: { ...DEFAULT_PRICING },
  cut: { ...DEFAULT_CUT },
  documents: { paper: 'letter' } as OrgSettings['documents'],
}

const workOrder: WorkOrder = {
  id: 'w1',
  number: 38,
  quoteId: 'q1',
  quoteNumber: 412,
  title: 'Casa Pérez · Concepción',
  clientName: 'Pedro Pérez',
  status: 'open',
  progress: { V1: 'cut', V2: 'weld', V3: 'cut' },
  dueDate: '2026-11-15',
  notes: '  Entregar por la mañana  ',
  // 02:30 UTC del 1 de noviembre = 31 de octubre en Chile (UTC−3).
  createdAt: '2026-11-01T02:30:00.000Z',
  updatedAt: '2026-11-01T02:30:00.000Z',
}

describe('buildWorkshopDocInput', () => {
  const input = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder })

  it('calcula las ventanas, cortes, vidrios y materiales con el motor', () => {
    const { data } = input
    expect(data.windows.map((w) => w.ref)).toEqual(['V1', 'V2', 'V3'])
    expect(data.windows[1]?.qty).toBe(2)
    expect(data.windows.every((w) => w.bom.cuts.length > 0)).toBe(true)
    expect(data.optimization.totalBars).toBeGreaterThan(0)
    expect(data.optimization.groups.length).toBeGreaterThan(0)
    expect(data.glass.length).toBeGreaterThan(0)
    expect(data.materials.some((m) => m.group === 'profile')).toBe(true)
    expect(data.cut.barLength).toBe(5800)
  })

  it('arma la cabecera con números humanos, cliente y fechas de Chile', () => {
    const { data } = input
    expect(data.org).toEqual({ name: 'Ventanas del Sur', accent: '#7A4A2A' })
    expect(data.quote).toEqual({ number: 412, title: 'Casa Pérez · Concepción', clientName: 'Pedro Pérez' })
    expect(data.workOrder).toEqual({ number: 38, date: '2026-10-31', dueDate: '2026-11-15', notes: 'Entregar por la mañana' })
    expect(data.windowNotes).toEqual({ V1: 'Manilla con llave' })
    expect(data.catalog).toBe(catalog)
    expect(data.windows[0]?.name).toBe('Living')
    expect(data.windows[1]?.location).toBe('Dormitorio')
  })

  it('usa el papel y el acento de los ajustes de documentos', () => {
    const a4 = buildWorkshopDocInput({
      quote: makeQuote(),
      org,
      catalog,
      settings: { ...settings, documents: { paper: 'a4', accent: '#2F7D4F' } },
      workOrder,
    })
    expect(a4.paper).toBe('a4')
    expect(a4.data.org.accent).toBe('#2F7D4F')
    expect(input.paper).toBe('letter')
    // Un acento mal formado no llega al documento.
    const bad = buildWorkshopDocInput({ quote: makeQuote(), org: { ...org, accent: 'rojo' }, catalog, settings: {}, workOrder })
    expect(bad.data.org.accent).toBeUndefined()
  })

  it('el cliente explícito manda; sin cliente usa el nombre guardado en la OT', () => {
    const explicit = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, client: { name: 'Ana Soto' } })
    expect(explicit.data.quote.clientName).toBe('Ana Soto')
    const fromOrder = buildWorkshopDocInput({ quote: makeQuote({ client: undefined }), org, catalog, settings, workOrder })
    expect(fromOrder.data.quote.clientName).toBe('Pedro Pérez')
    const none = buildWorkshopDocInput({
      quote: makeQuote({ client: undefined }),
      org,
      catalog,
      settings,
      workOrder: { ...workOrder, clientName: undefined },
    })
    expect(none.data.quote.clientName).toBeUndefined()
  })

  it('aplica ajustes de corte al vuelo sin tocar los del taller', () => {
    const longer = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, cut: { barLength: 6500 } })
    expect(longer.data.cut.barLength).toBe(6500)
    expect(settings.cut.barLength).toBe(5800)
    const bars = longer.data.optimization.groups.flatMap((g) => g.bars)
    expect(bars.every((b) => b.barLength === 6500 || b.fromOffcut)).toBe(true)
    // Barras más largas nunca piden más barras.
    expect(longer.data.optimization.totalBars).toBeLessThanOrEqual(input.data.optimization.totalBars)
    // Valores ilegibles en el ajuste se ignoran.
    const ignored = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, cut: { barLength: Number.NaN } })
    expect(ignored.data.cut.barLength).toBe(5800)
  })

  it('la simulación de disco manda sobre el de la marca', () => {
    // La marca del ejemplo tiene disco de 4 mm: sin simular, un disco de 0 del taller no cambia nada.
    const brandKerf = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings: { ...settings, cut: { ...DEFAULT_CUT, kerf: 0 } }, workOrder })
    const kerfLoss = (d: typeof input) => d.data.optimization.groups.flatMap((g) => g.bars).reduce((s, b) => s + b.kerfLoss, 0)
    expect(kerfLoss(brandKerf)).toBe(kerfLoss(input))
    const thin = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, cut: { kerf: 0 } })
    expect(kerfLoss(thin)).toBe(0)
    expect(thin.data.cut.kerf).toBe(0)
    // El catálogo original no se toca.
    expect(catalog.brandSettings.every((b) => b.kerf === 4)).toBe(true)
    expect(thin.data.catalog).toBe(catalog)
  })

  it('el despunte reduce lo útil de cada barra', () => {
    const trimmed = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, cut: { trimStart: 20, trimEnd: 20 } })
    expect(trimmed.data.cut.trimStart).toBe(20)
    for (const bar of trimmed.data.optimization.groups.flatMap((g) => g.bars)) {
      const first = bar.cuts[0]
      if (first) expect(first.offset).toBeGreaterThanOrEqual(20)
    }
  })

  it('respeta el precio propio de la cotización', () => {
    const cheap = buildWorkshopDocInput({ quote: makeQuote({ pricing: { marginPct: 10 } }), org, catalog, settings, workOrder })
    const normal = input.data.costs.perWindow[0]
    const lower = cheap.data.costs.perWindow[0]
    expect(normal && lower).toBeTruthy()
    expect(lower!.unitPrice).toBeLessThan(normal!.unitPrice)
    expect(lower!.unitCost).toBe(normal!.unitCost)
  })

  it('no fabrica ítems con cantidad 0 y corrige refs vacías o repetidas', () => {
    const quote = makeQuote({
      items: [
        { id: 'a', ref: 'V1', qty: 1, design: design('fixed', 'andino-60', 800, 800) },
        { id: 'b', ref: 'V1', qty: 1, design: design('fixed', 'andino-60', 900, 900) },
        { id: 'c', ref: '  ', qty: 1, design: design('fixed', 'andino-60', 600, 600) },
        { id: 'd', ref: 'V9', qty: 0, design: design('fixed', 'andino-60', 600, 600) },
      ],
    })
    const out = buildWorkshopDocInput({ quote, org, catalog, settings, workOrder })
    expect(out.data.windows.map((w) => w.ref)).toEqual(['V1', 'V1-2', 'V3'])
  })

  it('a producción va solo lo elegido: ni el opcional sin marcar ni la alternativa descartada', () => {
    const quote = makeQuote({
      items: [
        { id: 'i1', ref: 'V1', qty: 1, design: design('casement', 'andino-60', 700, 1100) },
        { id: 'i2', ref: 'V2', qty: 1, design: design('casement', 'andino-60', 800, 1100), role: 'alternative', altGroup: 'Dormitorio', included: false },
        { id: 'i3', ref: 'V3', qty: 1, design: design('casement', 'andino-60', 900, 1100), role: 'alternative', altGroup: 'Dormitorio', included: true },
        { id: 'i4', ref: 'V4', qty: 1, design: design('casement', 'andino-60', 600, 1100), role: 'optional', included: false },
        { id: 'i5', ref: 'V5', qty: 1, design: design('casement', 'andino-60', 600, 900), role: 'optional', included: true },
      ],
    })
    const { data } = buildWorkshopDocInput({ quote, org, catalog, settings, workOrder })
    expect(data.windows.map((w) => w.ref)).toEqual(['V1', 'V3', 'V5'])
  })

  it('una cotización vacía no se cae', () => {
    const out = buildWorkshopDocInput({ quote: makeQuote({ items: [] }), org, catalog, settings, workOrder })
    expect(out.data.windows).toEqual([])
    expect(out.data.optimization.totalBars).toBe(0)
    const html = renderToStaticMarkup(createElement(WorkshopDocument, { kind: 'cuts', ...out }))
    expect(html).toContain('No hay cortes para optimizar')
  })

  it('renderiza los 9 documentos sin NaN ni undefined', () => {
    for (const doc of WORKSHOP_DOCUMENTS) {
      const html = renderToStaticMarkup(createElement(WorkshopDocument, { kind: doc.kind, ...input }))
      expect(html).toContain(`data-document="${doc.kind}"`)
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('undefined')
    }
    const ot = renderToStaticMarkup(createElement(WorkshopDocument, { kind: 'work-order', ...input }))
    expect(ot).toContain('OT N° 38')
    expect(ot).toContain('Manilla con llave')
  })

  it('el CSV de sierra sale de la misma optimización', () => {
    const csv = toSawCsv(input.data.optimization, catalog.colors)
    const rows = csv.trim().split('\r\n')
    expect(rows.length - 1).toBe(input.data.optimization.totalPieces)
  })

  it('trae el IVA de la organización y la venta de la cotización igual que el editor', () => {
    const quote = makeQuote()
    const custom = buildWorkshopDocInput({ quote, org, catalog, settings: { ...settings, pricing: { ...settings.pricing, ivaPct: 12 } }, workOrder })
    expect(custom.data.ivaPct).toBe(12)
    expect(input.data.ivaPct).toBe(19)
    const sale = input.data.sale!
    expect(sale).toBeDefined()
    // Mismo cálculo que el pie del editor (evaluateQuote): venta tras el descuento, sin extras.
    const items = quote.items.map((i) => ({ id: i.id, ref: i.ref, qty: i.qty, design: i.design }))
    const totals = evaluateQuote({ items, extras: quote.extras ?? [], discountPct: quote.discountPct ?? 0 }, catalog, settings.pricing).totals
    expect(sale.subtotal).toBe(totals.subtotal)
    expect(sale.discount).toBe(totals.discount)
    expect(sale.extras).toBe(totals.extras)
    expect(sale.cost).toBe(totals.cost)
    expect(sale.marginPct).toBe(totals.marginPct)
    // Costo directo = materiales prorrateados + merma + mano de obra (+ instalación).
    const materials = Object.values(sale.materials).reduce((a, b) => a + b, 0)
    expect(Math.abs(materials + sale.waste + sale.labor + sale.install - sale.cost)).toBeLessThanOrEqual(5)
    const sum = workshopCostSummary(input.data)
    expect(sum.sold).toBe(totals.subtotal - totals.discount)
    expect(sum.margin).toBe(totals.marginPct)
    // La compra real (barras completas y envases) nunca se llama «costo directo» ni se mezcla con él.
    expect(sum.purchase).toBe(input.data.costs.total)
    expect(sum.realCost).toBe(sum.purchase + sale.labor + sale.install)
  })

  it('redactCosts quita costos y precios', () => {
    const hidden = buildWorkshopDocInput({ quote: makeQuote(), org, catalog, settings, workOrder, redactCosts: true })
    expect(hidden.data.sale).toBeUndefined()
    expect(hidden.data.costs.total).toBe(0)
    expect(hidden.data.costs.perWindow.every((w) => w.unitCost === 0 && w.unitPrice === 0)).toBe(true)
    expect(hidden.data.materials.every((m) => m.unitCost === undefined && m.total === undefined)).toBe(true)
    expect(hidden.data.purchaseOrders.every((p) => p.total === 0)).toBe(true)
    // La cantidad a comprar se mantiene.
    expect(hidden.data.materials.map((m) => m.qty)).toEqual(input.data.materials.map((m) => m.qty))
    expect(redactWorkshopCosts(input.data).optimization).toBe(input.data.optimization)
  })
})

describe('utilidades de taller', () => {
  it('calendarDate usa la fecha de Chile y respeta fechas sin hora', () => {
    expect(calendarDate('2026-11-01T02:30:00.000Z')).toBe('2026-10-31')
    expect(calendarDate('2026-11-01T15:00:00.000Z')).toBe('2026-11-01')
    expect(calendarDate('2026-11-20')).toBe('2026-11-20')
    expect(calendarDate(undefined, 'America/Santiago', new Date('2026-06-10T12:00:00Z'))).toBe('2026-06-10')
    expect(calendarDate('ilegible', 'America/Santiago', new Date('2026-06-10T12:00:00Z'))).toBe('2026-06-10')
  })

  it('uniqueRefs', () => {
    expect(uniqueRefs(['V1', 'v1', '', undefined, 'V2'])).toEqual(['V1', 'v1-2', 'V3', 'V4', 'V2'])
  })

  it('cutDiffers detecta cambios reales', () => {
    expect(cutDiffers(DEFAULT_CUT, null)).toBe(false)
    expect(cutDiffers(DEFAULT_CUT, { kerf: 4 })).toBe(false)
    expect(cutDiffers(DEFAULT_CUT, { kerf: 3 })).toBe(true)
    expect(cutDiffers(DEFAULT_CUT, { barLength: 6000 })).toBe(true)
  })

  it('tintes por ventana iguales a los del papel', () => {
    expect(workshopTint(0)).toBe(WINDOW_TINTS[0])
    expect(workshopTint(WINDOW_TINTS.length)).toBe(WINDOW_TINTS[0])
    expect(workshopTint(-1)).toBe(WINDOW_TINTS[WINDOW_TINTS.length - 1])
  })

  it('acceso por plan y rol', () => {
    const solo = { role: 'owner' as const, features: ['purchasing', 'cnc'] as const }
    expect(workshopDocumentAccess('costs', { ...solo, features: [...solo.features] })).toEqual({ visible: true })
    // Sin la función de roles, todos ven todo.
    expect(workshopDocumentAccess('costs', { role: 'estimator', features: [] }).visible).toBe(true)
    // Taller (sin compras): la orden de compra se ve con el plan explicado.
    expect(workshopDocumentAccess('purchase', { role: 'owner', features: [] })).toEqual({ visible: true, locked: 'purchasing' })
    // Con roles.
    const empresa = ['roles', 'purchasing', 'cnc', 'stations'] as const
    expect(workshopDocumentAccess('costs', { role: 'workshop', features: [...empresa] }).visible).toBe(false)
    expect(workshopDocumentAccess('materials-costs', { role: 'workshop', features: [...empresa] }).visible).toBe(true)
    expect(workshopDocumentAccess('materials-costs', { role: 'operator', features: [...empresa] }).visible).toBe(false)
    expect(workshopDocumentAccess('cuts', { role: 'installer', features: [...empresa] }).visible).toBe(true)
    expect(canSeeWorkshopCosts({ role: 'estimator', features: [...empresa] })).toBe(false)
    expect(canSeeWorkshopCosts({ role: 'estimator', features: [] })).toBe(true)
  })

  it('nombres de archivo y tipos', () => {
    expect(workshopDocumentFileName('cuts', 38)).toBe('OT-38-Cortes.pdf')
    expect(workshopDocumentFileName('labels', 7, 'csv')).toBe('OT-7-Etiquetas.csv')
    expect(isWorkshopDocumentKind('glass')).toBe(true)
    expect(isWorkshopDocumentKind('nada')).toBe(false)
  })
})
