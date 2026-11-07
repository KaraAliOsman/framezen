import { describe, expect, it } from 'vitest'
import { buildWorkshopData, computeBom, computeLayout, createDesign, lineFrameAddons } from '../../src'
import type { Catalog, CutPiece, Line, Profile, WindowDesign } from '../../src/types'
import { manufacturerCatalog } from './fixtures'

/**
 * Casos de `docs/build/v7-datos.md` («Para MOTOR»): plantilla Proline PRO6004 con soldadura 2,5, salvo
 * la puerta con elevación (p. 24), que es a soldadura 3.
 */

const LINE = 'pro6004-fab'
const base = { lineId: LINE, colorId: 'blanco', glassId: 'dvh-4-12-4' }
const price = { blanco: 10000, winchester: 10000, antracita: 10000 }

const prof = (id: string, role: Profile['role'], name: string, extra: Partial<Profile> = {}): Profile => ({ id, lineId: LINE, code: id, name, role, barLength: 5800, priceByColor: price, ...extra })

function catalogWith(patch: Partial<Line>, profiles: Profile[] = []): Catalog {
  const cat = manufacturerCatalog()
  return { ...cat, profiles: [...cat.profiles, ...profiles], lines: cat.lines.map((l) => (l.id === LINE ? { ...l, ...patch, pauta: { ...l.pauta, ...patch.pauta } } : l)) }
}

const FRENCH = [prof('PRO12', 'french_mullion', 'Batiente')]
const lens = (cuts: CutPiece[], code: string) =>
  cuts
    .filter((c) => c.code === code)
    .flatMap((c) => Array.from({ length: c.qty }, () => c.length))
    .sort((a, b) => a - b)
const beads = (cuts: CutPiece[]) =>
  cuts
    .filter((c) => c.kind === 'bead')
    .flatMap((c) => Array.from({ length: c.qty }, () => c.length))
    .sort((a, b) => a - b)

const withFrench = (extra: Partial<Line> = {}) => {
  const cat = manufacturerCatalog()
  const line = cat.lines.find((l) => l.id === LINE)!
  return catalogWith({ ...extra, profiles: { ...line.profiles, french_mullion: 'PRO12' }, pauta: { ...line.pauta, frenchGap: 10, frenchMullionDeduction: 56 } }, FRENCH)
}

describe('1. doble hoja con batiente (plantilla, separación 10 y batiente −56)', () => {
  it('puerta interior 1800 × 2000: hoja 864/1933, batiente 1872, junquillo 679/1748, vidrio 669 × 1738', () => {
    const cat = withFrench()
    const bom = computeBom(createDesign('door_double', { ...base, width: 1800, height: 2000 }), cat)
    expect(lens(bom.cuts, 'PRO04')).toEqual([864, 864, 864, 864, 1933, 1933, 1933, 1933])
    expect(lens(bom.cuts, 'PRO12')).toEqual([1872])
    expect(bom.cuts.find((c) => c.code === 'PRO12')).toMatchObject({ angleStart: 90, angleEnd: 90 })
    expect(beads(bom.cuts)).toEqual([679, 679, 679, 679, 1748, 1748, 1748, 1748])
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([[669, 1738], [669, 1738]])
    expect(bom.warnings.map((w) => w.code)).not.toContain('french_gap_missing')
  })

  it('solo la hoja pasiva lleva batiente', () => {
    const bom = computeBom(createDesign('door_double', { ...base, width: 1800, height: 2000 }), withFrench())
    expect(bom.cuts.filter((c) => c.code === 'PRO12').reduce((n, c) => n + c.qty, 0)).toBe(1)
  })

  it('sin el dato se mantiene lo de antes y se avisa', () => {
    const cat = manufacturerCatalog()
    const line = cat.lines.find((l) => l.id === LINE)!
    const without = catalogWith({ profiles: { ...line.profiles, french_mullion: 'PRO12' } }, FRENCH)
    const bom = computeBom(createDesign('door_double', { ...base, width: 1800, height: 2000 }), without)
    expect(lens(bom.cuts, 'PRO04')[0]).toBe(877)
    expect(bom.warnings.find((w) => w.code === 'french_gap_missing')?.level).toBe('info')
  })
})

describe('2. puerta con solera', () => {
  const lineFor = (gap: number) => {
    const cat = manufacturerCatalog()
    const line = cat.lines.find((l) => l.id === LINE)!
    return catalogWith(
      { profiles: { ...line.profiles, threshold: 'SOL' }, pauta: { ...line.pauta, thresholdGap: gap } },
      [prof('SOL', 'threshold', 'Perfil solera puerta'), prof('EST', 'other', 'Perfil estanquidad agua')],
    )
  }
  const door = (width: number, height: number) => ({ ...createDesign('door', { ...base, width, height }), extras: { threshold: true } }) as WindowDesign

  it('900 × 2000 (pp. 7-8): hoja 1956, solera 812, estanqueidad 828, refuerzo 1946, junquillo 1771, vidrio 1761', () => {
    const bom = computeBom(door(900, 2000), lineFor(13))
    expect(lens(bom.cuts, 'PRO04').slice(-2)).toEqual([1956, 1956])
    expect(lens(bom.cuts, 'SOL')).toEqual([812])
    expect(lens(bom.cuts, 'EST')).toEqual([828])
    expect(bom.cuts.find((c) => c.code === 'EST')).toMatchObject({ angleStart: 90, angleEnd: 90 })
    expect(bom.cuts.find((c) => c.nodeId === 'frame' && c.kind === 'reinforcement' && c.side === 'left')?.length).toBe(1946)
    expect(beads(bom.cuts).slice(-2)).toEqual([1771, 1771])
    expect(bom.glass[0].height).toBe(1761)
  })
})

describe('3. puerta que abre hacia afuera', () => {
  const steel = prof('R3', 'reinforcement', 'Refuerzo PRO10')
  const pro10 = prof('PRO10', 'door_sash', 'Hoja puerta ext.', { reinforcementId: 'R3', face: 102 })
  const out = () => {
    const cat = manufacturerCatalog()
    const line = cat.lines.find((l) => l.id === LINE)!
    return catalogWith(
      {
        doorOutProfileId: 'PRO10',
        doorOutPauta: { sashWidth: 102, sashDeduction: 82, reinforcement: { sash: 190 } },
        profiles: { ...line.profiles, french_mullion: 'PRO12' },
        pauta: { ...line.pauta, frenchGap: 10, frenchMullionDeduction: 56 },
      },
      [...FRENCH, pro10, steel],
    )
  }

  it('usa su hoja y su pauta; la que abre hacia adentro no cambia', () => {
    const cat = out()
    const outward = computeBom(createDesign('door_out', { ...base, width: 900, height: 2000 }), cat)
    expect(outward.cuts.some((c) => c.code === 'PRO10')).toBe(true)
    expect(outward.cuts.some((c) => c.code === 'PRO04')).toBe(false)
    const inward = computeBom(createDesign('door', { ...base, width: 900, height: 2000 }), cat)
    expect(inward.cuts.some((c) => c.code === 'PRO04')).toBe(true)
  })

  it('doble exterior 1800 × 2000: mismas hojas, vidrio 685 × 1754, refuerzo 675/1744', () => {
    const d = createDesign('door_double', { ...base, width: 1800, height: 2000 })
    const root = d.root
    if (root.type !== 'split') throw new Error('esperaba una división')
    const outward: WindowDesign = {
      ...d,
      root: { ...root, children: root.children.map((c) => (c.type === 'leaf' ? { ...c, opening: { ...c.opening, direction: 'out' as const } } : c)) },
    }
    const bom = computeBom(outward, out())
    expect(lens(bom.cuts, 'PRO10')).toEqual([864, 864, 864, 864, 1933, 1933, 1933, 1933])
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([[685, 1754], [685, 1754]])
    expect(lens(bom.cuts, 'R3')).toEqual([675, 675, 675, 675, 1744, 1744, 1744, 1744])
  })

  it('sin hoja exterior en la línea, la puerta usa la de siempre', () => {
    const bom = computeBom(createDesign('door_out', { ...base, width: 900, height: 2000 }), manufacturerCatalog())
    expect(bom.cuts.some((c) => c.code === 'PRO04')).toBe(true)
  })
})

describe('2 bis. puerta con elevación de 35 mm (p. 24, soldadura 3)', () => {
  it('750 × 2040: hoja 684 × 1975, estanqueidad 678, solera 662, vidrio 504 × 1795', () => {
    const cat = manufacturerCatalog()
    const line = cat.lines.find((l) => l.id === LINE)!
    const patched = catalogWith(
      {
        doorOutProfileId: 'PRO10',
        doorOutPauta: { sashWidth: 102, sashDeduction: 82 },
        profiles: { ...line.profiles, threshold: 'SOL' },
        pauta: { ...line.pauta, weld: 3, thresholdGap: 35 },
      },
      [prof('SOL', 'threshold', 'Perfil solera puerta'), prof('EST', 'other', 'Perfil estanquidad agua'), prof('PRO10', 'door_sash', 'Hoja puerta ext.', { face: 102 })],
    )
    const door = { ...createDesign('door_out', { ...base, width: 750, height: 2040 }), extras: { threshold: true } } as WindowDesign
    const bom = computeBom(door, patched)
    expect(lens(bom.cuts, 'PRO10')).toEqual([684, 684, 1975, 1975])
    expect(lens(bom.cuts, 'EST')).toEqual([678])
    expect(lens(bom.cuts, 'SOL')).toEqual([662])
    expect(bom.glass[0]).toMatchObject({ width: 504, height: 1795 })
  })
})

describe('4. refuerzo desde la cota', () => {
  it.each([2.5, 3])('con soldadura %s el acero del marco de 1000 mide 892 (W − 108)', (weld) => {
    const cat = manufacturerCatalog()
    const line = cat.lines.find((l) => l.id === LINE)!
    const bom = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), catalogWith({ pauta: { ...line.pauta, weld } }))
    expect(lens(bom.cuts, 'PRO-R1')).toEqual([892, 892, 892, 892])
  })
})

describe('5. junquillo por espesor de vidrio', () => {
  const beadsFor: Profile[] = [prof('J-20', 'bead', 'Junquillo 20'), prof('J-24', 'bead', 'Junquillo 24')]
  const cat = catalogWith({ provenance: { beads: [{ code: 'J-20', min: 18, max: 22 }, { code: 'J-24', min: 23, max: 26 }] } }, beadsFor)

  it('elige el que calza con el vidrio', () => {
    const bom = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), cat)
    expect(bom.cuts.filter((c) => c.kind === 'bead').every((c) => c.code === 'J-20')).toBe(true)
  })

  it('si ninguno calza, avisa y queda el de la línea', () => {
    const bom = computeBom(createDesign('fixed', { ...base, glassId: 'mono-4', width: 1000, height: 1000 }), cat)
    expect(bom.warnings.find((w) => w.code === 'bead_no_fit')?.level).toBe('warn')
    expect(bom.cuts.filter((c) => c.kind === 'bead').every((c) => c.code === 'PRO05')).toBe(true)
  })
})

describe('6. vidrio y límites del fabricante', () => {
  it('PROSLD60 admite hasta 16 mm: un DVH de 20 no cabe', () => {
    const cat = catalogWith({ provenance: { glazing: { min: 4, max: 16 } } })
    const w = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), cat).warnings.find((x) => x.code === 'glazing_out_of_range')
    expect(w?.message).toBe('PRO6004 (plantilla fabricante) admite vidrios de 4 a 16 mm: uno de 20 mm no cabe.')
  })

  it('una hoja fuera del límite publicado se avisa con sus medidas', () => {
    const cat = catalogWith({ provenance: { limits: [{ opening: 'casement', width: [400, 500], height: [400, 1500] }] } })
    const w = computeBom(createDesign('casement_out', { ...base, width: 700, height: 1300 }), cat).warnings.find((x) => x.code === 'supplier_limit_exceeded')
    expect(w?.params).toMatchObject({ minW: 400, maxW: 500 })
  })
})

describe('7. dos refuerzos en una pieza', () => {
  it('Winsa DJ60: cada acero se corta al largo de la pieza', () => {
    const cat = manufacturerCatalog()
    const a = prof('12070', 'reinforcement', 'Refuerzo 12070')
    const b = prof('13048', 'reinforcement', 'Refuerzo 13048')
    const patched: Catalog = { ...cat, profiles: [...cat.profiles.map((p) => (p.id === 'PRO521' ? { ...p, reinforcementId: '12070', extraReinforcementIds: ['13048'] } : p)), a, b] }
    const bom = computeBom(createDesign('casement_out', { ...base, width: 1000, height: 1000 }), patched)
    expect(lens(bom.cuts, '12070')).toEqual(lens(bom.cuts, '13048'))
    expect(lens(bom.cuts, '13048')).toHaveLength(4)
  })
})

describe('largo de barra: el del perfil, si no el de Ajustes, nunca uno supuesto', () => {
  const noLength = (): Catalog => {
    const cat = manufacturerCatalog()
    return { ...cat, profiles: cat.profiles.map((p) => (p.id === 'PRO01' ? { ...p, barLength: 0 } : p)) }
  }
  const quote = (design: WindowDesign) => ({ items: [{ id: '1', ref: 'V1', qty: 1, design }], extras: [], discountPct: 0 })
  const saw = { barLength: 6500, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 }

  it('sin largo propio la pieza no inventa uno: avisa y el plan usa el de Ajustes', () => {
    const cat = noLength()
    const design = createDesign('fixed', { ...base, width: 1000, height: 1000 })
    const bom = computeBom(design, cat)
    expect(bom.cuts.find((c) => c.code === 'PRO01')?.barLength).toBe(0)
    expect(bom.warnings.find((w) => w.code === 'bar_length_missing')?.params).toEqual({ profile: 'PRO01' })
    const plan = buildWorkshopData(quote(design), cat, {}, saw).optimization
    expect(plan.groups.find((g) => g.code === 'PRO01')?.bars[0].barLength).toBe(6500)
  })

  it('el largo propio del perfil manda sobre Ajustes', () => {
    const cat = manufacturerCatalog()
    const design = createDesign('fixed', { ...base, width: 1000, height: 1000 })
    expect(computeBom(design, cat).warnings.map((w) => w.code)).not.toContain('bar_length_missing')
    const plan = buildWorkshopData(quote(design), cat, {}, saw).optimization
    expect(plan.groups.find((g) => g.code === 'PRO01')?.bars[0].barLength).toBe(5800)
  })
})

describe('arcos sin largo supuesto', () => {
  it('sin largo de barra el arco no se parte según 5800: avisa y queda entero', () => {
    const cat = manufacturerCatalog()
    const noLength = { ...cat, profiles: cat.profiles.map((p) => (p.id === 'PRO01' || p.id === 'PRO05' ? { ...p, barLength: 0 } : p)) }
    const big = createDesign('round', { ...base, width: 4000, height: 4000 })
    const pieces = (c: Catalog, code: string) => computeBom(big, c).cuts.filter((x) => x.code === code).reduce((n, x) => n + x.qty, 0)
    expect(pieces(cat, 'PRO01')).toBeGreaterThan(1)
    expect(pieces(noLength, 'PRO01')).toBeLessThan(pieces(cat, 'PRO01'))
    expect(computeBom(big, noLength).warnings.map((w) => w.code)).toContain('bar_length_missing')
  })

  it('con largo propio, el arco se parte según esa barra', () => {
    const cat = manufacturerCatalog()
    const shorter = { ...cat, profiles: cat.profiles.map((p) => (p.id === 'PRO01' ? { ...p, barLength: 3000 } : p)) }
    const big = createDesign('round', { ...base, width: 4000, height: 4000 })
    const pieces = (c: Catalog) => computeBom(big, c).cuts.filter((x) => x.code === 'PRO01').reduce((n, x) => n + x.qty, 0)
    expect(pieces(shorter)).toBeGreaterThan(pieces(cat))
  })
})

describe('piezas de contorno que ofrece una línea', () => {
  it('solo las que trae, por su nombre; una hoja «vierte agua» no cuenta', () => {
    const cat = manufacturerCatalog()
    const extra = [prof('P78', 'other', 'Premarco pvc 60/70'), prof('P14', 'other', 'Ensanche marco 60/30'), prof('V1', 'other', 'Vierteagua (C2365)'), prof('H1', 'sash', 'Hoja Interior Vierte Agua')]
    const withAll = { ...cat, profiles: [...cat.profiles, ...extra] }
    expect(lineFrameAddons(LINE, withAll).map((a) => [a.kind, a.profiles.map((p) => p.code)])).toEqual([
      ['subframe', ['P78']],
      ['extension', ['P14']],
      ['sill_profile', ['V1']],
    ])
    expect(lineFrameAddons(LINE, cat)).toEqual([])
  })

  it('el vierteaguas se dibuja bajo el marco', () => {
    const cat = manufacturerCatalog()
    const withSill = { ...cat, profiles: [...cat.profiles, prof('V1', 'other', 'Vierteaguas 409')] }
    const d: WindowDesign = { ...createDesign('fixed', { ...base, width: 1000, height: 1000 }), extras: { frameAddons: [{ kind: 'sill_profile', profileId: 'V1' }] } }
    expect(computeLayout(d, withSill).attachments?.sill).toBeDefined()
  })
})
