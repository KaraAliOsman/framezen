import { describe, expect, it } from 'vitest'
import { optimizeCuts, type CutPieceInput } from '../../src/commerce/optimizer'
import type { CutSettings } from '../../src/types'

const SAW: CutSettings = { barLength: 5800, kerf: 4, trimStart: 15, trimEnd: 15, minReusable: 500 }
const NO_TRIM: CutSettings = { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 }

const piece = (length: number, qty = 1, extra: Partial<CutPieceInput> = {}): CutPieceInput => ({
  key: 'PRO01|blanco',
  length,
  qty,
  label: `p${length}`,
  ...extra,
})

describe('optimizeCuts · casos dorados', () => {
  it('barra 5800, disco 4, despuntes 15+15, 4 × 1006 + 2 × 806 → 1 barra, sobrante 110, 97,17 %', () => {
    const plan = optimizeCuts([piece(1006, 4), piece(806, 2)], SAW)
    expect(plan.totalBars).toBe(1)
    expect(plan.totalPieces).toBe(6)
    const [group] = plan.groups
    expect(group.barsNeeded).toBe(1)
    const [bar] = group.bars
    expect(bar.used).toBe(5636)
    expect(bar.kerfLoss).toBe(24)
    expect(bar.remainder).toBe(110)
    expect(bar.yieldPct).toBe(97.17)
    expect(plan.yieldPct).toBe(97.17)
    // Orden de corte: más largas primero, posiciones desde el despunte.
    expect(bar.cuts.map((c) => c.length)).toEqual([1006, 1006, 1006, 1006, 806, 806])
    expect(bar.cuts.map((c) => c.offset)).toEqual([15, 1025, 2035, 3045, 4055, 4865])
    expect(plan.warnings).toEqual([])
  })

  it('ajuste exacto: 5766 + disco 4 = útil 5770 → sobrante 0', () => {
    const plan = optimizeCuts([piece(5766)], SAW)
    expect(plan.totalBars).toBe(1)
    expect(plan.groups[0].bars[0].remainder).toBe(0)
    expect(plan.warnings).toEqual([])
  })

  it('pieza más larga que la barra → barra especial y aviso, sin excepción', () => {
    const plan = optimizeCuts([piece(5766.01), piece(6200, 1, { label: 'V2 · izq' }), piece(1000)], SAW)
    const bars = plan.groups[0].bars
    expect(plan.warnings.filter((w) => w.code === 'piece_too_long')).toHaveLength(2)
    expect(plan.warnings.some((w) => w.message.includes('6.200 mm (V2 · izq)'))).toBe(true)
    const special = bars.find((b) => b.cuts[0].length === 6200)!
    expect(special.barLength).toBe(6234)
    expect(special.remainder).toBe(0)
    // La pieza de 1000 va en una barra normal.
    expect(bars.some((b) => b.barLength === 5800 && b.cuts[0].length === 1000)).toBe(true)
    expect(plan.totalBars).toBe(3)
  })

  it('contraejemplo de BFD (barra 6000, sin disco): la búsqueda exacta logra 3 barras', () => {
    const cut = { barLength: 6000, kerf: 0, trimStart: 0, trimEnd: 0, minReusable: 500 }
    const plan = optimizeCuts([piece(3000, 3), piece(2000, 3), piece(1400), piece(800, 2)], cut)
    expect(plan.totalBars).toBe(3)
    const contents = plan.groups[0].bars.map((b) => b.cuts.map((c) => c.length).join('+')).sort()
    expect(contents).toEqual(['2000+2000+2000', '3000+1400+800+800', '3000+3000'].sort())
  })

  it('usa primero los retazos: 5900 y 700 con una pieza de 600 → retazo de 700, 0 barras', () => {
    const plan = optimizeCuts([piece(600)], SAW, [
      { key: 'PRO01|blanco', length: 5900 },
      { key: 'PRO01|blanco', length: 700 },
      { key: 'OTRO|blanco', length: 650 },
    ])
    expect(plan.totalBars).toBe(0)
    const [bar] = plan.groups[0].bars
    expect(bar.fromOffcut).toBe(true)
    expect(bar.barLength).toBe(700)
    expect(plan.groups[0].barsNeeded).toBe(0)
  })

  it('PRO201 [1481, 1481, 1141, 1141] sin despunte → 1 barra, 90,41 % (disco también en la última pieza)', () => {
    const plan = optimizeCuts([piece(1481, 2), piece(1141, 2)], NO_TRIM)
    expect(plan.totalBars).toBe(1)
    expect(plan.groups[0].bars[0].remainder).toBe(540)
    expect(plan.groups[0].yieldPct).toBe(90.41)
  })

  it('PRO05 Antracita [1128,5 × 4, 812 × 4] → 2 barras, 66,91 %', () => {
    const plan = optimizeCuts([piece(1128.5, 4), piece(812, 4)], NO_TRIM)
    expect(plan.totalBars).toBe(2)
    expect(plan.groups[0].yieldPct).toBe(66.91)
    expect(plan.groups[0].bars.flatMap((b) => b.cuts).some((c) => c.length === 1128.5)).toBe(true)
  })

  it('PRO01 Winchester (T22) → 2 barras, 84,98 %', () => {
    const plan = optimizeCuts([piece(2246, 2), piece(1124.03), piece(1006, 2), piece(862, 2), piece(506)], NO_TRIM)
    expect(plan.totalBars).toBe(2)
    expect(plan.yieldPct).toBe(84.98)
  })
})

describe('optimizeCuts · comportamiento', () => {
  it('agrupa por clave (perfil + color) y conserva el orden de aparición', () => {
    const plan = optimizeCuts(
      [
        piece(1000, 2, { key: 'PRO05|blanco', code: 'PRO05', name: 'Junquillo', colorId: 'blanco' }),
        piece(1200, 2, { key: 'PRO01|blanco', code: 'PRO01', name: 'Marco', colorId: 'blanco' }),
        piece(900, 1, { key: 'PRO05|blanco' }),
      ],
      NO_TRIM,
    )
    expect(plan.groups.map((g) => g.key)).toEqual(['PRO05|blanco', 'PRO01|blanco'])
    expect(plan.groups[0]).toMatchObject({ code: 'PRO05', name: 'Junquillo', colorId: 'blanco', pieces: 3 })
    expect(plan.groups[1]).toMatchObject({ code: 'PRO01', pieces: 2 })
  })

  it('sin metadatos toma código y color de la clave «código|color»', () => {
    const plan = optimizeCuts([{ key: 'R1|', length: 900, qty: 1, label: 'ref' }, { key: 'PRO03|nogal', length: 900, qty: 1, label: 't' }], NO_TRIM)
    expect(plan.groups[0].code).toBe('R1')
    expect(plan.groups[0].colorId).toBeUndefined()
    expect(plan.groups[1]).toMatchObject({ code: 'PRO03', colorId: 'nogal' })
  })

  it('respeta el largo de barra propio del perfil', () => {
    const plan = optimizeCuts([piece(3000, 2, { barLength: 6500 })], NO_TRIM)
    expect(plan.totalBars).toBe(1)
    expect(plan.groups[0].bars[0].barLength).toBe(6500)
  })

  it('es determinista: el orden de entrada no cambia el plan', () => {
    const pieces = [piece(2246, 2, { label: 'V1 · izq' }), piece(1006, 3, { label: 'V2 · arr' }), piece(862, 2, { label: 'V3 · arr' }), piece(1500, 1, { label: 'V4 · der' })]
    const a = optimizeCuts(pieces, SAW)
    const b = optimizeCuts([...pieces].reverse(), SAW)
    expect(b.groups.map((g) => g.bars.map((bar) => bar.cuts.map((c) => `${c.length}:${c.label}`)))).toEqual(
      a.groups.map((g) => g.bars.map((bar) => bar.cuts.map((c) => `${c.length}:${c.label}`))),
    )
  })

  it('lista los sobrantes reutilizables (≥ mínimo) y conserva ref y ángulos', () => {
    const plan = optimizeCuts([piece(2000, 1, { ref: 'V1', angleStart: 45, angleEnd: 90 })], NO_TRIM)
    expect(plan.offcuts).toEqual([{ key: 'PRO01|blanco', length: 3796 }])
    expect(plan.groups[0].bars[0].cuts[0]).toMatchObject({ ref: 'V1', angleStart: 45, angleEnd: 90, offset: 0 })
    const small = optimizeCuts([piece(5500)], NO_TRIM)
    expect(small.offcuts).toEqual([])
  })

  it('ignora piezas inválidas con aviso y nunca lanza', () => {
    const plan = optimizeCuts([piece(0), piece(Number.NaN), piece(1000, 0), piece(1000, 1)], { barLength: -1, kerf: -3 } as CutSettings)
    expect(plan.totalPieces).toBe(1)
    expect(plan.warnings.some((w) => w.code === 'invalid_piece')).toBe(true)
    expect(plan.groups[0].bars[0].barLength).toBe(5800)
  })

  it('grupos grandes usan BFD y responden rápido', () => {
    const many = Array.from({ length: 60 }, (_, i) => piece(400 + ((i * 137) % 1900), 2, { label: `V${i}` }))
    const t0 = Date.now()
    const plan = optimizeCuts(many, SAW)
    expect(Date.now() - t0).toBeLessThan(500)
    const total = many.reduce((s, p) => s + (p.length + 4) * p.qty, 0)
    expect(plan.totalBars).toBeGreaterThanOrEqual(Math.ceil(total / 5770))
    expect(plan.totalPieces).toBe(120)
  })
})
