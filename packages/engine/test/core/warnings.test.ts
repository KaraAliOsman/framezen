import { describe, expect, it } from 'vitest'
import { computeBom, computeLayout, createDesign, ruleQty, setOpening } from '../../src/core'
import type { Bom, Catalog, HardwareRule, Line, WindowDesign } from '../../src/types'
import { design, lengths, PRO6004, PROFILES, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const codes = (bom: Bom) => bom.warnings.map((w) => w.code)
const warning = (bom: Bom, code: string) => bom.warnings.find((w) => w.code === code)

function withLine(patch: Partial<Line>, extra: Partial<Catalog> = {}): Catalog {
  return prolineCatalog({ lines: [{ ...PRO6004, ...patch }], ...extra })
}

describe('nunca bloquea: datos faltantes', () => {
  it('línea inexistente: calcula con la pauta típica y avisa', () => {
    const bom = computeBom(createDesign('fixed', { ...base, lineId: 'nada', width: 1000, height: 1000 }), catalog)
    expect(warning(bom, 'line_missing')?.level).toBe('warn')
    expect(lengths(bom.cuts, { role: 'frame' })).toEqual([[1006, 4]])
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([[902, 902]])
  })

  it('pauta incompleta: usa valores típicos y dice qué falta', () => {
    const cat = withLine({ pauta: { weld: 3, frameDeduction: 44 } as Line['pauta'] })
    const bom = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), cat)
    expect(warning(bom, 'pauta_incomplete')?.message).toBe(
      'A la pauta de PRO6004 le falta ancho de hoja, descuento de hoja, traslapo de hoja, holgura de vidrio y descuento de travesaño: usamos valores típicos de PVC. Revísala en el catálogo.',
    )
    expect(bom.glass[0].width).toBe(902)
  })

  it('catálogo vacío o diseño roto: devuelve resultados parciales sin lanzar', () => {
    const empty = {} as Catalog
    const d = createDesign('sliding_3', base)
    expect(() => computeBom(d, empty)).not.toThrow()
    expect(() => computeLayout(d, empty)).not.toThrow()
    const broken = { ...d, root: undefined } as unknown as WindowDesign
    expect(() => computeBom(broken, catalog)).not.toThrow()
    expect(() => computeLayout(broken, catalog)).not.toThrow()
  })

  it('medidas en cero: error de fabricación, sin cortes', () => {
    const bom = computeBom(design({ width: 0, height: 1000, root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } }), catalog)
    expect(warning(bom, 'size_invalid')?.level).toBe('error')
    expect(bom.cuts).toEqual([])
  })

  it('perfil sin asignar en la línea: el corte se lista sin código', () => {
    const cat = withLine({ profiles: { frame: 'PRO01', sash: 'PRO521', bead: 'PRO05' } })
    const bom = computeBom(createDesign('fixed_casement', base), cat)
    expect(warning(bom, 'profile_missing')?.message).toBe('El travesaño de PRO6004 no está en tu catálogo: la ventana queda fuera del total. Agrégalo en Catálogo.')
    expect(bom.cuts.find((c) => c.role === 'mullion')).toMatchObject({ code: '—', name: 'Travesaño', length: 1200 })
  })

  it('perfil con acero pero sin descuento en la pauta: usa 2·soldadura + 30', () => {
    const cat = withLine({ pauta: { ...PRO6004.pauta, reinforcement: {} } })
    const bom = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), cat)
    expect(lengths(bom.cuts, { code: 'PRO-R1' })).toEqual([[970, 4]])
    expect(warning(bom, 'reinforcement_deduction_missing')?.level).toBe('info')
  })

  it('vidrio fuera del catálogo: se lista sin precio y ofrece uno', () => {
    const bom = computeBom(createDesign('fixed', { ...base, glassId: 'raro' }), catalog)
    expect(bom.glass[0].name).toBe('Vidrio sin definir')
    expect(warning(bom, 'glass_missing')?.fix?.patch).toEqual({ glassId: 'dvh-4-12-4' })
  })

  it('herraje sin precio: queda fuera del total, con aviso', () => {
    const bom = computeBom(createDesign('tilt_turn', { ...base, width: 700, height: 1300 }), catalog)
    expect(warning(bom, 'price_missing_item')?.message).toBe('El herraje sin-precio · Kit oscilobatiente no tiene precio: queda fuera del total.')
  })
})

describe('avisos de fabricación', () => {
  it('hoja fuera del rango de herrajes (alto)', () => {
    const bom = computeBom(createDesign('casement_out', { ...base, width: 600, height: 1000 }), catalog)
    expect(warning(bom, 'hardware_out_of_range')?.message).toBe(
      'No hay herraje de PRO6004 para hojas de 928 mm de alto (cubre hasta 600 y desde 1.200). Queda fuera del total.',
    )
    // Lo que sí calza se lista igual (bisagras, cerraderos, manilla).
    expect(bom.items.map((i) => i.itemId).sort()).toEqual(['A-T19', 'H-B2D', 'H-M1', 'H-R13'])
  })

  it('hoja fuera del rango de herrajes (ancho), con etiqueta de posición', () => {
    const d = createDesign('fixed_casement', { ...base, width: 2200, height: 1350 })
    const bom = computeBom(d, catalog)
    const w = bom.warnings.filter((x) => x.code === 'hardware_out_of_range')
    expect(w).toHaveLength(1)
    expect(w[0].nodeId).toBe('n3')
    expect(w[0].message).toBe('No hay herraje de PRO6004 para hojas de 1.052 mm de ancho (cubre hasta 900). Queda fuera del total.')
  })

  it('línea sin reglas de herrajes: aviso informativo único', () => {
    const bom = computeBom(createDesign('casement_double', base), withLine({ hardwareRules: [] }))
    expect(bom.warnings.filter((w) => w.code === 'hardware_missing')).toHaveLength(1)
  })

  it('apertura sin herrajes en la línea', () => {
    const rules: HardwareRule[] = PRO6004.hardwareRules.filter((r) => !r.openings.includes('tilt_turn'))
    const bom = computeBom(createDesign('tilt_turn', base), withLine({ hardwareRules: rules }))
    expect(warning(bom, 'hardware_missing')?.message).toBe(
      'PRO6004 no tiene herrajes para oscilobatientes: la ventana queda fuera del total hasta agregarlos en el catálogo.',
    )
  })

  it('paño muy chico y paño imposible', () => {
    const small = design({
      width: 1000,
      height: 1000,
      root: {
        id: 'n1',
        type: 'split',
        dir: 'vertical',
        sizes: [200, 800],
        children: [
          { id: 'a', type: 'leaf', opening: { kind: 'fixed' } },
          { id: 'b', type: 'leaf', opening: { kind: 'fixed' } },
        ],
      },
    })
    const s = computeBom(small, catalog)
    expect(warning(s, 'pane_small')?.message).toBe(
      'El paño fijo izquierdo queda con un vidrio de 126 mm de ancho: es muy chico para fabricarlo y sellarlo bien.',
    )
    const impossible = { ...small, root: { ...small.root, sizes: [50, 950] } } as WindowDesign
    const i = computeBom(impossible, catalog)
    expect(warning(i, 'pane_impossible')).toMatchObject({ level: 'error', nodeId: 'a' })
    expect(i.glass.map((g) => g.nodeId)).toEqual(['b'])
  })

  it('vidrio grande: DVH sobre 2,6 m² y monolítico 4 mm sobre 1,8 m² (con corrección)', () => {
    const big = computeBom(createDesign('fixed', { ...base, width: 1800, height: 1700 }), catalog)
    expect(warning(big, 'glass_too_big')?.message).toBe(
      'El termopanel del paño fijo mide 2,73 m²: sobre 2,6 m² es muy pesado para manipular e instalar. Divide el paño con un travesaño.',
    )
    const mono = computeBom(createDesign('fixed', { ...base, glassId: 'mono-4', width: 1500, height: 1400 }), catalog)
    expect(warning(mono, 'glass_too_big')?.fix).toEqual({ label: 'Usar DVH 4+12+4', key: 'use', params: { name: 'DVH 4+12+4' }, patch: { glassId: 'dvh-4-12-4' } })
  })

  it('forma especial con hoja: se calcula sobre el rectángulo y ofrece dejarla fija', () => {
    const d = setOpening(createDesign('trapezoid', base), 'n1', { kind: 'casement', hinge: 'left' })
    const bom = computeBom(d, catalog)
    expect(warning(bom, 'shape_not_fixed')?.fix).toEqual({
      label: 'Dejar como paño fijo',
      key: 'make_fixed',
      patch: { root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } },
    })
  })

  it('color que la línea no fabrica: propone el primero disponible', () => {
    const bom = computeBom(createDesign('sliding_2', { ...base, lineId: 'prosld70', colorId: 'antracita' }), catalog)
    expect(warning(bom, 'color_not_in_line')).toMatchObject({
      message: 'PROSLD70 no se fabrica en Antracita: revisa el color o la línea.',
      fix: { label: 'Usar Blanco', patch: { colorId: 'blanco' } },
    })
  })

  it('línea de otro tipo: avisa y ofrece convertir', () => {
    const bom = computeBom(createDesign('sliding_2', base), catalog)
    const w = warning(bom, 'line_kind_mismatch')
    expect(w?.message).toBe('PRO6004 es una línea practicable y esta ventana es corredera: los cortes pueden no corresponder.')
    expect(w?.fix?.patch.root?.type).toBe('split')
  })

  it('unión francesa entre fijos: se calcula con travesaño', () => {
    const d = createDesign('fixed_3', base)
    const french = { ...d, root: { ...d.root, joint: 'french' } } as WindowDesign
    const bom = computeBom(french, catalog)
    expect(codes(bom)).toContain('french_needs_sashes')
    expect(lengths(bom.cuts, { role: 'mullion' })).toEqual([[1000, 2]])
  })

  it('monorriel: aviso informativo de medidas estimadas', () => {
    const bom = computeBom(createDesign('sliding_mono', { ...base, lineId: 'prosld70' }), catalog)
    expect(warning(bom, 'sliding_mono_estimated')?.level).toBe('info')
    expect(bom.warnings.filter((w) => w.level !== 'info')).toEqual([])
  })

  it('los avisos no se repiten', () => {
    const bom = computeBom(createDesign('casement_fixed_casement', { ...base, colorId: 'antracita' }), catalog)
    const keys = bom.warnings.map((w) => `${w.code}|${w.nodeId ?? ''}|${w.message}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('puertas, inversor y reglas por paso', () => {
  it('puerta con umbral: dintel 45/45, jambas 45/90 y umbral entre jambas', () => {
    const threshold = { id: 'UMB', lineId: 'pro6004', code: 'UMB-AL', name: 'Umbral aluminio', role: 'threshold' as const, barLength: 5800, priceByColor: { blanco: 9000 } }
    const cat = withLine({ profiles: { ...PRO6004.profiles, threshold: 'UMB' } }, { profiles: [...PROFILES, threshold] })
    const door = createDesign('door', { ...base, width: 900, height: 2100 })
    const asked = { ...door, extras: { threshold: true } } as WindowDesign
    const bom = computeBom(asked, cat)
    const frame = bom.cuts.filter((c) => c.nodeId === 'frame' && c.kind === 'profile').map((c) => [c.code, c.length, c.qty, c.angleStart, c.angleEnd, c.label])
    expect(frame).toEqual([
      ['PRO01', 906, 1, 45, 45, 'arr'],
      ['PRO01', 2103, 2, 45, 90, 'izq/der'],
      ['UMB-AL', 812, 1, 90, 90, 'umbral'],
    ])
    expect(computeLayout(asked, cat).sashes[0].handle).toBe('right')
    // Sin pedirlo: marco completo como la puerta balconera de la OT 385 (V1), aunque la línea tenga umbral.
    expect(lengths(computeBom(door, cat).cuts, { code: 'PRO01' })).toEqual([[906, 2], [2106, 2]])
    // Pedido en una línea sin umbral: marco completo y aviso informativo.
    expect(computeBom(asked, catalog).warnings.find((w) => w.code === 'threshold_missing')?.level).toBe('info')
  })

  it('unión francesa con inversor: en la hoja pasiva, largo = alto nominal', () => {
    const inv = { id: 'INV', lineId: 'pro6004', code: 'INV-01', name: 'Inversor', role: 'french_mullion' as const, barLength: 5800, priceByColor: { blanco: 15000 } }
    const cat = withLine({ profiles: { ...PRO6004.profiles, french_mullion: 'INV' } }, { profiles: [...PROFILES, inv] })
    const bom = computeBom(createDesign('casement_double', { ...base, width: 1200, height: 1300 }), cat)
    expect(bom.cuts.filter((c) => c.code === 'INV-01').map((c) => [c.nodeId, c.length, c.qty])).toEqual([['n2', 1228, 1]])
    expect(lengths(bom.cuts, { role: 'mullion' })).toEqual([])
    expect(codes(bom)).not.toContain('profile_missing')
  })

  it('cantidad por paso de alto (umbral exacto, como la versión anterior)', () => {
    const rule: HardwareRule = { id: 'b', openings: ['casement'], itemId: 'x', qty: 2, minHeight: 800, perStep: { stepMm: 600, qty: 1 } }
    expect([800, 800.1, 1400, 1400.1].map((h) => ruleQty(rule, h))).toEqual([2, 3, 3, 4])
  })
})

describe('totales', () => {
  it('área, perímetro y peso estimado', () => {
    const bom = computeBom(createDesign('fixed', { ...base, width: 1000, height: 1000 }), catalog)
    expect(bom.area).toBe(1)
    expect(bom.perimeter).toBe(4)
    // Perfiles 4,024 m × 1,2 + junquillo 3,648 × 0,2 + acero 3,568 × 1,7 + vidrio 0,8136 × 20.
    expect(bom.weightKg).toBe(27.9)
  })
})
