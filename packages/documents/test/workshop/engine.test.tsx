import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildWorkshopData, createDesign } from '@dekopen/engine'
import {
  WORKSHOP_DOCUMENTS,
  WorkshopDocument,
  sampleWorkshopCatalog,
  workshopLabels,
  workshopPieceCodes,
  type WorkshopDocumentData,
} from '../../src/workshop'

/** Datos de taller calculados por el motor real (no por los fixtures). */
function engineData(): WorkshopDocumentData {
  const catalog = sampleWorkshopCatalog()
  const item = (id: string, ref: string, typology: string, lineId: string, width: number, height: number, colorId: string, qty = 1) => ({
    id,
    ref,
    qty,
    design: createDesign(typology, { lineId, width, height, colorId, glassId: 'dvh-4124' }),
  })
  const quote = {
    items: [
      item('i1', 'V1', 'fixed_casement', 'andino-60', 1200, 1350, 'blanco'),
      item('i2', 'V2', 'sliding_2', 'andino-c70', 1500, 1100, 'blanco', 2),
      item('i3', 'V3', 'trapezoid', 'andino-60', 1000, 1000, 'winchester'),
    ],
    extras: [],
    discountPct: 0,
  }
  const workshop = buildWorkshopData(quote, catalog, {}, { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 })
  return {
    ...workshop,
    catalog,
    org: { name: 'Taller de prueba' },
    quote: { number: 7, title: 'Obra de prueba' },
    workOrder: { number: 3, date: '2026-10-31' },
  }
}

describe('Documentos con datos del motor', () => {
  const data = engineData()

  it('el motor entrega ventanas con cortes', () => {
    expect(data.windows).toHaveLength(3)
    expect(data.windows.every((w) => w.bom.cuts.length > 0)).toBe(true)
  })

  it('todos los documentos se renderizan sin errores', () => {
    for (const doc of WORKSHOP_DOCUMENTS) {
      const html = renderToStaticMarkup(<WorkshopDocument kind={doc.kind} data={data} />)
      expect(html).toContain(`data-document="${doc.kind}"`)
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('undefined')
    }
  })

  it('códigos de pieza únicos y una etiqueta por pieza física', () => {
    for (const w of data.windows) {
      const units = workshopPieceCodes(w)
      expect(new Set(units.map((u) => u.code)).size).toBe(units.length)
    }
    const pieces = data.windows.reduce((s, w) => s + w.qty * w.bom.cuts.reduce((t, c) => t + c.qty, 0), 0)
    expect(workshopLabels(data, { includeGlass: false })).toHaveLength(pieces)
  })
})
