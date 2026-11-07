import { describe, expect, it } from 'vitest'
import {
  angleAllowed,
  assemblyKindOf,
  assemblyOptions,
  assemblyUnits,
  computeBom,
  computeLayout,
  couplingOf,
  createAssembly,
  createDesign,
  describeDesign,
  designName,
  foldAngle,
  invertAssembly,
  joinWindow,
  lineCoupling,
  mapUnits,
  matchTypology,
  mirrorAssembly,
  placeAssembly,
  presetAvailability,
  ASSEMBLY_PRESETS,
  priceItem,
  quoteTotals,
  removeUnit,
  setAssemblyAlign,
  setAssemblyAngle,
  setAssemblyFront,
  setAssemblyJoint,
  setColor,
  setLine,
  setSize,
  setUnitSize,
  syncAssembly,
  updateUnit,
} from '../../src'
import { evaluateQuote, buildWorkshopData } from '../../src/commerce/quote'
import type { AssemblyGroup, Catalog, Profile, WindowDesign } from '../../src/types'
import { lineFor, V7_COUPLER_FACE, v5Catalog } from './v5-fixtures'

const catalog = v5Catalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const settings = { marginMode: 'margin' as const, marginPct: 40, laborPerM2: 12000, installMode: 'none' as const, installValue: 0, wastePct: 5, roundTo: 100 as const, ivaPct: 19, chargeFullBars: false }

const fixedW = (width = 1000, height = 1200) => createDesign('fixed', { ...base, width, height })

/** Catálogo sin ningún perfil de acople. */
function withoutCouplers(cat: Catalog): Catalog {
  return { ...cat, profiles: cat.profiles.filter((p) => p.role !== 'coupler'), lines: cat.lines.map((l) => ({ ...l, profiles: { ...l.profiles, coupler: undefined } })) }
}

describe('capacidad de los acoples: solo lo que dice el catálogo', () => {
  const profile = (name: string, patch: Partial<Profile> = {}): Profile => ({ id: name, lineId: 'x', code: 'X', name, role: 'coupler', barLength: 5800, priceByColor: {}, ...patch })

  it.each([
    ['Pilar Esquinero 135°', { kind: 'corner', angle: 135 }],
    ['Perfil esquina 90º', { kind: 'corner', angle: 90 }],
    ['Union entre marcos a 90°', { kind: 'corner', angle: 90 }],
    ['Tubular Angulo Variable', { kind: 'variable' }],
    ['Esquinero MQ60 60/60', { kind: 'corner' }],
    ['Pilar 60x100', { kind: 'flat' }],
    ['Acople Mini', { kind: 'flat' }],
    ['Union Central', { kind: 'flat' }],
    ['CONECTOR DE MARCOS T 403', { kind: 'flat' }],
    ['Pletina de Acople Oculto', { kind: 'hidden' }],
    ['Acople invisible', { kind: 'hidden' }],
    ['Muelle de acoplamiento invisible', { kind: 'hidden' }],
  ])('%s', (name, expected) => {
    expect(couplingOf(profile(name))).toEqual(expected)
  })

  it('un compensador no une ventanas; lo declarado en el catálogo manda sobre el nombre', () => {
    expect(couplingOf(profile('Compensador de Marco 58 x 30 mm'))).toBeUndefined()
    expect(couplingOf(profile('Perfil raro', { coupling: { kind: 'corner', angle: 120 } }))).toEqual({ kind: 'corner', angle: 120 })
  })

  it('la línea dice qué ángulos permite', () => {
    const options = assemblyOptions(['pro6004'], catalog)
    expect(options).toMatchObject({ flat: true, angles: [90, 135], variable: false })
    expect(angleAllowed(135, options)).toBe(true)
    expect(angleAllowed(120, options)).toBe(false)
    expect(lineCoupling('pro6004', catalog).flat.map((p) => p.code)).toEqual(['ACOP-22'])
  })

  it('una plantilla solo se ofrece si el sistema la permite, y usa el poste que hay', () => {
    const bay = ASSEMBLY_PRESETS.find((p) => p.id === 'bay')!
    const bow = ASSEMBLY_PRESETS.find((p) => p.id === 'bow')!
    const variable = ASSEMBLY_PRESETS.find((p) => p.id === 'corner_variable')!
    expect(presetAvailability(bay, 'pro6004', catalog)).toEqual({ ok: true, angle: 135 })
    expect(presetAvailability(bow, 'pro6004', catalog)).toEqual({ ok: false, angle: 160, reason: 'no_post' })
    expect(presetAvailability(variable, 'pro6004', catalog)).toEqual({ ok: false, angle: 120, reason: 'no_post' })
    expect(presetAvailability(bay, 'prosld70', catalog)).toEqual({ ok: false, angle: 135, reason: 'no_post' })
  })
})

describe('dos ventanas unidas en plano', () => {
  const hinged = () => createDesign('casement_out', { ...base, width: 700, height: 1300 })
  const joined = () => joinWindow(fixedW(1000, 1300), hinged(), 'right', catalog)

  it('el ancho total suma unidades y cara del acople; el conjunto se nombra y describe', () => {
    const d = joined()
    expect(d.width).toBe(1700 + V7_COUPLER_FACE)
    expect(d.height).toBe(1300)
    expect(designName(d)).toBe('Conjunto de 2 ventanas')
    expect(describeDesign(d, catalog)).toBe('Conjunto de 2 ventanas · PRO6004 · Blanco · DVH 4+12+4')
    expect(matchTypology(d)).toBeUndefined()
  })

  it('el dibujo trae cada unidad, la unión y las cotas de cada una y del total', () => {
    const layout = computeLayout(joined(), catalog)
    expect(layout.width).toBe(1722)
    expect(layout.assembly?.units.map((u) => [u.unitId, u.rect])).toEqual([
      ['A', { x: 0, y: 0, w: 1000, h: 1300 }],
      ['B', { x: 1022, y: 0, w: 700, h: 1300 }],
    ])
    expect(layout.assembly?.joints[0]).toMatchObject({ label: 'A–B', dir: 'vertical', kind: 'coupler', status: 'ok', code: 'ACOP-22', length: 1300, rect: { x: 1000, y: 0, w: 22, h: 1300 } })
    expect(layout.assembly?.plan).toBeUndefined()
    const dims = layout.dimensions.filter((d) => d.axis === 'x').map((d) => [d.level, d.value])
    expect(dims).toEqual([[0, 1722], [1, 1000], [1, 700]])
    // Listas planas con ids de unidad, en coordenadas del desarrollo.
    expect(layout.cells.map((c) => c.nodeId)).toEqual(['A:n1', 'B:n1'])
    expect(layout.sashes[0].nodeId).toBe('B:n1')
    expect(layout.sashes[0].rect.x).toBeGreaterThan(1022)
  })

  it('el despiece suma las unidades y agrega el acople, sin marco de más', () => {
    const d = joined()
    const bom = computeBom(d, catalog)
    const a = computeBom(fixedW(1000, 1300), catalog)
    const b = computeBom(hinged(), catalog)
    const coupler = bom.cuts.filter((c) => c.role === 'coupler')
    expect(coupler).toHaveLength(1)
    expect(coupler[0]).toMatchObject({ code: 'ACOP-22', length: 1300, qty: 1, angleStart: 90, angleEnd: 90, label: 'acople A–B', nodeId: 'J1', colorId: 'blanco' })
    expect(bom.cuts.length).toBe(a.cuts.length + b.cuts.length + 1)
    expect(bom.glass.map((g) => g.label)).toEqual(['A · Paño fijo', 'B · Hoja'])
    expect(bom.area).toBeCloseTo(a.area + b.area, 4)
    expect(bom.cuts.find((c) => c.nodeId === 'A:frame')?.label).toBe('A · arr/aba')
  })

  it('el precio es el de las unidades más el acople, redondeado una vez', () => {
    const d = joined()
    const bom = computeBom(d, catalog)
    const a = fixedW(1000, 1300)
    const b = hinged()
    const pa = priceItem(computeBom(a, catalog), a, catalog, { ...settings, roundTo: 1 })
    const pb = priceItem(computeBom(b, catalog), b, catalog, { ...settings, roundTo: 1 })
    const price = priceItem(bom, d, catalog, settings)
    expect(price.pending).toBeUndefined()
    expect(price.cost).toBeGreaterThan(pa.cost + pb.cost)
    const couplerLine = price.lines.find((l) => l.code === 'ACOP-22')
    expect(couplerLine?.total).toBeGreaterThan(0)
    expect(price.unitNet % 100).toBe(0)
    expect(price.units?.map((u) => [u.kind, u.label])).toEqual([['unit', 'A'], ['unit', 'B'], ['joint', 'acople A–B']])
    expect(price.labor).toBe(pa.labor + pb.labor)
    const sum = price.units!.reduce((acc, u) => acc + u.net, 0)
    expect(price.unitNet).toBeGreaterThanOrEqual(sum)
    expect(price.unitNet - sum).toBeLessThan(100)
  })

  it('cotización y taller: los cortes y materiales de todas las unidades', () => {
    const d = joined()
    const quote = { items: [{ id: '1', ref: 'V1', qty: 2, design: d }], extras: [], discountPct: 0 }
    const evaluation = evaluateQuote(quote, catalog, settings)
    expect(evaluation.totals.subtotal).toBe(evaluation.items[0].price.unitNet * 2)
    expect(evaluation.totals.pendingItems).toBeUndefined()
    const workshop = buildWorkshopData(quote, catalog, settings, { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 })
    expect(workshop.materials.find((m) => m.code === 'ACOP-22')?.meters).toBe(2.6)
    expect(workshop.glass.reduce((n, g) => n + g.qty, 0)).toBe(4)
    expect(workshop.glass[0].refs[0]).toMatch(/^V1 · [AB] · /)
    const allLabels = workshop.optimization.groups.flatMap((g) => g.bars.flatMap((b) => b.cuts.map((c) => c.label)))
    expect(allLabels).toContain('V1 · acople A–B')
    expect(allLabels.some((l) => l.startsWith('V1 · B · '))).toBe(true)
  })

  it('unidades de distinta línea, color, alto y tipo; se alinean y el acople mide lo que se tocan', () => {
    const left = createDesign('door', { ...base, width: 900, height: 2100 })
    const right = createDesign('sliding_2', { lineId: 'prosld70', colorId: 'winchester', glassId: 'dvh-4-12-4', width: 1500, height: 1200 })
    const d = joinWindow(left, right, 'right', catalog)
    const placed = placeAssembly(d, catalog)
    expect(placed.height).toBe(2100)
    expect(placed.joints[0].length).toBe(1200)
    expect(placed.units[1].rect.y).toBe(0)
    const bottom = setAssemblyAlign(d, 'g1', 'end', catalog)
    expect(placeAssembly(bottom, catalog).units[1].rect.y).toBe(900)
    const bom = computeBom(d, catalog)
    expect(bom.cuts.some((c) => c.nodeId === 'B:frame' && c.colorId === 'winchester')).toBe(true)
    expect(bom.cuts.some((c) => c.nodeId === 'A:frame' && c.colorId === 'blanco')).toBe(true)
    expect(describeDesign(d, catalog)).toContain('PRO6004 y PROSLD70')
    expect(describeDesign(d, catalog)).toContain('Blanco y Winchester')
  })

  it('una fila y una columna juntas', () => {
    let d = joinWindow(fixedW(1000, 1000), fixedW(1000, 500), 'top', catalog)
    d = joinWindow(d, fixedW(800, 1522), 'right', catalog, 'B')
    const root = d.assembly!.root
    expect(root.dir).toBe('column')
    expect(root.children[1].type).toBe('group')
    const layout = computeLayout(d, catalog)
    expect(layout.assembly?.units.map((u) => u.unitId)).toEqual(['A', 'B', 'C'])
    expect(layout.assembly?.joints.map((j) => j.dir)).toEqual(['horizontal', 'vertical'])
    expect(layout.assembly?.joints[0]).toMatchObject({ kind: 'coupler', status: 'ok' })
    expect(layout.width).toBeGreaterThan(1800)
  })
})

describe('bay window, bow window y esquinas', () => {
  it('bay de 3 paños a 135°: postes del catálogo, planta y vuelo correctos', () => {
    const d = createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog)
    const layout = computeLayout(d, catalog)
    const asm = layout.assembly!
    expect(asm.kind).toBe('bay')
    expect(asm.units.map((u) => u.rect.w)).toEqual([800, 1600, 800])
    expect(asm.joints.map((j) => [j.kind, j.status, j.code, j.angle])).toEqual([
      ['corner_post', 'ok', 'POST-135', 135],
      ['corner_post', 'ok', 'POST-135', 135],
    ])
    const plan = asm.plan!
    expect(plan.facets.map((f) => f.heading)).toEqual([45, 0, -45])
    // Cara del poste: 40. El paño lateral sale a 45° y el poste agrega su mitad en cada dirección.
    const f = 40
    expect(plan.projection).toBeCloseTo((800 + f / 2) * Math.SQRT1_2, 0)
    expect(plan.span).toBeCloseTo(2 * ((800 + f / 2) * Math.SQRT1_2 + f / 2) + 1600, 0)
    expect(plan.developed).toBe(800 + 1600 + 800 + 2 * f)
    expect(plan.facets[0].unitIds).toEqual(['A'])
    expect(asm.units[1].facet).toBe(1)
    expect(designName(d)).toBe('Bay window, 3 paños')
  })

  it('el poste lleva su refuerzo del catálogo y se corta al alto', () => {
    const d = createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog)
    const bom = computeBom(d, catalog)
    const posts = bom.cuts.filter((c) => c.code === 'POST-135')
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({ length: 1400, qty: 1, label: 'poste A–B' })
    const steel = bom.cuts.filter((c) => c.kind === 'reinforcement' && c.nodeId === 'J1')
    expect(steel).toHaveLength(1)
    expect(steel[0].colorId).toBeUndefined()
  })

  it('esquina a 90°: el segundo paño queda paralelo al muro', () => {
    const d = createAssembly('corner_90', { ...base, width: 1000, height: 1300 }, catalog)
    const plan = computeLayout(d, catalog).assembly!.plan!
    expect(plan.facets.map((f) => f.heading)).toEqual([90, 0])
    expect(plan.projection).toBeCloseTo(1000 + 20, 0)
    expect(designName(d)).toBe('Ventana en esquina')
  })

  it('una columna dentro de un paño queda en ese paño de la planta', () => {
    const bay = createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog)
    const d = joinWindow(bay, fixedW(1600, 400), 'top', catalog, 'B')
    const layout = computeLayout(d, catalog)
    const asm = layout.assembly!
    expect(asm.plan!.facets[1].unitIds.sort()).toEqual(['B', 'D'])
    expect(asm.joints.map((j) => j.kind).sort()).toEqual(['corner_post', 'corner_post', 'coupler'])
  })

  it('un ángulo que el sistema no permite: la unión queda sin pieza, se avisa y sale del total', () => {
    const d = setAssemblyAngle(createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog), 150, catalog)
    const layout = computeLayout(d, catalog)
    expect(layout.assembly!.joints.every((j) => j.status === 'missing' && j.code === undefined)).toBe(true)
    const bom = computeBom(d, catalog)
    expect(bom.cuts.some((c) => c.role === 'coupler')).toBe(false)
    const w = bom.warnings.find((x) => x.code === 'assembly_joint_missing')
    expect(w?.level).toBe('error')
    expect(w?.message).toBe('PRO6004 no tiene poste para 150° en el catálogo: la unión A–B queda sin pieza y fuera del total. Usa un ángulo que el sistema permita.')
    const price = priceItem(bom, d, catalog, settings)
    expect(price.pending?.filter((p) => p.code === 'joint_missing').map((p) => p.ref)).toEqual(['unión A–B', 'unión B–C'])
    expect(price.unitNet).toBeGreaterThan(0)
    expect(price.warnings[0].code).toBe('price_pending')
  })

  it('una línea sin acoples: se dibuja, avisa y no se inventa la pieza', () => {
    const cat = withoutCouplers(catalog)
    const d = joinWindow(fixedW(), fixedW(), 'right', cat)
    expect(d.width).toBe(2000)
    const layout = computeLayout(d, cat)
    expect(layout.assembly!.joints[0]).toMatchObject({ status: 'missing', kind: 'coupler' })
    const bom = computeBom(d, cat)
    expect(bom.warnings.find((w) => w.code === 'assembly_joint_missing')?.message).toBe('PRO6004 no tiene perfil de acople en el catálogo: la unión A–B queda sin pieza y fuera del total.')
    expect(bom.assembly?.missingJoints).toEqual([{ jointId: 'J1', label: 'A–B', angle: 180 }])
  })

  it('poste de ángulo variable: lleva su adaptador si la línea lo trae, y permite bow', () => {
    const extra: Profile[] = [
      { id: 'VAR', lineId: 'pro6004', code: 'TUB-V', name: 'Tubular Angulo Variable', role: 'coupler', face: 30, barLength: 5800, priceByColor: { blanco: 40000 } },
      { id: 'ADP', lineId: 'pro6004', code: 'ADP-V', name: 'Adaptador Angulo Variable', role: 'other', barLength: 5800, priceByColor: { blanco: 10000 } },
    ]
    const cat = v5Catalog({ profiles: [...catalog.profiles, ...extra] })
    const bow = ASSEMBLY_PRESETS.find((p) => p.id === 'bow')!
    expect(presetAvailability(bow, 'pro6004', cat)).toEqual({ ok: true, angle: 160 })
    const d = createAssembly('bow', { ...base, width: 700, height: 1400, count: 4, angle: 165 }, cat)
    expect(assemblyUnits(d)).toHaveLength(4)
    const plan = computeLayout(d, cat).assembly!.plan!
    expect(plan.facets.map((f) => f.heading)).toEqual([22.5, 7.5, -7.5, -22.5])
    expect(plan.radius).toBeCloseTo(730 / (2 * Math.sin((15 * Math.PI) / 360)), 0)
    const bom = computeBom(d, cat)
    expect(bom.cuts.filter((c) => c.code === 'TUB-V')).toHaveLength(3)
    expect(bom.cuts.find((c) => c.code === 'ADP-V')).toMatchObject({ qty: 2, length: 1400, label: 'adaptador A–B' })
    expect(designName(d)).toBe('Bow window, 4 paños')
  })

  it('un esquinero sin ángulo declarado sirve solo a 90° y con aviso', () => {
    const list: Profile[] = catalog.profiles.filter((p) => p.role !== 'coupler')
    list.push({ id: 'ESQ', lineId: 'pro6004', code: 'MQ60', name: 'Esquinero MQ60 60/60', role: 'coupler', barLength: 5800, priceByColor: { blanco: 30000 } })
    const cat = v5Catalog({ profiles: list })
    const d = createAssembly('corner_90', { ...base, width: 1000, height: 1300 }, cat)
    const bom = computeBom(d, cat)
    expect(bom.cuts.some((c) => c.code === 'MQ60')).toBe(true)
    expect(bom.warnings.map((w) => w.code)).toContain('assembly_post_unverified')
    expect(bom.warnings.map((w) => w.code)).toContain('assembly_coupler_no_face')
    const at120 = setAssemblyJoint(d, 'g1', 0, { angle: 120 }, cat)
    expect(computeLayout(at120, cat).assembly!.joints[0].status).toBe('missing')
  })

  it('líneas de distinta marca: se avisa que el acople puede no servir para ambas', () => {
    const lines = catalog.lines.map((l) => (l.id === 'prosld70' ? { ...l, brandId: 'otra' } : l))
    const cat = { ...catalog, lines }
    const d = joinWindow(fixedW(), createDesign('sliding_2', { lineId: 'prosld70', colorId: 'blanco', glassId: 'dvh-4-12-4', width: 1500, height: 1200 }), 'right', cat)
    expect(computeBom(d, cat).warnings.find((w) => w.code === 'assembly_mixed_systems')?.message).toContain('junta PRO6004 y PROSLD70')
  })
})

describe('regla de faltantes: fuera del total, nunca a $0 ni estimado', () => {
  const noPrice = (cat: Catalog, ids: string[]): Catalog => ({ ...cat, profiles: cat.profiles.map((p) => (ids.includes(p.id) ? { ...p, priceByColor: {} } : p)) })

  it('una ventana con un material sin precio queda con precio 0 y pendiente; su costo parcial se ve', () => {
    const cat = noPrice(catalog, ['PRO05'])
    const d = fixedW()
    const price = priceItem(computeBom(d, cat), d, cat, settings)
    expect(price.unitNet).toBe(0)
    expect(price.totalNet).toBe(0)
    expect(price.cost).toBeGreaterThan(0)
    expect(price.calculatedUnitNet).toBeGreaterThan(0)
    expect(price.pending).toEqual([{ code: 'price_missing', ref: 'PRO05 (Blanco)' }])
    expect(price.warnings.find((w) => w.code === 'price_pending')?.message).toBe('Esta ventana queda fuera del total hasta tener precio: falta PRO05 (Blanco).')
  })

  it('el precio manual lo resuelve', () => {
    const cat = noPrice(catalog, ['PRO05'])
    const d = fixedW()
    const price = priceItem(computeBom(d, cat), d, cat, settings, { manualUnitPrice: 150000 })
    expect(price.pending).toBeUndefined()
    expect(price.unitNet).toBe(150000)
  })

  it('los totales no suman lo pendiente, y lo cuentan', () => {
    const cat = noPrice(catalog, ['PRO05'])
    const good = createDesign('sliding_2', { lineId: 'prosld70', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const bad = fixedW()
    const quote = { items: [{ id: 'a', ref: 'V1', qty: 1, design: good }, { id: 'b', ref: 'V2', qty: 3, design: bad }], extras: [], discountPct: 0 }
    const { items, totals } = evaluateQuote(quote, cat, settings)
    const priced = items[0].price
    expect(items[1].price.pending).toBeDefined()
    expect(totals.subtotal).toBe(priced.pending ? 0 : priced.totalNet)
    expect(totals.pendingItems).toBe(priced.pending ? 2 : 1)
    expect(totals.cost).toBe(priced.pending ? 0 : Math.round(priced.cost))
  })

  it('en un conjunto sale solo la unidad afectada, y el resto conserva su precio', () => {
    // La unidad B usa un color sin precio de junquillo; la A sí tiene.
    const cat: Catalog = { ...catalog, profiles: catalog.profiles.map((p) => (p.id === 'PRO05' ? { ...p, priceByColor: { blanco: 5000 } } : p)) }
    const d = joinWindow(fixedW(), createDesign('fixed', { ...base, colorId: 'antracita', width: 1000, height: 1200 }), 'right', cat)
    const price = priceItem(computeBom(d, cat), d, cat, settings)
    expect(price.pending?.map((p) => [p.code, p.unitId])).toContainEqual(['price_missing', 'B'])
    expect(price.units?.find((u) => u.id === 'B')).toMatchObject({ pending: true, net: 0 })
    expect(price.units?.find((u) => u.id === 'A')?.pending).toBe(false)
    expect(price.unitNet).toBeGreaterThan(0)
    expect(price.warnings[0].message).toMatch(/^Parte de este conjunto queda fuera del total hasta tener precio: falta B: /)
    const totals = quoteTotals([{ price }], { discountPct: 0, extras: [], ivaPct: 19 })
    expect(totals.subtotal).toBe(price.unitNet)
    expect(totals.pendingItems).toBe(1)
  })

  it('un acople sin precio saca solo esa unión', () => {
    const cat = noPrice(catalog, ['ACOP'])
    const d = joinWindow(fixedW(), fixedW(), 'right', cat)
    const price = priceItem(computeBom(d, cat), d, cat, settings)
    expect(price.pending).toEqual([{ code: 'price_missing', ref: 'ACOP-22 (Blanco)' }])
    expect(price.units?.find((u) => u.kind === 'joint')).toMatchObject({ pending: true, net: 0 })
    expect(price.unitNet).toBeGreaterThan(0)
  })

  it('una puerta con panel sin regla de precio: se dibuja y queda pendiente', () => {
    const cat = v5Catalog()
    const d = createDesign('door_panel', { ...base, width: 900, height: 2100 })
    const price = priceItem(computeBom(d, cat), d, cat, settings)
    expect(price.pending).toContainEqual({ code: 'extra_missing', ref: 'panel ciego' })
  })
})

describe('edición de conjuntos', () => {
  const start = () => joinWindow(fixedW(1000, 1200), fixedW(800, 1200), 'right', catalog)

  it('unir a la izquierda deja la ventana nueva como A', () => {
    const d = joinWindow(fixedW(1000, 1200), fixedW(500, 1200), 'left', catalog)
    expect(assemblyUnits(d).map((u) => [u.id, u.design.width])).toEqual([['A', 500], ['B', 1000]])
  })

  it('agregar en la fila, cambiar medida, reemplazar y quitar recalculan los totales', () => {
    let d = start()
    d = joinWindow(d, fixedW(600, 1200), 'left', catalog, 'A')
    expect(assemblyUnits(d).map((u) => u.id)).toEqual(['C', 'A', 'B'])
    expect(d.assembly!.root.joints).toHaveLength(2)
    expect(d.width).toBe(600 + 1000 + 800 + 2 * 22)
    d = setUnitSize(d, 'A', 1200, 1200, catalog)
    expect(d.width).toBe(600 + 1200 + 800 + 2 * 22)
    d = updateUnit(d, 'B', createDesign('casement', { ...base, width: 900, height: 1300 }), catalog)
    expect(d.height).toBe(1300)
    d = removeUnit(d, 'C', catalog)
    expect(assemblyUnits(d).map((u) => u.id)).toEqual(['A', 'B'])
    expect(d.assembly!.root.joints).toHaveLength(1)
    const plain = removeUnit(d, 'A', catalog)
    expect(plain.assembly).toBeUndefined()
    expect(plain.root.type).toBe('leaf')
    expect(matchTypology(plain)).toBe('casement')
  })

  it('un cambio que no cambia nada devuelve la misma referencia', () => {
    const d = start()
    expect(setAssemblyJoint(d, 'g1', 0, { angle: 180 }, catalog)).toBe(d)
    expect(setAssemblyAlign(d, 'g1', 'start', catalog)).toBe(d)
    expect(setUnitSize(d, 'A', 1000, 1200, catalog)).toBe(d)
    expect(updateUnit(d, 'Z', fixedW(), catalog)).toBe(d)
  })

  it('el color, el vidrio y la línea del conjunto llegan a todas las unidades', () => {
    const d = setColor(start(), 'antracita')
    expect(assemblyUnits(d).every((u) => u.design.colorId === 'antracita')).toBe(true)
    expect(d.colorId).toBe('antracita')
    expect(mapUnits(d, (u) => u, catalog)).toBe(d)
    const changed = setLine(d, 'prosld70', catalog)
    expect(assemblyUnits(changed).every((u) => u.design.lineId === 'prosld70')).toBe(true)
  })

  it('el ancho y alto de un conjunto no se editan directo', () => {
    const d = start()
    expect(setSize(d, { width: 3000 })).toBe(d)
  })

  it('agregar a un bay conserva su ángulo; agregar a una fila plana nace plano', () => {
    const bay = createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog)
    const more = joinWindow(bay, fixedW(800, 1400), 'right', catalog, 'C')
    expect(more.assembly!.root.joints.map((j) => j.angle)).toEqual([135, 135, 135])
    expect(joinWindow(start(), fixedW(), 'right', catalog, 'B').assembly!.root.joints.map((j) => j.angle)).toEqual([180, 180])
  })

  it('el aviso de una unidad se corrige sobre el conjunto', () => {
    const glassless = fixedW()
    const d = joinWindow(glassless, { ...glassless, colorId: 'no-existe', glassId: 'raro' }, 'right', catalog)
    const w = computeBom(d, catalog).warnings.find((x) => x.code === 'glass_missing')
    expect(w?.unitId).toBe('B')
    const fixed = { ...d, ...w!.fix!.patch } as WindowDesign
    expect(assemblyUnits(fixed)[1].design.glassId).not.toBe('raro')
  })

  it('un diseño guardado sin sincronizar se corrige y los árboles rotos no lanzan', () => {
    const d = start()
    const stale = { ...d, width: 1, height: 1 }
    expect(syncAssembly(stale, catalog).width).toBe(1822)
    const broken = { ...fixedW(), assembly: { kind: 'flat', root: { id: 'g1', type: 'group', dir: 'row', children: [], joints: [] } } } as unknown as WindowDesign
    expect(computeLayout(broken, catalog).assembly).toBeUndefined()
    const odd = { ...fixedW(), assembly: { kind: 'flat', root: { id: 'g1', type: 'group', dir: 'row', children: [{ id: 'A', type: 'unit', design: fixedW() }], joints: [] } as AssemblyGroup } } as WindowDesign
    expect(computeLayout(odd, catalog).assembly?.units).toHaveLength(1)
    expect(computeBom(odd, catalog).cuts.length).toBeGreaterThan(0)
  })
})

describe('tipologías de v7', () => {
  it('líneas: se ofrecen solo si tienen sus partes', async () => {
    const { lineFabricates } = await import('../../src')
    const v5 = catalog.lines.find((l) => l.id === 'pro6004')!
    const line = { ...v5, typologyIds: ['casement', 'fixed', 'door'] }
    expect(lineFabricates(line, 'casement_bottom_fixed', catalog.profiles)).toBe(true)
    expect(lineFabricates(line, 'door_zocalo', catalog.profiles)).toBe(true)
    expect(lineFabricates(line, 'tilt_turn_bottom_fixed', catalog.profiles)).toBe(false)
    expect(lineFabricates({ ...line, profiles: { ...line.profiles, mullion: undefined } }, 'casement_bottom_fixed', catalog.profiles)).toBe(false)
    const sliding = catalog.lines.find((l) => l.id === 'prosld70')!
    expect(lineFabricates(sliding, 'vertical_sliding', catalog.profiles)).toBe(true)
    expect(lineFabricates(catalog.lines.find((l) => l.id === 'hst')!, 'vertical_sliding', catalog.profiles)).toBe(false)
  })

  it('puerta con zócalo: una hoja con travesaño, vidrio arriba y panel abajo', () => {
    const d = createDesign('door_zocalo', { ...base, width: 900, height: 2100 })
    expect((d.root as { zocalo?: { height: number } }).zocalo).toEqual({ height: 800 })
    const layout = computeLayout(d, catalog)
    const sash = layout.sashes[0]
    expect(sash.zocalo).toBeDefined()
    expect(sash.glassRect.y + sash.glassRect.h).toBeLessThan(sash.zocalo!.panel.y)
    expect(layout.panes.map((p) => p.fill)).toEqual(['glass', 'panel'])
    const bom = computeBom(d, catalog)
    expect(bom.panels).toHaveLength(1)
    expect(bom.panels?.[0]).toMatchObject({ kind: 'zocalo' })
    const bar = bom.cuts.find((c) => c.label === 'trav. zócalo' && c.kind === 'profile')
    expect(bar).toMatchObject({ role: 'mullion', angleStart: 90 })
    // Dos zonas con junquillo: 8 piezas, con el mismo ancho de las dos.
    expect(bom.cuts.filter((c) => c.kind === 'bead').reduce((n, c) => n + c.qty, 0)).toBe(8)
    const plain = computeBom(createDesign('door', { ...base, width: 900, height: 2100 }), catalog)
    expect(bom.glass[0].height).toBeLessThan(plain.glass[0].height)
    expect(bom.items.filter((i) => i.kind === 'hardware').map((i) => i.itemId)).toEqual(plain.items.filter((i) => i.kind === 'hardware').map((i) => i.itemId))
    expect(designName(d)).toBe('Puerta con zócalo')
  })

  it('un zócalo que no cabe se ignora con aviso', () => {
    const d = createDesign('door_zocalo', { ...base, width: 900, height: 2100 })
    const tall = { ...d, root: { ...d.root, zocalo: { height: 2000 } } } as WindowDesign
    const bom = computeBom(tall, catalog)
    expect(bom.warnings.map((w) => w.code)).toContain('zocalo_invalid')
    expect(bom.panels).toBeUndefined()
  })

  it('guillotina: paneles apilados, traslapo al ancho y guías en las jambas', () => {
    const d = createDesign(('vertical_sliding'), { lineId: lineFor('sliding'), colorId: 'blanco', glassId: 'dvh-4-12-4', width: 900, height: 1500 })
    const layout = computeLayout(d, catalog)
    expect(layout.slidingSystem).toBe('vertical')
    const [top, bottom] = layout.sliding
    expect(top.rect.y).toBeLessThan(bottom.rect.y)
    expect(top.rect.w).toBe(bottom.rect.w)
    expect(bottom.direction).toBe('up')
    const bom = computeBom(d, catalog)
    expect(bom.cuts.filter((c) => c.role === 'interlock').every((c) => c.length === top.rect.w)).toBe(true)
    expect(bom.cuts.find((c) => c.role === 'sliding_sash')?.code).toBe('GUI-H')
    expect(bom.cuts.find((c) => c.role === 'guide')).toMatchObject({ qty: 2, label: 'guía' })
    expect(designName(d)).toBe('Guillotina')
  })

  it('guillotina en una línea sin esa hoja: error claro y fuera del total', () => {
    const d = createDesign('vertical_sliding', { lineId: 'hst', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    const bom = computeBom(d, catalog)
    expect(bom.warnings.find((w) => w.code === 'vertical_slide_unsupported')?.level).toBe('error')
    expect(priceItem(bom, d, catalog, settings).pending).toContainEqual({ code: 'profile_missing', ref: 'hoja de guillotina' })
  })

  it('celosía fija: se dibuja, no lleva vidrio y sin regla queda pendiente', () => {
    const d = createDesign('louver_fixed', base)
    const bom = computeBom(d, catalog)
    expect(bom.glass).toEqual([])
    expect(bom.panels?.[0].kind).toBe('louver')
    expect(computeLayout(d, catalog).panes[0].fill).toBe('louver')
    expect(priceItem(bom, d, catalog, settings).pending).toContainEqual({ code: 'extra_missing', ref: 'celosía' })
  })

  it('premarco, ensanche y vierteaguas salen del catálogo; si ya no están se avisa', () => {
    const extra: Profile[] = [
      { id: 'PREM', lineId: 'pro6004', code: 'PRO78', name: 'Premarco pvc 60/70', role: 'other', barLength: 5800, priceByColor: { blanco: 9000 } },
      { id: 'ENS', lineId: 'pro6004', code: 'PRO14', name: 'Ensanche marco 60/30', role: 'other', barLength: 5800, priceByColor: { blanco: 7000 } },
      { id: 'VIE', lineId: 'pro6004', code: 'V-1', name: 'Vierteaguas 409', role: 'other', barLength: 5800, priceByColor: { blanco: 8000 } },
    ]
    const cat = v5Catalog({ profiles: [...catalog.profiles, ...extra] })
    const d: WindowDesign = {
      ...fixedW(1000, 1200),
      extras: { frameAddons: [{ kind: 'subframe', profileId: 'PREM' }, { kind: 'extension', profileId: 'ENS', sides: ['left', 'right'] }, { kind: 'sill_profile', profileId: 'VIE' }] },
    }
    const bom = computeBom(d, cat)
    expect(bom.cuts.filter((c) => c.code === 'PRO78').map((c) => [c.length, c.qty, c.angleStart])).toEqual([[1006, 2, 45], [1206, 2, 45]])
    expect(bom.cuts.find((c) => c.code === 'PRO14')).toMatchObject({ length: 1200, qty: 2, angleStart: 90 })
    expect(bom.cuts.find((c) => c.code === 'V-1')).toMatchObject({ length: 1000, qty: 1 })
    const gone = computeBom({ ...d, extras: { frameAddons: [{ kind: 'subframe', profileId: 'NADA' }] } }, cat)
    expect(gone.warnings.map((w) => w.code)).toContain('frame_addon_missing')
  })
})

describe('armar desde el dibujo: ángulo con dirección', () => {
  const pair = (side: 'left' | 'right' = 'right', width = 1000) => joinWindow(fixedW(width, 1300), fixedW(width, 1300), side, catalog)
  const angled = (angle: number, side: 'left' | 'right' = 'right') => setAssemblyJoint(pair(side), 'g1', 0, { angle }, catalog)
  const bow = (angle: number) => joinWindow(angled(angle), fixedW(1000, 1300), 'right', catalog, 'B')
  const plan = (d: WindowDesign) => computeLayout(d, catalog).assembly!.plan!

  it('hacia adentro usa el mismo poste y cuesta lo mismo', () => {
    const out = computeLayout(angled(135), catalog).assembly!.joints[0]
    const inward = computeLayout(angled(225), catalog).assembly!.joints[0]
    expect(foldAngle(225)).toBe(135)
    expect(inward).toMatchObject({ angle: 135, inward: true, kind: out.kind, status: 'ok', code: out.code })
    expect(out.inward).toBeUndefined()
    const cuts = (d: WindowDesign) => computeBom(d, catalog).cuts.filter((c) => c.role === 'coupler').map((c) => [c.code, c.length])
    expect(cuts(angled(225))).toEqual(cuts(angled(135)))
    expect(priceItem(computeBom(angled(225), catalog), angled(225), catalog, settings).unitNet).toBe(priceItem(computeBom(angled(135), catalog), angled(135), catalog, settings).unitNet)
    expect(angleAllowed(225, assemblyOptions(['pro6004'], catalog))).toBe(true)
  })

  it('el conjunto se nombra solo según sus uniones', () => {
    expect(pair().assembly?.kind).toBe('flat')
    expect(angled(90).assembly?.kind).toBe('corner')
    expect(bow(150).assembly?.kind).toBe('bow')
    expect(bow(135).assembly?.kind).toBe('bay')
    expect(bow(210).assembly?.kind).toBe('bow')
    expect(assemblyKindOf(setAssemblyAngle(bow(135), 180, catalog).assembly!.root)).toBe('flat')
  })

  it('repetir el «+» hereda el ángulo y en otra dirección nace plana', () => {
    expect(bow(150).assembly?.root.joints.map((j) => j.angle)).toEqual([150, 150])
    const five = joinWindow(joinWindow(bow(150), fixedW(1000, 1300), 'right', catalog, 'C'), fixedW(1000, 1300), 'left', catalog, 'A')
    expect(five.assembly?.root.joints.map((j) => j.angle)).toEqual([150, 150, 150, 150])
    const top = joinWindow(bow(150), fixedW(1000, 500), 'top', catalog, 'B')
    expect(top.assembly?.root.joints.map((j) => j.angle)).toEqual([150, 150])
    expect(top.assembly?.root.align).toBe('end')
    expect(computeLayout(top, catalog).assembly?.units.find((u) => u.unitId === 'B')?.rect.y).toBe(500 + V7_COUPLER_FACE)
  })

  it('afuera la punta sale del muro; adentro entra', () => {
    const out = plan(bow(150))
    const inward = plan(bow(210))
    expect(out.facets[1].heading).toBe(0)
    expect(out.facets[0].heading).toBeGreaterThan(0)
    expect(out.facets[1].from.y).toBeGreaterThan(out.facets[0].from.y)
    expect(inward.facets[0].heading).toBeLessThan(0)
    expect(inward.facets[1].from.y).toBeLessThan(inward.facets[0].from.y)
    expect(inward.projection).toBe(out.projection)
    expect(inward.span).toBe(out.span)
    expect(inward.posts[0].angle).toBe(150)
  })

  it('en una esquina queda de frente la que ya estaba y gira la nueva', () => {
    const right = plan(angled(90))
    expect(right.facets[0].heading).toBe(0)
    expect(right.facets[1].heading).toBe(-90)
    const left = plan(angled(90, 'left'))
    expect(left.facets[1].heading).toBe(0)
    expect(left.facets[0].heading).toBe(90)
    const swapped = plan(setAssemblyFront(angled(90), 'end', catalog))
    expect(swapped.facets[1].heading).toBe(0)
    // Una esquina hecha con plantilla no guarda el dato y sigue dejando de frente la última.
    expect(plan(createAssembly('corner_90', { ...base }, catalog)).facets[1].heading).toBe(0)
  })

  it('sin la pieza se crea igual y queda fuera del total, con el ángulo del poste', () => {
    const d = angled(210)
    const joint = computeLayout(d, catalog).assembly!.joints[0]
    expect(joint).toMatchObject({ status: 'missing', angle: 150, inward: true })
    const bom = computeBom(d, catalog)
    expect(bom.assembly?.missingJoints).toEqual([{ jointId: 'J1', label: 'A–B', angle: 150 }])
    expect(bom.warnings.find((w) => w.code === 'assembly_joint_missing')?.message).toContain('150°')
    expect(priceItem(bom, d, catalog, settings).pending?.length).toBeGreaterThan(0)
  })

  it('dar vuelta espeja orden, letras, bisagras y ángulos', () => {
    const hinged = createDesign('casement_out', { ...base, width: 700, height: 1300 })
    const base3 = joinWindow(setAssemblyJoint(joinWindow(fixedW(1000, 1300), hinged, 'right', catalog), 'g1', 0, { angle: 135 }, catalog), fixedW(1200, 1300), 'right', catalog, 'B')
    const d = setAssemblyJoint(base3, 'g1', 1, { angle: 225 }, catalog)
    const m = mirrorAssembly(d, catalog)
    expect(assemblyUnits(m).map((u) => [u.id, u.design.width])).toEqual([['A', 1200], ['B', 700], ['C', 1000]])
    expect(m.assembly?.root.joints.map((j) => j.angle)).toEqual([225, 135])
    const leaf = (x: WindowDesign) => (x.root.type === 'leaf' ? x.root.opening.hinge : undefined)
    expect(leaf(assemblyUnits(m)[1].design)).toBe(leaf(hinged) === 'left' ? 'right' : 'left')
    expect(m.width).toBe(d.width)
    expect(mirrorAssembly(m, catalog).assembly?.root.joints.map((j) => j.angle)).toEqual([135, 225])
  })

  it('invertir cambia afuera por adentro y deja lo plano', () => {
    expect(invertAssembly(bow(150), catalog).assembly?.root.joints.map((j) => j.angle)).toEqual([210, 210])
    expect(invertAssembly(invertAssembly(bow(150), catalog), catalog).assembly?.root.joints.map((j) => j.angle)).toEqual([150, 150])
    const flat = pair()
    expect(invertAssembly(flat, catalog)).toBe(flat)
  })
})
