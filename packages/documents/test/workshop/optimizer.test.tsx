/**
 * El optimizador contra una sierra de verdad: casos reales de obra y miles de planes al azar. La
 * vara es `auditCutPlan`: ninguna barra se sobrepasa, ninguna pieza se pisa, ninguna es imposible,
 * sale exactamente lo que pide la OT y las barras no son más que las que hacen falta.
 */
import { describe, expect, it } from 'vitest'
import { buildWorkshopData, computeBom, createAssembly, createDesign, optimizeCuts, type Bar, type CutSettings, type WorkshopWindow } from '@dekopen/engine'
import { auditCutPlan, barGeometry, barPieceIds, kerfAlongBar, sampleWorkshopCatalog, shortFace, workshopPieceCodes, type WorkshopDocumentData } from '../../src/workshop'

const catalog = sampleWorkshopCatalog()
const GLASS = 'dvh-4124'
const CUT: CutSettings = { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 }

function workshop(items: { ref: string; qty?: number; typology: string; lineId?: string; width: number; height: number; colorId?: string }[], cut: Partial<CutSettings> = CUT): WorkshopDocumentData {
  const quote = {
    items: items.map((i, n) => ({
      id: `i${n}`,
      ref: i.ref,
      qty: i.qty ?? 1,
      design: createDesign(i.typology, { lineId: i.lineId ?? 'andino-60', width: i.width, height: i.height, colorId: i.colorId ?? 'blanco', glassId: GLASS }),
    })),
    extras: [],
    discountPct: 0,
  }
  return { ...buildWorkshopData(quote, catalog, {}, cut), catalog, org: { name: 'Taller' }, quote: { number: 1, title: 'Obra' }, workOrder: { number: 1, date: '2026-11-06' } }
}

/** Generador con semilla: el mismo plan falla siempre igual. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const usedOf = (bar: Bar) => bar.cuts.reduce((s, c) => s + c.length, 0)

describe('Casos reales de obra', () => {
  // Medidas de la obra de referencia, con la pauta de 60 mm: soldadura 3 por extremo.
  const real = workshop([
    { ref: 'V7', typology: 'casement_double', width: 1193, height: 1350 },
    { ref: 'V8', typology: 'fixed_casement', width: 1193, height: 1358 },
    { ref: 'V9', typology: 'fixed', width: 2385, height: 900, colorId: 'antracita' },
    { ref: 'V3', qty: 2, typology: 'sliding_2', lineId: 'andino-c70', width: 1475, height: 1135 },
  ])

  it('el plan real pasa la auditoría completa', () => {
    expect(auditCutPlan(real)).toEqual([])
  })

  it('cada pieza del despiece sale una sola vez, con su código de la OT', () => {
    const ids = barPieceIds(real)
    const seen = new Set<string>()
    for (const group of real.optimization.groups) {
      group.bars.forEach((bar, b) =>
        bar.cuts.forEach((cut, c) => {
          const id = ids.get(group.key)?.[b]?.[c]
          expect(id, `${group.code} barra ${b + 1} pieza ${c + 1}`).toBeDefined()
          const key = `${id?.code}:${id?.unit}`
          expect(seen.has(key), key).toBe(false)
          seen.add(key)
        }),
      )
    }
    const physical = real.windows.reduce((s, w) => s + workshopPieceCodes(w).length * w.qty, 0)
    expect(seen.size).toBe(physical)
    expect(seen.size).toBe(real.optimization.totalPieces)
  })

  it('con la barra de 5.800 y disco 4 repite los sobrantes de la sierra real', () => {
    // 1481 + 1481 + 1141 + 1141 = 5244; 4 cortes de disco: el taller ve 5800 − 5244 − 16 = 540.
    const plan = optimizeCuts([{ key: 'p', length: 1481, qty: 2, label: 'a' }, { key: 'p', length: 1141, qty: 2, label: 'b' }], CUT)
    expect(plan.groups[0]?.bars).toHaveLength(1)
    expect(plan.groups[0]?.bars[0]?.remainder).toBe(540)
  })

  it('un conjunto de ventanas corta sus acoples como piezas propias', () => {
    const design = createAssembly('coupled_2', { lineId: 'andino-60', colorId: 'blanco', glassId: GLASS }, catalog)
    const data = { ...workshop([]), windows: [] as WorkshopWindow[] }
    const quote = { items: [{ id: 'a', ref: 'V1', qty: 1, design }], extras: [], discountPct: 0 }
    const built = { ...data, ...buildWorkshopData(quote, catalog, {}, CUT) }
    expect(computeBom(design, catalog).assembly).toBeDefined()
    expect(auditCutPlan(built).filter((i) => i.code !== 'special_bar')).toEqual([])
  })
})

describe('Planes al azar: nunca se sobrepasa una barra', () => {
  it('2.000 planes con barra, disco y despuntes distintos', () => {
    let oversize = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const r = rng(seed)
      const cut: CutSettings = {
        barLength: [5800, 6000, 6500, 4000][Math.floor(r() * 4)]!,
        kerf: Math.round(r() * 80) / 10,
        trimStart: Math.round(r() * 50),
        trimEnd: Math.round(r() * 50),
        minReusable: 500,
      }
      const pieces = Array.from({ length: 1 + Math.floor(r() * 24) }, (_, i) => ({
        key: r() < 0.5 ? 'a|blanco' : 'b|blanco',
        length: Math.round((30 + r() * r() * 6200) * 10) / 10,
        qty: 1 + Math.floor(r() * 4),
        label: `V${i}`,
        ref: `V${i}`,
      }))
      const plan = optimizeCuts(pieces, cut)
      const asked = pieces.reduce((s, p) => s + p.qty, 0)
      const cuts = plan.groups.reduce((s, g) => s + g.bars.reduce((t, b) => t + b.cuts.length, 0), 0)
      expect(cuts, `semilla ${seed}: piezas perdidas`).toBe(asked)
      for (const group of plan.groups) {
        for (const bar of group.bars) {
          const geo = barGeometry(bar, cut)
          // Solo una pieza que por sí sola no cabe puede pedir una barra más larga, y siempre con aviso.
          if (bar.barLength > cut.barLength) {
            oversize++
            expect(bar.cuts).toHaveLength(1)
            expect(plan.warnings.some((w) => w.code === 'piece_too_long')).toBe(true)
          }
          expect(geo.trimStart, `semilla ${seed}`).toBeCloseTo(cut.trimStart, 5)
          expect(geo.piecesEnd + geo.trimEnd, `semilla ${seed}: barra sobrepasada`).toBeLessThanOrEqual(bar.barLength + 0.051)
          expect(usedOf(bar) + bar.kerfLoss + bar.remainder + cut.trimStart + cut.trimEnd, `semilla ${seed}: el balance no cierra`).toBeCloseTo(bar.barLength, 0)
          bar.cuts.forEach((c, i) => {
            const prev = bar.cuts[i - 1]
            if (prev) expect(c.offset + 0.051, `semilla ${seed}: piezas pisadas`).toBeGreaterThanOrEqual(prev.offset + prev.length + cut.kerf)
          })
        }
      }
    }
    expect(oversize).toBeGreaterThan(0)
  })

  it('nunca usa más barras que un plan voraz simple, y es determinista', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed * 7)
      const pieces = Array.from({ length: 3 + Math.floor(r() * 40) }, (_, i) => ({ key: 'k', length: 200 + Math.floor(r() * 2800), qty: 1, label: `P${i}` }))
      const plan = optimizeCuts(pieces, CUT)
      const again = optimizeCuts([...pieces].reverse(), CUT)
      expect(plan.totalBars).toBe(again.totalBars)
      let bars = 1
      let room = CUT.barLength
      for (const p of pieces) {
        if (p.length + CUT.kerf > room) {
          bars++
          room = CUT.barLength
        }
        room -= p.length + CUT.kerf
      }
      expect(plan.totalBars).toBeLessThanOrEqual(bars)
      const total = pieces.reduce((s, p) => s + p.length + CUT.kerf, 0)
      expect(plan.totalBars).toBeGreaterThanOrEqual(Math.ceil(total / CUT.barLength))
    }
  })

  it('usa primero los retazos y no los inventa', () => {
    const offcut = { key: 'k', length: 1600 }
    const plan = optimizeCuts([{ key: 'k', length: 1500, qty: 1, label: 'a' }, { key: 'k', length: 1500, qty: 1, label: 'b' }], CUT, [offcut])
    const bars = plan.groups[0]!.bars
    expect(bars.filter((b) => b.fromOffcut)).toHaveLength(1)
    expect(bars.find((b) => b.fromOffcut)?.barLength).toBe(1600)
    expect(plan.totalBars).toBe(1)
  })
})

describe('El disco en inglete', () => {
  it('500 planes de marcos a 45°: ninguna barra se pasa y la auditoría queda limpia', () => {
    let tight = 0
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed)
      const pieces = Array.from({ length: 4 + Math.floor(r() * 12) }, (_, i) => {
        const w = 600 + Math.round(r() * 1500)
        const h = 600 + Math.round(r() * 1500)
        return [
          { key: 'a', length: w + 6, qty: 2, label: `V${i} · a`, ref: `V${i}`, angleStart: 45, angleEnd: 45 },
          { key: 'a', length: h + 6, qty: 2, label: `V${i} · b`, ref: `V${i}`, angleStart: 45, angleEnd: 45 },
        ]
      }).flat()
      const plan = optimizeCuts(pieces, CUT)
      for (const bar of plan.groups[0]!.bars) {
        const geo = barGeometry(bar, CUT)
        expect(geo.kerf, `semilla ${seed}`).toBe(CUT.kerf)
        let needed = geo.trimStart
        bar.cuts.forEach((c, i) => {
          needed += c.length
          if (i < bar.cuts.length - 1) needed += kerfAlongBar(geo.kerf, c.angleEnd)
        })
        expect(needed, `semilla ${seed}: barra pasada`).toBeLessThanOrEqual(bar.barLength)
        if (bar.barLength - needed < 8) tight++
      }
      const data = { windows: [] as WorkshopWindow[], cut: CUT, catalog, optimization: plan }
      expect(auditCutPlan(data).filter((i) => i.code === 'miter_kerf' || i.code === 'overlap' || i.code === 'overflow'), `semilla ${seed}`).toEqual([])
    }
    // La prueba tiene sentido solo si hubo barras apretadas.
    expect(tight).toBeGreaterThan(0)
  })

  it('cuatro piezas que solo cabían contando el disco recto pasan a dos barras', () => {
    const miter = { key: 'a', length: 1446, qty: 4, label: 'p', angleStart: 45, angleEnd: 45 }
    expect(optimizeCuts([miter], CUT).groups[0]?.bars).toHaveLength(2)
    expect(optimizeCuts([{ ...miter, angleStart: 90, angleEnd: 90 }], CUT).groups[0]?.bars).toHaveLength(1)
  })

  it('cobra según el corte final de cada pieza y deja los rectos igual', () => {
    const plan = optimizeCuts([{ key: 'a', length: 1000, qty: 1, label: 'x', angleStart: 90, angleEnd: 45 }, { key: 'a', length: 900, qty: 1, label: 'y', angleStart: 90, angleEnd: 90 }], CUT)
    const [first, second] = plan.groups[0]!.bars[0]!.cuts
    expect(second!.offset - first!.offset - first!.length).toBeCloseTo(5.7, 5)
    expect(plan.groups[0]!.bars[0]!.kerfLoss).toBeCloseTo(9.7, 5)
  })

  it('el disco de la barra se lee bien también con discos delgados y ángulos raros', () => {
    for (const kerf of [0.5, 2, 3, 4, 4.5, 8]) {
      const cut = { ...CUT, kerf }
      const plan = optimizeCuts([{ key: 'a', length: 700, qty: 3, label: 'x', angleStart: 45, angleEnd: 31.7 }, { key: 'a', length: 500, qty: 1, label: 'y', angleStart: 90, angleEnd: 90 }], cut)
      expect(barGeometry(plan.groups[0]!.bars[0]!, cut).kerf).toBe(kerf)
    }
  })
})

describe('Geometría de la sierra', () => {
  it('a 45° un disco de 4 mm ocupa 5,66 mm a lo largo de la barra; recto, 4', () => {
    expect(kerfAlongBar(4, 45)).toBeCloseTo(5.657, 3)
    expect(kerfAlongBar(4, 90)).toBe(4)
    expect(kerfAlongBar(4, undefined)).toBe(4)
  })

  const miterData = (lengths: number[], barLength = 5800): Parameters<typeof auditCutPlan>[0] => {
    let cursor = 0
    const cuts = lengths.map((length, i) => {
      const c = { length, label: `V1 · p${i}`, ref: 'V1', offset: cursor, angleStart: 45, angleEnd: 45 }
      cursor += length + 4
      return c
    })
    const used = lengths.reduce((a, b) => a + b, 0)
    // Disco 4 a 45° (5,7 por pieza), pero repartido como recto: lo que hacía el plan antiguo.
    const bar: Bar = { key: 'x|', barLength, fromOffcut: false, cuts, used, kerfLoss: lengths.length * 5.7, remainder: Math.max(0, barLength - used - lengths.length * 4), yieldPct: 0 }
    return {
      windows: [],
      cut: CUT,
      catalog,
      optimization: { groups: [{ key: 'x|', code: 'X', name: 'X', bars: [bar], pieces: lengths.length, yieldPct: 0, barsNeeded: 1 }], totalBars: 1, totalPieces: lengths.length, yieldPct: 0, offcuts: [] },
    }
  }

  it('detecta la barra que solo cabe si el disco a 45° se cuenta como recto', () => {
    // 4 × 1.446 + 16 de disco = 5.800 justos; con 3 cortes en inglete de 5,66 mm faltan 0,97.
    const issues = auditCutPlan(miterData([1446, 1446, 1446, 1446])).filter((i) => i.code === 'miter_kerf')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.short).toBeCloseTo(1, 0)
    // Con una pieza menos sobra de todo.
    expect(auditCutPlan(miterData([1446, 1446, 1446])).filter((i) => i.code === 'miter_kerf')).toEqual([])
  })

  it('un inglete doble más corto que el ancho del perfil es una pieza imposible', () => {
    expect(shortFace(120, 64, 45, 45)).toBeCloseTo(-8, 5)
    expect(shortFace(1200, 64, 45, 45)).toBeCloseTo(1072, 5)
    expect(shortFace(120, 64, 90, 90)).toBe(120)
    expect(shortFace(120, undefined, 45, 45)).toBeNull()
    const data = workshop([{ ref: 'V1', typology: 'fixed', width: 1000, height: 1000 }])
    const group = data.optimization.groups[0]!
    const tiny = { ...group, bars: [{ ...group.bars[0]!, cuts: [{ ...group.bars[0]!.cuts[0]!, length: 100 }] }] }
    const issues = auditCutPlan({ ...data, optimization: { ...data.optimization, groups: [tiny] } })
    expect(issues.some((i) => i.code === 'collapsed_miter')).toBe(true)
  })

  it('una pieza que no cabe en la barra se marca como barra especial', () => {
    const data = workshop([{ ref: 'V1', typology: 'fixed', width: 6200, height: 900 }])
    const issues = auditCutPlan(data)
    expect(issues.some((i) => i.code === 'special_bar')).toBe(true)
  })

  it('el despunte y el disco efectivos se leen de la barra, no de los ajustes', () => {
    const bar: Bar = { key: 'k', barLength: 5800, fromOffcut: false, cuts: [{ length: 1000, label: 'a', offset: 20 }, { length: 1000, label: 'b', offset: 1025 }], used: 2000, kerfLoss: 10, remainder: 3770, yieldPct: 34 }
    const geo = barGeometry(bar, CUT)
    expect(geo.trimStart).toBe(20)
    expect(geo.kerf).toBe(5)
    expect(geo.remainderStart).toBe(2030)
    expect(geo.reusable).toBe(true)
  })
})
