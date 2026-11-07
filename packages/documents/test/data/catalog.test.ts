import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createDesign, DEFAULT_PRICING, evaluateQuote } from '@dekopen/engine'
import type { Quote } from '@dekopen/shared'
import {
  buildCatalogDocData,
  CATALOG_DOC_MAX_TYPOLOGIES,
  catalogLineGlass,
  catalogLineTypologies,
  fromPricePerM2,
  isIncompletePriceWarning,
} from '../../src/data/catalog'
import { sampleWorkshopCatalog } from '../../src/workshop'
import { buildQuoteDocData, pinQuoteDocPrices } from '../../src/data/quote'
import { CatalogDocument, SAMPLE_CATALOG, SAMPLE_PREFS } from '../../src/sales'

const catalog = SAMPLE_CATALOG
const org = { name: '  Ventanas del Sur ', phone: '+56 9 5555 1234', accent: '#2F7D4F' }
const settings = { pricing: DEFAULT_PRICING, documents: SAMPLE_PREFS }

describe('buildCatalogDocData', () => {
  it('una entrada por línea con sus tipologías dibujadas y «desde $X/m²» del motor', () => {
    const doc = buildCatalogDocData({ org, catalog, settings, date: '2026-10-31' })
    expect(doc.entries.map((e) => e.line.id)).toEqual(catalog.lines.map((l) => l.id))
    expect(doc.org.name).toBe('Ventanas del Sur')
    expect(doc.date).toBe('2026-10-31')
    for (const entry of doc.entries) {
      expect(entry.typologies.length).toBeGreaterThan(0)
      expect(entry.typologies.length).toBeLessThanOrEqual(CATALOG_DOC_MAX_TYPOLOGIES)
      for (const t of entry.typologies) {
        expect(t.layout.width).toBe(t.design.width)
        expect(t.design.lineId).toBe(entry.line.id)
        if (t.fromPricePerM2 !== undefined) expect(t.fromPricePerM2 % 100).toBe(0)
      }
    }
    // El catálogo de muestra de los dibujos no trae perfiles: su precio está incompleto y no se publica.
    expect(doc.entries.every((e) => e.typologies.every((t) => t.fromPricePerM2 === undefined))).toBe(true)
  })

  it('«desde» = neto del motor ÷ área, hacia arriba a $100', () => {
    const full = sampleWorkshopCatalog()
    const line = full.lines[0]
    const design = createDesign('fixed', { lineId: line.id, width: 1000, height: 1000, colorId: line.colorIds[0], glassId: full.glass[0].id })
    const evaluation = evaluateQuote({ items: [{ id: 'x', ref: 'V1', qty: 1, design }], extras: [], discountPct: 0 }, full, DEFAULT_PRICING)
    expect([...evaluation.items[0].price.warnings, ...evaluation.items[0].bom.warnings].some(isIncompletePriceWarning)).toBe(false)
    const unit = evaluation.items[0].price.unitNet
    const area = evaluation.items[0].bom.area
    expect(fromPricePerM2(design, full, { pricing: DEFAULT_PRICING })).toBe(Math.ceil(unit / area / 100) * 100)
  })

  it('sin «desde» si al precio le faltan datos: el cliente no ve más barata la línea incompleta', () => {
    const full = sampleWorkshopCatalog()
    const line = full.lines[0]
    // Hoja con herraje sin precio (limitador a $0) y línea sin perfiles: precio incompleto.
    const casement = createDesign('casement', { lineId: line.id, width: 800, height: 1200, colorId: line.colorIds[0], glassId: full.glass[0].id })
    const evaluation = evaluateQuote({ items: [{ id: 'x', ref: 'V1', qty: 1, design: casement }], extras: [], discountPct: 0 }, full, DEFAULT_PRICING)
    expect(evaluation.items[0].price.pending?.length).toBeGreaterThan(0)
    expect([...evaluation.items[0].price.warnings, ...evaluation.items[0].bom.warnings].some(isIncompletePriceWarning)).toBe(true)
    expect(fromPricePerM2(casement, full, { pricing: DEFAULT_PRICING })).toBeUndefined()
    const noProfiles = { ...full, lines: full.lines.map((l) => ({ ...l, profiles: {} })) }
    const fixed = createDesign('fixed', { lineId: line.id, width: 1000, height: 1000, colorId: line.colorIds[0], glassId: full.glass[0].id })
    expect(fromPricePerM2(fixed, full, { pricing: DEFAULT_PRICING })).toBeGreaterThan(0)
    expect(fromPricePerM2(fixed, noProfiles, { pricing: DEFAULT_PRICING })).toBeUndefined()
    for (const code of ['price_missing', 'price_missing_profile', 'profile_missing', 'line_missing', 'hardware_missing']) expect(isIncompletePriceWarning({ code })).toBe(true)
    expect(isIncompletePriceWarning({ code: 'manual_price', level: 'info' })).toBe(false)
  })

  it('líneas con datos parciales: fuera solo si se pide, y nunca un folleto vacío', () => {
    const full = sampleWorkshopCatalog()
    const [a, b] = full.lines
    const mixed = { ...full, lines: [{ ...a, completeness: 'partial' as const }, { ...b, completeness: 'complete' as const }] }
    expect(buildCatalogDocData({ org, catalog: mixed, settings }).entries.map((e) => e.line.id)).toEqual([a.id, b.id])
    const strict = buildCatalogDocData({ org, catalog: mixed, settings, includePartial: false })
    expect(strict.entries.map((e) => e.line.id)).toEqual([b.id])
    expect(strict.catalog.lines.map((l) => l.id)).toEqual([b.id])
    const allPartial = { ...full, lines: full.lines.map((l) => ({ ...l, completeness: 'partial' as const })) }
    expect(buildCatalogDocData({ org, catalog: allPartial, settings, includePartial: false }).entries.length).toBe(full.lines.length)
  })

  it('vidrios de la ficha: primero el del precio y luego del mismo tipo y espesor con precio', () => {
    const full = sampleWorkshopCatalog()
    const base = full.glass[0]
    const doc = buildCatalogDocData({ org, catalog: full, settings: { ...settings, defaults: { glassId: base.id } } })
    for (const entry of doc.entries) expect(entry.glassIds?.[0]).toBe(base.id)
    const extra = { ...full, glass: [...full.glass, { ...base, id: 'otro-igual', name: `${base.name} Low-e`, pricePerM2: 50000 }, { ...base, id: 'sin-precio', name: 'Sin precio', pricePerM2: 0 }, { ...base, id: 'mono', name: 'Simple 4', kind: 'mono' as const, thickness: 4 }] }
    const ids = catalogLineGlass(extra, base.id)
    expect(ids[0]).toBe(base.id)
    expect(ids).toContain('otro-igual')
    expect(ids).not.toContain('sin-precio')
    expect(ids).not.toContain('mono')
    expect(ids.length).toBeLessThanOrEqual(3)
    expect(catalogLineGlass(extra, 'no-existe')).toEqual([])
  })

  it('líneas elegidas en el orden del catálogo, máximo de tipologías y título', () => {
    const ids = catalog.lines.map((l) => l.id).reverse()
    const doc = buildCatalogDocData({ org, catalog, settings, lineIds: ids.slice(0, 1), maxTypologies: 2, title: '  Catálogo 2027 ' })
    expect(doc.entries.map((e) => e.line.id)).toEqual([ids[0]])
    expect(doc.entries[0].typologies.length).toBeLessThanOrEqual(2)
    expect(doc.title).toBe('Catálogo 2027')
    expect(doc.catalog.lines.map((l) => l.id)).toEqual([ids[0]])
  })

  it('el color y el vidrio del taller mandan si la línea los admite', () => {
    const line = catalog.lines.find((l) => l.colorIds.length > 1)!
    const colorId = line.colorIds[1]
    const glassId = catalog.glass[catalog.glass.length - 1].id
    const doc = buildCatalogDocData({ org, catalog, settings: { ...settings, defaults: { colorId, glassId } }, lineIds: [line.id] })
    expect(doc.entries[0].typologies.every((t) => t.design.colorId === colorId && t.design.glassId === glassId)).toBe(true)
    const other = buildCatalogDocData({ org, catalog, settings: { ...settings, defaults: { colorId: 'no-existe', glassId: 'no-existe' } }, lineIds: [line.id] })
    expect(other.entries[0].typologies[0].design.colorId).toBe(line.colorIds[0])
    expect(other.entries[0].typologies[0].design.glassId).toBe(catalog.glass[0].id)
  })

  it('líneas sin tipologías declaradas usan las típicas; tipologías desconocidas se ignoran', () => {
    const line = { ...catalog.lines[0], typologyIds: ['no-existe'] as never[] }
    expect(catalogLineTypologies(line).length).toBeGreaterThan(0)
    expect(catalogLineTypologies({ ...line, typologyIds: ['fixed', 'casement', 'tilt_turn'] }, 2)).toEqual(['fixed', 'casement'])
  })

  it('sin precios muestra «Precio a consultar»; nunca lanza ni deja NaN', () => {
    const noPrices = { ...catalog, profiles: catalog.profiles.map((p) => ({ ...p, prices: {} })), glass: catalog.glass.map((g) => ({ ...g, pricePerM2: 0 })), items: [] }
    const doc = buildCatalogDocData({ org, catalog: noPrices, settings })
    expect(doc.entries.length).toBeGreaterThan(0)
    for (const template of ['vitrina', 'ficha', 'lookbook'] as const) {
      const html = renderToStaticMarkup(createElement(CatalogDocument, { data: doc, template }))
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('undefined')
    }
    expect(buildCatalogDocData({ org, catalog: { ...catalog, lines: [] }, settings }).entries).toEqual([])
  })
})

describe('pinQuoteDocPrices', () => {
  const line = catalog.lines.find((l) => l.kind === 'casement')!
  const design = createDesign('casement', { lineId: line.id, width: 800, height: 1000, colorId: line.colorIds[0], glassId: catalog.glass[0].id })
  const quote: Quote = {
    id: 'q1',
    number: 12,
    title: 'Casa',
    status: 'sent',
    items: [
      { id: 'a', ref: 'V1', qty: 1, design },
      { id: 'b', ref: 'V2', qty: 0, design },
      { id: 'c', ref: 'V3', qty: 2, design },
    ],
    extras: [],
    discountPct: 0,
    revision: 1,
    version: 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  }
  const pinned = { a: { unitNet: 111_100, totalNet: 111_100 }, b: { unitNet: 1, totalNet: 0 }, c: { unitNet: 333_300, totalNet: 666_600 } }

  it('cruza por id aunque falten ventanas con cantidad 0 (nunca por posición)', () => {
    const data = buildQuoteDocData({ quote, org, catalog, settings })
    expect(data.items.map((i) => i.ref)).toEqual(['V1', 'V3'])
    const out = pinQuoteDocPrices(data, quote, pinned)
    expect(out.items.map((i) => [i.ref, i.unitPrice, i.total])).toEqual([
      ['V1', 111_100, 111_100],
      ['V3', 333_300, 666_600],
    ])
  })

  it('sin id cruza por ref, sin repetir ítems', () => {
    const data = buildQuoteDocData({ quote, org, catalog, settings })
    const withoutIds = { ...data, items: data.items.map(({ id: _id, ...rest }) => rest) }
    const out = pinQuoteDocPrices(withoutIds, quote, pinned)
    expect(out.items.map((i) => i.unitPrice)).toEqual([111_100, 333_300])
  })

  it('los totales fijados ocultan costo y margen; sin nada que fijar devuelve lo mismo', () => {
    const data = buildQuoteDocData({ quote, org, catalog, settings })
    const totals = { ...data.totals, total: 1, cost: 999, marginPct: 40 }
    const out = pinQuoteDocPrices(data, quote, undefined, totals)
    expect(out.totals).toMatchObject({ total: 1, cost: 0, marginPct: 0 })
    expect(pinQuoteDocPrices(data, quote)).toBe(data)
  })
})
