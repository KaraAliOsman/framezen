import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { CatalogDocument, QuoteDocument } from '@framezen/documents'
import { createDesign, DEFAULT_PRICING, evaluateQuote } from '@framezen/engine'
import type { Quote } from '@framezen/shared'
import { catalogDocFromCatalog, colorLabel, fromPricePerM2, quoteDocFromQuote, SAMPLE_DOC_CLIENT, sampleQuoteDoc, toDocOrg, type DocContext } from './docData'
import { applyDocEdit, DEFAULT_PREFS, SUGGESTED_TEXTS, withDefaultPrefs } from './prefs'

const ctx: DocContext = {
  catalog: SAMPLE_CATALOG,
  pricing: DEFAULT_PRICING,
  prefs: DEFAULT_PREFS,
  org: toDocOrg({ name: 'Ventanas del Sur', accent: '#2747C2', phone: '+56 9 1234 5678' }),
}

describe('cotización de ejemplo con las líneas del taller', () => {
  it('usa precios del motor y totales que cuadran', () => {
    const doc = sampleQuoteDoc(ctx)!
    expect(doc.items.length).toBeGreaterThanOrEqual(4)
    expect(doc.items.every((i) => i.unitPrice > 0 && i.total === i.unitPrice * i.qty)).toBe(true)
    const subtotal = doc.items.reduce((n, i) => n + i.total, 0)
    expect(doc.totals.subtotal).toBe(subtotal)
    expect(doc.totals.total).toBe(doc.totals.net + doc.totals.iva)
    expect(doc.client?.name).toBeTruthy()
  })

  it('el cliente de muestra usa el RUT de prueba conocido, nunca uno que pueda ser de una persona real', () => {
    expect(SAMPLE_DOC_CLIENT.rut).toBe('12.345.678-5')
    expect(sampleQuoteDoc(ctx)!.client?.rut).toBe('12.345.678-5')
  })

  it('se puede pedir con menos ventanas (miniaturas)', () => {
    expect(sampleQuoteDoc(ctx, { items: 3 })!.items).toHaveLength(3)
  })

  it('sin líneas activas no arma ejemplo (la página usa el de muestra del paquete)', () => {
    expect(sampleQuoteDoc({ ...ctx, catalog: { ...SAMPLE_CATALOG, lines: [] } })).toBeNull()
  })

  it('se dibuja con las cuatro plantillas sin errores', () => {
    const doc = sampleQuoteDoc(ctx)!
    for (const template of ['esencial', 'galeria', 'compacta', 'editorial'] as const) {
      const html = renderToStaticMarkup(<QuoteDocument template={template} data={doc} />)
      expect(html).toContain('Ventanas del Sur')
      expect(html).toContain('412')
    }
  })
})

describe('cotización real del taller', () => {
  const line = SAMPLE_CATALOG.lines.find((l) => l.kind === 'casement')!
  const design = createDesign('tilt_turn', { lineId: line.id, width: 800, height: 1200, colorId: line.colorIds[0], glassId: SAMPLE_CATALOG.glass[0].id })
  const quote: Quote = {
    id: 'q1',
    number: 57,
    title: 'Casa Rojas',
    status: 'draft',
    items: [{ id: 'i1', ref: 'V1', qty: 2, design, location: 'Cocina' }],
    extras: [{ id: 'e1', label: 'Instalación', amount: 50_000 }],
    discountPct: 5,
    revision: 0,
    version: 1,
    createdAt: '2026-10-30T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    documentOverrides: { intro: 'Hola Rojas' },
  }

  it('toma precios y totales del motor, y los textos propios de esa cotización', () => {
    const doc = quoteDocFromQuote(quote, ctx)
    const evaluation = evaluateQuote(quote, SAMPLE_CATALOG, DEFAULT_PRICING)
    expect(doc.totals.total).toBe(evaluation.totals.total)
    expect(doc.items[0]).toMatchObject({ ref: 'V1', qty: 2, description: 'Oscilobatiente', width: 800, height: 1200 })
    expect(doc.prefs.intro).toBe('Hola Rojas')
    expect(doc.quote.date).toBe('2026-10-31')
  })

  it('nombra bicolor exterior/interior', () => {
    const [a, b] = SAMPLE_CATALOG.colors
    expect(colorLabel(SAMPLE_CATALOG, { colorId: a.id, colorInId: b.id })).toBe(`${a.name} exterior, ${b.name.toLowerCase()} interior`)
    expect(colorLabel(SAMPLE_CATALOG, { colorId: a.id, colorInId: a.id })).toBe(a.name)
  })
})

describe('catálogo de productos', () => {
  it('arma una entrada por línea activa con tipologías dibujadas y «desde $X/m²» del motor', () => {
    const doc = catalogDocFromCatalog(ctx)
    expect(doc.entries.length).toBe(SAMPLE_CATALOG.lines.length)
    for (const entry of doc.entries) {
      expect(entry.typologies.length).toBeGreaterThan(0)
      for (const t of entry.typologies) {
        expect(t.layout.width).toBe(t.design.width)
        if (t.fromPricePerM2 !== undefined) expect(t.fromPricePerM2 % 100).toBe(0)
      }
    }
    expect(doc.entries.some((e) => e.typologies.some((t) => (t.fromPricePerM2 ?? 0) > 0))).toBe(true)
  })

  it('respeta las líneas elegidas y el máximo de tipologías', () => {
    const first = SAMPLE_CATALOG.lines[0].id
    const doc = catalogDocFromCatalog(ctx, { lineIds: [first], maxTypologies: 2 })
    expect(doc.entries.map((e) => e.line.id)).toEqual([first])
    expect(doc.entries[0].typologies.length).toBeLessThanOrEqual(2)
  })

  it('«desde» por m² = precio neto ÷ área, redondeado hacia arriba a $100 (igual que el PDF)', () => {
    const line = SAMPLE_CATALOG.lines[0]
    const design = createDesign('fixed', { lineId: line.id, width: 1000, height: 1000, colorId: line.colorIds[0], glassId: SAMPLE_CATALOG.glass[0].id })
    const value = fromPricePerM2(design, SAMPLE_CATALOG, { pricing: DEFAULT_PRICING })!
    expect(value).toBeGreaterThan(0)
    expect(value % 100).toBe(0)
  })

  it('se dibuja con los tres diseños sin errores', () => {
    const doc = catalogDocFromCatalog(ctx, { title: 'Catálogo 2027' })
    for (const template of ['vitrina', 'ficha', 'lookbook'] as const) {
      const html = renderToStaticMarkup(<CatalogDocument template={template} data={doc} />)
      expect(html).toContain('Ventanas del Sur')
    }
  })
})

describe('edición directa sobre el documento', () => {
  it('los textos comerciales se guardan como preferencias', () => {
    expect(applyDocEdit(DEFAULT_PREFS, 'intro', 'Hola')).toEqual({ patch: { intro: 'Hola' } })
    expect(applyDocEdit(DEFAULT_PREFS, 'intro', DEFAULT_PREFS.intro)).toEqual({ unchanged: true })
  })

  it('la vigencia llega como texto y se guarda como número', () => {
    expect(applyDocEdit(DEFAULT_PREFS, 'validityDays', '30 días')).toEqual({ patch: { validityDays: 30 } })
    expect(applyDocEdit(DEFAULT_PREFS, 'validityDays', 'pronto')).toEqual({ unchanged: true })
    expect(applyDocEdit(DEFAULT_PREFS, 'validityDays', '9999')).toEqual({ patch: { validityDays: 365 } })
  })

  it('firma y pie vacíos se borran', () => {
    expect(applyDocEdit({ ...DEFAULT_PREFS, footer: 'Banco' }, 'footer', '  ')).toEqual({ patch: { footer: undefined } })
  })

  it('el título y las notas son de cada cotización: no se guardan aquí', () => {
    expect(applyDocEdit(DEFAULT_PREFS, 'title', 'Otra obra')).toEqual({ ignored: 'quote-field' })
    expect(applyDocEdit(DEFAULT_PREFS, 'notes', 'x')).toEqual({ ignored: 'quote-field' })
  })

  it('completa preferencias guardadas incompletas con los textos sugeridos', () => {
    const prefs = withDefaultPrefs({ font: 'serif' })
    expect(prefs.font).toBe('serif')
    expect(prefs.conditions).toBe(SUGGESTED_TEXTS.conditions)
    expect(prefs.validityDays).toBe(15)
  })
})
