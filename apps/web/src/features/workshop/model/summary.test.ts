import { describe, expect, it } from 'vitest'
import { createDesign, type Warning } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import { buildWorkshopDocInput } from '@framezen/documents'
import { workshopNotices, workshopTotals } from './summary'

const design = (t: string, w: number, h: number, lineId: string = SAMPLE_DEFAULTS.lineId) =>
  createDesign(t, { lineId, width: w, height: h, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId })

function sample() {
  return buildWorkshopDocInput({
    quote: {
      number: 412,
      title: 'Casa Pérez',
      items: [
        { id: 'a', ref: 'V1', qty: 2, design: design('casement', 800, 1200) },
        { id: 'b', ref: 'V2', qty: 1, design: design('sliding_2', 1500, 1100, 'serie-70-corredera') },
      ],
    },
    org: { name: 'Taller' },
    catalog: SAMPLE_CATALOG,
    settings: {},
    workOrder: { number: 38, createdAt: '2026-10-31T12:00:00Z' },
  }).data
}

describe('totales de la OT', () => {
  it('suma unidades, barras, vidrios y m²', () => {
    const data = sample()
    const t = workshopTotals(data)
    expect(t.windows).toBe(2)
    expect(t.units).toBe(3)
    expect(t.bars).toBe(data.optimization.totalBars)
    expect(t.bars).toBeGreaterThan(0)
    expect(t.glassPieces).toBe(data.glass.reduce((s, g) => s + g.qty, 0))
    expect(t.glassPieces).toBeGreaterThanOrEqual(4)
    // 2 × 0,96 m² + 1,65 m²
    expect(t.frameArea).toBeCloseTo(3.57, 2)
    expect(t.glassArea).toBeGreaterThan(0)
  })
})

describe('avisos para fabricar', () => {
  it('sin avisos de precio, sin repetir y los graves primero', () => {
    const data = sample()
    const warn = (level: Warning['level'], code: string, message: string): Warning => ({ level, code, message })
    data.windows[0]!.bom.warnings = [
      warn('warn', 'pane_small', 'El paño izquierdo queda chico.'),
      warn('warn', 'pane_small', 'El paño izquierdo queda chico.'),
      warn('warn', 'price_missing_item', 'La bisagra no tiene precio.'),
      warn('info', 'sliding_mono_estimated', 'Monorriel estimado.'),
    ]
    data.windows[1]!.bom.warnings = [warn('error', 'pane_impossible', 'La hoja no cabe.')]
    data.optimization.warnings = [warn('warn', 'piece_too_long', 'La pieza no cabe en una barra.')]
    expect(workshopNotices(data)).toEqual([
      { level: 'error', message: 'La hoja no cabe.', ref: 'V2' },
      { level: 'warn', message: 'El paño izquierdo queda chico.', ref: 'V1' },
      { level: 'warn', message: 'La pieza no cabe en una barra.' },
    ])
  })
})
