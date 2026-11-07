import { describe, expect, it } from 'vitest'
import { computeBom, createDesign } from '../../src/core'
import type { Bom, DesignNode } from '../../src/types'
import { design, lengths, manufacturerCatalog, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()

const glassOf = (bom: Bom, nodeId: string) => bom.glass.filter((g) => g.nodeId === nodeId).map((g) => [g.width, g.height])
const itemQty = (bom: Bom, itemId: string) => bom.items.filter((i) => i.itemId === itemId).reduce((a, i) => a + i.qty, 0)

describe('OT 385 · ítem 04: dos hojas exteriores PRO521, 1193 × 1350', () => {
  // La extracción de v3 (data/proline-v3.json) modela ambas hojas como TURN; la OT 385 (V7, research 06)
  // dibuja la derecha como proyectante y le asigna cremona 400-600 a lo ancho. Las cifras de corte son
  // idénticas; seguimos la OT para los herrajes.
  const root: DesignNode = {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [596.5, 596.5],
    children: [
      { id: 'l', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'out' } },
      { id: 'r', type: 'leaf', opening: { kind: 'awning', direction: 'out' } },
    ],
  }
  const bom = computeBom(design({ width: 1193, height: 1350, root }), catalog)

  it('marco, travesaño, hojas y junquillos', () => {
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([[1199, 2], [1356, 2]])
    expect(lengths(bom.cuts, { code: 'PRO03' })).toEqual([[1350, 1]])
    expect(lengths(bom.cuts, { code: 'PRO521', nodeId: 'l' })).toEqual([[554.5, 2], [1284, 2]])
    expect(lengths(bom.cuts, { code: 'PRO521', nodeId: 'r' })).toEqual([[554.5, 2], [1284, 2]])
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'l' })).toEqual([[428.5, 2], [1158, 2]])
  })

  it('ángulos: marco y hoja a 45°, travesaño a 90°', () => {
    const frame = bom.cuts.find((c) => c.code === 'PRO01')!
    const mullion = bom.cuts.find((c) => c.code === 'PRO03')!
    expect([frame.angleStart, frame.angleEnd]).toEqual([45, 45])
    expect([mullion.angleStart, mullion.angleEnd]).toEqual([90, 90])
  })

  it('refuerzos: marco corte − 114, travesaño − 20, hoja PRO521 corte − 146', () => {
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'frame' })).toEqual([[1085, 2], [1242, 2]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'n1' })).toEqual([[1330, 1]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'l' })).toEqual([[408.5, 2], [1138, 2]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'r' })).toEqual([[408.5, 2], [1138, 2]])
    expect(bom.cuts.find((c) => c.kind === 'reinforcement' && c.nodeId === 'l')?.code).toBe('PRO-R19')
  })

  it('vidrios 418,5 × 1148 en ambas hojas', () => {
    expect(glassOf(bom, 'l')).toEqual([[418.5, 1148]])
    expect(glassOf(bom, 'r')).toEqual([[418.5, 1148]])
  })

  it('herrajes como la OT: cremonas 1200-1400 y 400-600, 3 bisagras, 5 cerraderos, 2 manillas', () => {
    expect(itemQty(bom, 'H-C12')).toBe(1)
    expect(itemQty(bom, 'H-C04')).toBe(1)
    expect(itemQty(bom, 'H-B2D')).toBe(3)
    expect(itemQty(bom, 'H-R13')).toBe(5)
    expect(itemQty(bom, 'H-M1')).toBe(2)
  })

  it('tornillos de refuerzo: Σ ceil(acero/1000 × 4) por pieza', () => {
    // 1085→5×2, 1242→5×2, 1330→6, 408,5→2×4, 1138→5×4 = 54
    expect(itemQty(bom, 'A-T19')).toBe(54)
  })

  it('sin avisos de fabricación', () => {
    expect(bom.warnings.filter((w) => w.level !== 'info')).toEqual([])
  })
})

describe('OT 385 · ítem 05: fijo + hoja interior PRO02, 1193 × 1358', () => {
  const root: DesignNode = {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [596.5, 596.5],
    children: [
      { id: 'fix', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'turn', type: 'leaf', opening: { kind: 'casement', hinge: 'right', direction: 'in' } },
    ],
  }
  const bom = computeBom(design({ width: 1193, height: 1358, root }), catalog)

  it('cortes', () => {
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([[1199, 2], [1364, 2]])
    expect(lengths(bom.cuts, { code: 'PRO03' })).toEqual([[1358, 1]])
    expect(lengths(bom.cuts, { code: 'PRO02', nodeId: 'turn' })).toEqual([[554.5, 2], [1292, 2]])
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'fix' })).toEqual([[532.5, 2], [1270, 2]])
  })

  it('junquillo de la hoja PRO02 = nominal − 107 (cifras de la OT, no las del motor v3)', () => {
    // v3 calculaba 428,5 / 1166 (xfail); la OT 385 imprime 441,5 / 1179.
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'turn' })).toEqual([[441.5, 2], [1179, 2]])
  })

  it('refuerzos (PRO02 corte − 64,8)', () => {
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'frame' })).toEqual([[1085, 2], [1250, 2]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'n1' })).toEqual([[1338, 1]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'turn' })).toEqual([[489.7, 2], [1227.2, 2]])
  })

  it('vidrios', () => {
    expect(glassOf(bom, 'fix')).toEqual([[522.5, 1260]])
    expect(glassOf(bom, 'turn')).toEqual([[418.5, 1156]])
  })

  it('el acero de PRO02 sin código queda como «REF» con aviso informativo', () => {
    expect(bom.cuts.find((c) => c.kind === 'reinforcement' && c.nodeId === 'turn')?.code).toBe('REF')
    expect(bom.warnings.some((w) => w.code === 'reinforcement_profile_missing' && w.level === 'info')).toBe(true)
  })
})

describe('OT 385 · dos fijos 2385 × 900 (Antracita)', () => {
  const root: DesignNode = {
    id: 'n1',
    type: 'split',
    dir: 'vertical',
    sizes: [1192.5, 1192.5],
    children: [
      { id: 'f1', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'f2', type: 'leaf', opening: { kind: 'fixed' } },
    ],
  }
  const bom = computeBom(design({ width: 2385, height: 900, colorId: 'antracita', root }), catalog)

  it('marco, junquillos, refuerzos y vidrios', () => {
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([[906, 2], [2391, 2]])
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'f1' })).toEqual([[812, 2], [1128.5, 2]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'frame' })).toEqual([[792, 2], [2277, 2]])
    expect(glassOf(bom, 'f1')).toEqual([[1118.5, 802]])
    expect(glassOf(bom, 'f2')).toEqual([[1118.5, 802]])
  })

  it('corrige la omisión de la OT: corta el travesaño (900) y su refuerzo (880)', () => {
    expect(lengths(bom.cuts, { code: 'PRO03' })).toEqual([[900, 1]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'n1' })).toEqual([[880, 1]])
  })

  it('2 conectores metálicos por su travesaño (research T06; la OT 385 los omitió)', () => {
    expect(itemQty(bom, 'A-CT')).toBe(2)
  })

  it('PRO03 no tiene precio en Antracita: avisa que queda fuera del total', () => {
    expect(bom.warnings.find((w) => w.code === 'price_missing_profile')?.message).toBe(
      'El perfil PRO03 no tiene precio en Antracita: queda fuera del total.',
    )
  })
})

describe('OT 385 · V1 puerta balconera PRO04 + fijo superior, 856 × 2240 (Winchester)', () => {
  const root: DesignNode = {
    id: 'n1',
    type: 'split',
    dir: 'horizontal',
    sizes: [400, 1840],
    children: [
      { id: 'top', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'door', type: 'leaf', opening: { kind: 'door', hinge: 'right', direction: 'in' } },
    ],
  }
  const bom = computeBom(design({ width: 856, height: 2240, colorId: 'winchester', root }), catalog)

  it('marco completo (la línea no tiene umbral), travesaño y hoja de puerta', () => {
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([[862, 2], [2246, 2]])
    expect(lengths(bom.cuts, { code: 'PRO03' })).toEqual([[856, 1]])
    expect(lengths(bom.cuts, { code: 'PRO04' })).toEqual([[790, 2], [1798, 2]])
  })

  it('junquillos: fijo = luz; puerta = nominal − 2·90', () => {
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'top' })).toEqual([[336, 2], [768, 2]])
    expect(lengths(bom.cuts, { kind: 'bead', nodeId: 'door' })).toEqual([[604, 2], [1612, 2]])
  })

  it('vidrios 758 × 326 y 594 × 1602', () => {
    expect(glassOf(bom, 'top')).toEqual([[758, 326]])
    expect(glassOf(bom, 'door')).toEqual([[594, 1602]])
  })

  it('refuerzos R1 y R4 (puerta corte − 108)', () => {
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'frame' })).toEqual([[748, 2], [2132, 2]])
    expect(lengths(bom.cuts, { kind: 'reinforcement', nodeId: 'n1' })).toEqual([[836, 1]])
    expect(lengths(bom.cuts, { code: 'PRO-R4' })).toEqual([[682, 2], [1690, 2]])
  })

  it('cremona balconera por alto de hoja (1792 ∈ 1700–2200) y 3 bisagras', () => {
    expect(itemQty(bom, 'H-CB')).toBe(1)
    expect(itemQty(bom, 'H-B3D')).toBe(3)
  })
})

describe('OT 385 · V6 corredera PROSLD70 2 hojas 1475 × 1135', () => {
  const d = createDesign('sliding_2', { lineId: 'prosld70', width: 1475, height: 1135, colorId: 'blanco', glassId: 'dvh-4-12-4' })
  const bom = computeBom(d, catalog)
  const panels = d.root.type === 'sliding' ? d.root.panels.map((p) => p.id) : []

  it('marco y hojas: (1371 + 16 + 80)/2 + 6 = 739,5 y 1031 + 16 + 6 = 1053', () => {
    expect(lengths(bom.cuts, { code: 'PRO201' })).toEqual([[1141, 2], [1481, 2]])
    expect(lengths(bom.cuts, { code: 'PRO211' })).toEqual([[739.5, 4], [1053, 4]])
    expect(lengths(bom.cuts, { code: 'PRO211', nodeId: panels[0] })).toEqual([[739.5, 2], [1053, 2]])
  })

  it('junquillos, traslapo y guía', () => {
    expect(lengths(bom.cuts, { code: 'PRO703' })).toEqual([[613.5, 4], [927, 4]])
    expect(lengths(bom.cuts, { code: 'PRO204' })).toEqual([[1047, 2]])
    expect(lengths(bom.cuts, { code: 'PRO271' })).toEqual([[1371, 2]])
    const interlock = bom.cuts.find((c) => c.code === 'PRO204')!
    expect([interlock.angleStart, interlock.angleEnd]).toEqual([90, 90])
  })

  it('vidrios 603,5 × 917 (nunca redondeados a 604)', () => {
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([
      [603.5, 917],
      [603.5, 917],
    ])
  })

  it('refuerzos R5 (corte − 130) y R18 (corte − 146)', () => {
    expect(lengths(bom.cuts, { code: 'PRO-R5' })).toEqual([[1011, 2], [1351, 2]])
    expect(lengths(bom.cuts, { code: 'PRO-R18' })).toEqual([[593.5, 4], [907, 4]])
  })

  it('herrajes por hoja móvil y accesorios', () => {
    expect(itemQty(bom, 'carro')).toBe(4)
    expect(itemQty(bom, 'cremona-corr')).toBe(2)
    expect(itemQty(bom, 'H-M1')).toBe(2)
    expect(itemQty(bom, 'tope')).toBe(2)
    expect(itemQty(bom, 'A-TD')).toBe(4)
  })

  it('sin avisos de fabricación', () => {
    expect(bom.warnings.filter((w) => w.level !== 'info')).toEqual([])
  })
})

describe('Plantilla del fabricante (soldadura 2,5): 1000 × 1000', () => {
  const fab = manufacturerCatalog()
  const base = { lineId: 'pro6004-fab', width: 1000, height: 1000, colorId: 'blanco', glassId: 'dvh-4-12-4' }

  it('fijo: marco 1005, vidrio 902, acero 892', () => {
    const bom = computeBom(createDesign('fixed', base), fab)
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([[1005, 4]])
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([[902, 902]])
    expect(lengths(bom.cuts, { code: 'PRO-R1' })).toEqual([[892, 4]])
  })

  it('hoja: corte 933, vidrio 798, acero 788', () => {
    const bom = computeBom(createDesign('casement_out', base), fab)
    expect(lengths(bom.cuts, { code: 'PRO521' })).toEqual([[933, 4]])
    expect(bom.glass.map((g) => [g.width, g.height])).toEqual([[798, 798]])
    expect(lengths(bom.cuts, { code: 'PRO-R19' })).toEqual([[788, 4]])
  })
})

describe('Fijo irregular (trapecio) 1000 × 1000, lado izquierdo 500', () => {
  // La OT 385 (V2) corta todo a 45° y aproxima junquillos; research 06 (T11) lo marca como error.
  // Seguimos la geometría corregida: ingletes a la mitad del ángulo real, junquillo y vidrio del
  // contorno desplazado. El acero usa la misma regla del marco (corte − 114), no el «lado − 102»
  // de la OT, para no tener dos reglas para la misma pieza.
  const d = createDesign('trapezoid', { lineId: 'pro6004', width: 1000, height: 1000, colorId: 'blanco', glassId: 'dvh-4-12-4' })
  const bom = computeBom(d, catalog)
  const frame = bom.cuts.filter((c) => c.code === 'PRO01')

  it('marco por arista + 6 (inclinado √(1000² + 500²) + 6 = 1124)', () => {
    expect(lengths(frame, {})).toEqual([[506, 1], [1006, 2], [1124, 1]])
  })

  it('ingletes 45° abajo, 58,28° y 31,72° arriba', () => {
    const inclined = frame.find((c) => c.label === 'incl.')!
    expect([inclined.angleStart, inclined.angleEnd]).toEqual([31.72, 58.28])
    const bottom = frame.find((c) => c.label === 'aba')!
    expect([bottom.angleStart, bottom.angleEnd]).toEqual([45, 45])
  })

  it('junquillos geométricos 912 / 428,8 / 884,8 / 1019,6', () => {
    expect(lengths(bom.cuts, { kind: 'bead' })).toEqual([[428.8, 1], [884.8, 1], [912, 1], [1019.6, 1]])
  })

  it('vidrio: rectángulo envolvente real del trapecio (902 × 871,7), marcado como forma', () => {
    expect(bom.glass).toHaveLength(1)
    expect([bom.glass[0].width, bom.glass[0].height]).toEqual([902, 871.7])
    expect(bom.glass[0].shape).toBe('trapezoid')
  })
})
