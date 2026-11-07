import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createDesign, DEFAULT_PRICING, evaluateQuote, setColor, setGlass, type WindowDesign } from '@dekopen/engine'
import type { Client, Org, Quote, QuoteItem } from '@dekopen/shared'
import {
  buildQuoteDocData,
  mergeQuoteDocPrefs,
  parseQuoteValidityDays,
  quoteDocColor,
  quoteDocDate,
  quoteDocGlass,
  quoteDocLine,
  QUOTE_DOC_FALLBACK_PREFS,
} from '../../src/data/quote'
import { describeOpening, QuoteDocument, SAMPLE_CATALOG, SAMPLE_PREFS } from '../../src/sales'
import { formatClp } from '../../src/base'
import { sampleWorkshopCatalog } from '../../src/workshop/sample'

const catalog = SAMPLE_CATALOG
const casement = (typology: string, width: number, height: number, colorId = 'white'): WindowDesign =>
  createDesign(typology, { lineId: 'sample-c60', width, height, colorId, glassId: 'dvh-4-12-4' })
const sliding = (width: number, height: number): WindowDesign =>
  createDesign('sliding_2', { lineId: 'sample-s70', width, height, colorId: 'walnut', glassId: 'dvh-4-12-4' })

const org: Org = {
  id: 'org1',
  name: 'Ventanas del Sur',
  legalName: 'Ventanas del Sur SpA',
  rut: '76.123.456-7',
  city: 'Puerto Montt',
  phone: '+56 9 5555 1234',
  accent: '#2F7D4F',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const client: Client = {
  id: 'c1',
  name: '  Carolina Muñoz ',
  rut: '12.345.678-5',
  email: 'carolina@example.cl',
  phone: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  notes: 'Prefiere que la llamen en la tarde',
}

function item(id: string, ref: string, design: WindowDesign, extra: Partial<QuoteItem> = {}): QuoteItem {
  return { id, ref, qty: 1, design, ...extra }
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    number: 412,
    title: 'Casa Muñoz · Puerto Varas',
    status: 'draft',
    items: [
      item('a', 'V1', sliding(2000, 1400), { name: 'Ventanal del living', location: 'Living', notes: 'Con mosquitero' }),
      item('b', 'V2', casement('tilt_turn', 700, 1000), { qty: 2, location: 'Cocina' }),
      item('c', 'V3', casement('fixed', 1200, 900), { manualUnitPrice: 150000 }),
    ],
    extras: [
      { id: 'x1', label: 'Instalación', amount: 180000 },
      { id: 'x2', label: 'Retiro', amount: 40000, hidden: true },
    ],
    discountPct: 5,
    notes: 'Nota interna: cliente regatea',
    revision: 0,
    version: 3,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-31T02:30:00.000Z', // 30-10 en Chile (UTC−3)
    ...overrides,
  }
}

const settings = { pricing: DEFAULT_PRICING, documents: SAMPLE_PREFS }

describe('buildQuoteDocData', () => {
  it('usa las cifras del motor para cada ventana y para los totales', () => {
    const q = quote()
    const data = buildQuoteDocData({ quote: q, org, catalog, settings })
    const evaluation = evaluateQuote(q, catalog, DEFAULT_PRICING)
    expect(data.totals).toEqual(evaluation.totals)
    expect(data.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3'])
    data.items.forEach((docItem, index) => {
      const price = evaluation.items[index].price
      expect(docItem.unitPrice).toBe(price.unitNet)
      expect(docItem.total).toBe(price.totalNet)
    })
    expect(data.items[1].qty).toBe(2)
    expect(data.items[1].total).toBe(data.items[1].unitPrice * 2)
    // Precio manual: se respeta y se marca.
    expect(data.items[2].unitPrice).toBe(150000)
    expect(data.items[2].manual).toBe(true)
    expect(data.items[0].manual).toBeUndefined()
    // Totales con descuento, extras e IVA del motor.
    expect(data.totals.discountPct).toBe(5)
    expect(data.totals.extras).toBe(220000)
    expect(data.totals.total).toBe(data.totals.net + data.totals.iva)
  })

  it('describe cada ventana en palabras de cliente', () => {
    const data = buildQuoteDocData({ quote: quote(), org, catalog, settings })
    const [v1, v2, v3] = data.items
    expect(v1.description).toBe('Corredera 2 hojas')
    expect(v1.name).toBe('Ventanal del living')
    expect(v1.location).toBe('Living')
    expect(v1.notes).toBe('Con mosquitero')
    expect(v1.lineName).toBe('PVC Corredera 70')
    expect(v1.colorName).toBe('Nogal')
    expect(v1.glassName).toBe('Termopanel 4-12-4')
    expect(v1.width).toBe(2000)
    expect(v1.height).toBe(1400)
    expect(v1.area).toBeCloseTo(2.8, 2)
    expect(v1.layout.width).toBe(2000)
    expect(v1.layout.sliding.length).toBe(2)
    expect(v2.description).toBe('Oscilobatiente')
    expect(v3.description).toBe('Paño fijo')
    expect(v3.layout.panes.length).toBeGreaterThan(0)
  })

  it('combina las preferencias de la organización con los textos de la cotización', () => {
    const q = quote({
      documentOverrides: { quoteTemplate: 'editorial', intro: 'Hola Carolina, aquí va lo conversado.', validityDays: '30' as unknown as number, notes: 'Incluye visita técnica.' } as unknown as Quote['documentOverrides'],
    })
    const data = buildQuoteDocData({ quote: q, org, catalog, settings })
    expect(data.prefs.quoteTemplate).toBe('editorial')
    expect(data.prefs.intro).toBe('Hola Carolina, aquí va lo conversado.')
    expect(data.prefs.validityDays).toBe(30)
    // Lo que la cotización no toca viene de la organización.
    expect(data.prefs.conditions).toBe(SAMPLE_PREFS.conditions)
    expect(data.prefs.warranty).toBe(SAMPLE_PREFS.warranty)
    // La nota visible va al documento; la interna, nunca.
    expect(data.quote.notes).toBe('Incluye visita técnica.')
    expect(JSON.stringify(data)).not.toContain('regatea')
  })

  it('completa ajustes parciales sin romperse', () => {
    const data = buildQuoteDocData({ quote: quote(), org, catalog, settings: {} })
    expect(data.prefs.quoteTemplate).toBe('esencial')
    // Sin vigencia definida no se supone ninguna.
    expect(data.prefs.validityDays).toBe(0)
    expect(data.prefs.showUnitPrice).toBe(true)
  })

  it('recorta empresa y cliente a lo que ve el cliente', () => {
    const data = buildQuoteDocData({ quote: quote({ client }), org, catalog, settings })
    expect(data.org).toEqual({ name: 'Ventanas del Sur', legalName: 'Ventanas del Sur SpA', rut: '76.123.456-7', city: 'Puerto Montt', phone: '+56 9 5555 1234', accent: '#2F7D4F' })
    expect(data.client).toEqual({ name: 'Carolina Muñoz', rut: '12.345.678-5', email: 'carolina@example.cl' })
    expect(JSON.stringify(data.client)).not.toContain('tarde')
    // Cliente explícito y «sin cliente».
    expect(buildQuoteDocData({ quote: quote({ client }), org, catalog, settings, client: { name: 'Otro' } }).client).toEqual({ name: 'Otro' })
    expect(buildQuoteDocData({ quote: quote({ client }), org, catalog, settings, client: null }).client).toBeUndefined()
  })

  it('fecha, revisión, aceptación y enlace del portal', () => {
    const q = quote({
      revision: 2,
      sentAt: '2026-11-02T15:00:00.000Z',
      validUntil: '2026-11-17',
      acceptedBy: { name: 'Carolina Muñoz', rut: '12.345.678-5', at: '2026-11-03T12:00:00.000Z' },
    })
    const data = buildQuoteDocData({ quote: q, org, catalog, settings, portalUrl: 'https://app.dekopen.cl/c/abc' })
    expect(data.quote).toMatchObject({ number: 412, revision: 2, date: '2026-11-02', validUntil: '2026-11-17', portalUrl: 'https://app.dekopen.cl/c/abc' })
    expect(data.quote.acceptedBy?.name).toBe('Carolina Muñoz')
    // Sin envío: la fecha es la de la última edición en hora de Chile.
    expect(buildQuoteDocData({ quote: quote(), org, catalog, settings }).quote.date).toBe('2026-10-30')
    expect(buildQuoteDocData({ quote: quote(), org, catalog, settings, date: '2026-12-01' }).quote.date).toBe('2026-12-01')
  })

  it('deja fuera las ventanas con cantidad 0 y acepta una cotización vacía', () => {
    const q = quote()
    q.items[1] = { ...q.items[1], qty: 0 }
    const data = buildQuoteDocData({ quote: q, org, catalog, settings })
    expect(data.items.map((i) => i.ref)).toEqual(['V1', 'V3'])
    const empty = buildQuoteDocData({ quote: quote({ items: [], extras: [], discountPct: 0 }), org, catalog, settings })
    expect(empty.items).toEqual([])
    expect(empty.totals.total).toBe(0)
  })

  it('reutiliza una evaluación ya calculada (vista previa en vivo)', () => {
    const q = quote()
    const evaluation = evaluateQuote(q, catalog, { ...DEFAULT_PRICING, marginPct: 20 })
    const data = buildQuoteDocData({ quote: q, org, catalog, settings, evaluation })
    expect(data.totals).toBe(evaluation.totals)
    expect(data.items[0].unitPrice).toBe(evaluation.items[0].price.unitNet)
  })

  it('aplica los ajustes de precio de la cotización encima de los de la organización', () => {
    const priced = sampleWorkshopCatalog()
    const line = priced.lines[0]
    const items = [item('z', 'V1', createDesign('fixed', { lineId: line.id, width: 1000, height: 1000, colorId: line.colorIds[0], glassId: priced.glass[0].id }))]
    const base = buildQuoteDocData({ quote: quote({ items }), org, catalog: priced, settings })
    const pricier = buildQuoteDocData({ quote: quote({ items, pricing: { marginPct: 55 } }), org, catalog: priced, settings })
    expect(pricier.items[0].unitPrice).toBeGreaterThan(base.items[0].unitPrice)
  })

  it('nunca lanza con un diseño roto', () => {
    const broken = { ...casement('fixed', 1000, 1000), lineId: 'no-existe', root: undefined } as unknown as WindowDesign
    const data = buildQuoteDocData({ quote: quote({ items: [item('z', 'V9', broken)] }), org, catalog, settings })
    expect(data.items).toHaveLength(1)
    expect(data.items[0].layout.width).toBe(1000)
    expect(data.items[0].lineName).toBe('')
  })

  it('nunca lanza con un árbol incompleto (raíz sin hijos, hijos nulos, corredera sin paneles)', () => {
    // La API valida de la raíz solo { id, type }: estos diseños se pueden guardar y enviar.
    const roots: unknown[] = [
      { id: 'r', type: 'split' },
      { id: 'r', type: 'split', dir: 'vertical', children: [null, 5, { id: 'l', type: 'leaf' }] },
      { id: 'r', type: 'sliding' },
      { id: 'r', type: 'sliding', rails: 2, panels: [null, 3, { id: 'p', kind: 'moving' }] },
      { id: 'r', type: 'leaf', opening: null },
    ]
    for (const root of roots) {
      const design = { ...casement('fixed', 1000, 1200), root } as unknown as WindowDesign
      expect(() => quoteDocGlass(design, catalog)).not.toThrow()
      expect(() => describeOpening(design)).not.toThrow()
      const q = quote({ items: [item('a', 'V1', design), item('b', 'V2', casement('fixed', 800, 800))] })
      const data = buildQuoteDocData({ quote: q, org, catalog, settings })
      // La ventana rota sigue en el documento (con sus medidas) y no arrastra a las demás.
      expect(data.items.map((i) => i.ref)).toEqual(['V1', 'V2'])
      expect(data.items[0].width).toBe(1000)
      expect(data.items[0].glassName).toBe('Termopanel 4-12-4')
      expect(data.items[1].description).toBe('Paño fijo')
      for (const template of ['esencial', 'galeria', 'compacta', 'editorial'] as const) {
        const html = renderToStaticMarkup(createElement(QuoteDocument, { data: { ...data, prefs: { ...data.prefs, showExteriorView: true } }, template }))
        expect(html).toContain('V1')
        expect(html).not.toContain('NaN')
        expect(html).not.toContain('undefined')
      }
    }
  })

  it('una ventana que hace lanzar a una ayuda no tumba el documento', () => {
    const design = casement('fixed', 1000, 1000)
    // Catálogo con datos corruptos: leer las líneas lanza.
    const hostile = { ...catalog, get lines(): never { throw new Error('catálogo roto') } } as typeof catalog
    const evaluation = evaluateQuote(quote({ items: [item('a', 'V1', design)] }), catalog, DEFAULT_PRICING)
    const data = buildQuoteDocData({ quote: quote({ items: [item('a', 'V1', design)] }), org, catalog: hostile, settings, evaluation, layout: () => { throw new Error('layout roto') } })
    expect(data.items).toHaveLength(1)
    expect(data.items[0].lineName).toBe('')
    expect(data.items[0].glassName).toBe('Termopanel 4-12-4')
    expect(data.items[0].layout.width).toBe(1000)
  })

  it('se dibuja con los ids v4 y cifras del motor', () => {
    const data = buildQuoteDocData({ quote: quote({ client }), org, catalog, settings, portalUrl: 'https://x/c/abc' })
    for (const template of ['esencial', 'galeria', 'compacta', 'editorial'] as const) {
      const html = renderToStaticMarkup(createElement(QuoteDocument, { data, template }))
      expect(html).toContain('Casa Muñoz')
      expect(html).toContain('Carolina Muñoz')
      expect(html).toContain(formatClp(data.totals.total))
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('undefined')
    }
  })
})

describe('ayudas del documento', () => {
  it('preferencias: ignora tipos incorrectos y respeta textos vacíos de la cotización', () => {
    const prefs = mergeQuoteDocPrefs(
      { ...SAMPLE_PREFS, quoteTemplate: 'hogar' },
      { quoteTemplate: 'no es un id válido!' as never, showArea: 'sí' as never, warranty: '', accent: '' },
    )
    // Un diseño inválido de la cotización no pisa el del taller (los ids v4 como «galeria» siguen valiendo).
    expect(prefs.quoteTemplate).toBe('hogar')
    expect(mergeQuoteDocPrefs({ ...SAMPLE_PREFS, quoteTemplate: 'hogar' }, { quoteTemplate: 'galeria' }).quoteTemplate).toBe('galeria')
    expect(prefs.showArea).toBe(SAMPLE_PREFS.showArea)
    expect(prefs.warranty).toBe('')
    expect(prefs.accent).toBeUndefined()
    expect(mergeQuoteDocPrefs(null, null)).toEqual(QUOTE_DOC_FALLBACK_PREFS)
  })

  it('días de validez desde texto', () => {
    expect(parseQuoteValidityDays('20 días')).toBe(20)
    expect(parseQuoteValidityDays(30)).toBe(30)
    expect(parseQuoteValidityDays('')).toBeNull()
    expect(parseQuoteValidityDays(-2)).toBeNull()
  })

  it('fechas en hora de Chile', () => {
    expect(quoteDocDate('2026-10-31')).toBe('2026-10-31')
    expect(quoteDocDate('2026-10-31T02:30:00.000Z')).toBe('2026-10-30')
    expect(quoteDocDate('2026-10-31T15:00:00.000Z')).toBe('2026-10-31')
    expect(quoteDocDate(undefined)).toBe('')
  })

  it('línea, color bicolor y vidrios mezclados', () => {
    const design = casement('fixed_casement', 1500, 1200)
    expect(quoteDocLine(design, catalog)).toBe('PVC Serie 60')
    expect(quoteDocColor(setColor(design, 'walnut', 'white'), catalog)).toBe('Nogal exterior, blanco interior')
    const leafId = design.root.type === 'split' ? design.root.children[0].id : design.root.id
    expect(quoteDocGlass(setGlass(design, leafId, 'lam-33'), catalog)).toBe('Laminado 3+3 empavonado y termopanel 4-12-4')
    expect(quoteDocGlass(design, catalog)).toBe('Termopanel 4-12-4')
  })
})
