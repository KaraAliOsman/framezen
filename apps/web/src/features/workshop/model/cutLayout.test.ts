import { describe, expect, it } from 'vitest'
import type { Bar, OptimizationGroup } from '@dekopen/engine'
import { barKey, groupRefs, mm, piecePolygon, placeBar, planSignature, sideOf, textWidth } from './cutLayout'

const cut = { trimStart: 0, trimEnd: 0, minReusable: 500 }

function bar(cuts: [number, string, string?][], barLength = 5800, kerf = 4, trimStart = 0): Bar {
  let offset = trimStart
  const placed = cuts.map(([length, label, ref]) => {
    const c = { length, label: ref ? `${ref} · ${label}` : label, ref, offset, angleStart: 45, angleEnd: 45 }
    offset += length + kerf
    return c
  })
  const used = cuts.reduce((s, [l]) => s + l, 0)
  const kerfLoss = cuts.length * kerf
  return { key: 'k', barLength, fromOffcut: false, cuts: placed, used, kerfLoss, remainder: barLength - trimStart - used - kerfLoss, yieldPct: (used / barLength) * 100 }
}

describe('medidas y etiquetas', () => {
  it('formato de taller', () => {
    expect(mm(1234.5)).toBe('1.234,5')
    expect(mm(2246)).toBe('2.246')
    expect(mm(554.04)).toBe('554')
  })
  it('lado sin la ref', () => {
    expect(sideOf({ label: 'V3 · arr/aba', ref: 'V3' })).toBe('arr/aba')
    expect(sideOf({ label: 'trav', ref: 'V1' })).toBe('trav')
    expect(sideOf({ label: 'V1', ref: 'V1' })).toBe('')
  })
  it('ancho de texto crece con el tamaño', () => {
    expect(textWidth('1.234', 15)).toBeGreaterThan(textWidth('1.234', 12))
  })
})

describe('placeBar', () => {
  it('coloca las piezas a escala y el sobrante al final', () => {
    const b = bar([
      [2000, 'arr', 'V1'],
      [1500, 'izq', 'V2'],
    ])
    const p = placeBar(b, cut, 580)
    expect(p.scale).toBeCloseTo(0.1)
    expect(p.pieces[0]).toMatchObject({ x: 0, w: 200, caption: 'V1 · arr' })
    expect(p.pieces[1]?.x).toBeCloseTo(200.4)
    expect(p.pieces[1]?.measure).toEqual({ size: 15, vertical: false })
    expect(p.remainder?.length).toBe(5800 - 3500 - 8)
    expect(p.remainder?.reusable).toBe(true)
    expect(p.remainder?.x).toBeCloseTo((3500 + 8) * 0.1)
    expect(p.hidden).toEqual([])
    // Ingletes a 45°: la cara corta arriba.
    expect(p.pieces[0]!.miterStart).toBeGreaterThan(0)
    expect(piecePolygon(p.pieces[0]!).split(' ')).toHaveLength(4)
  })

  it('las piezas angostas bajan de tamaño, giran o pasan a la lista de piezas cortas', () => {
    const b = bar([
      [5000, 'arr', 'V1'],
      [300, 'trav', 'V2'],
      [120, 'trav', 'V3'],
    ])
    const narrow = placeBar(b, cut, 400)
    const [big, mid, tiny] = narrow.pieces
    expect(big?.measure?.size).toBe(15)
    expect(mid?.measure).not.toBeNull()
    expect(tiny?.measure).toBeNull()
    expect(narrow.hidden.map((h) => h.n)).toEqual([3])
    // Con más espacio todo entra horizontal.
    expect(placeBar(b, cut, 2400).hidden).toEqual([])
  })

  it('despunte, retazo de bodega y sobrante corto', () => {
    const b = bar([[5700, 'arr', 'V1']], 5800, 4, 20)
    const p = placeBar(b, { trimStart: 20, trimEnd: 10, minReusable: 500 }, 580)
    expect(p.trimStart).toEqual({ x: 0, w: 2 })
    expect(p.trimEnd?.w).toBeCloseTo(1)
    expect(p.remainder?.reusable).toBe(false)
    const offcut = { ...b, fromOffcut: true }
    // El optimizador también despunta los retazos: el dibujo muestra lo que de verdad se pierde.
    expect(placeBar(offcut, { trimStart: 20, trimEnd: 10, minReusable: 500 }, 580).trimStart).toEqual({ x: 0, w: 2 })
    const full = bar([[5796, 'arr', 'V1']])
    expect(placeBar(full, cut, 580).remainder).toBeNull()
  })
})

describe('marcas de corte', () => {
  const group = (lengths: number[][]): OptimizationGroup => ({
    key: 'pro01|blanco',
    code: 'PRO01',
    name: 'Marco',
    colorId: 'blanco',
    bars: lengths.map((ls) => bar(ls.map((l, i) => [l, 'arr', `V${i + 1}`] as [number, string, string]))),
    pieces: lengths.flat().length,
    yieldPct: 90,
    barsNeeded: lengths.length,
  })

  it('la firma cambia si cambia el plan y no si es igual', () => {
    expect(planSignature([group([[1000, 2000]])])).toBe(planSignature([group([[1000, 2000]])]))
    expect(planSignature([group([[1000, 2000]])])).not.toBe(planSignature([group([[1000, 2001]])]))
  })

  it('clave de barra y refs del grupo', () => {
    const g = group([[1000, 2000], [500]])
    expect(barKey(g, 0, g.bars[0]!)).toBe('pro01|blanco#0#1000+2000')
    expect(groupRefs(g)).toEqual(['V1', 'V2'])
  })
})
