import { describe, expect, it } from 'vitest'
import { assemblyUnits, computeLayout, createAssembly, createDesign, joinWindow, setOpening, type Catalog, type LayoutMullion, type Profile } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import { applyDimension, dimensionTarget } from './dimensions'
import { nodeTitle, resolveSelection } from './actions'
import { addNeighbor, addedJoint, changeTypology, moveMullion, nearestEdge, presetChoices, scopeOf, signedAngle, typedAngle, unitTypologies } from './assembly'

const catalog = SAMPLE_CATALOG as Catalog
const base = { lineId: SAMPLE_DEFAULTS.lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId }
const pair = () => joinWindow(createDesign('fixed_casement', { ...base, width: 1400, height: 1200 }), createDesign('fixed', { ...base, width: 800, height: 1200 }), 'right', catalog)
const posts: Profile[] = [
  { id: 'P135', lineId: base.lineId, code: 'P135', name: 'Pilar Esquinero 135°', role: 'coupler', face: 40, barLength: 5800, priceByColor: { blanco: 30000 } },
]

describe('selección dentro de un conjunto', () => {
  it('un paño se resuelve dentro de su unidad y se nombra con su letra', () => {
    const d = pair()
    const leaf = computeLayout(d, catalog).cells[0].nodeId
    expect(leaf.startsWith('A:')).toBe(true)
    expect(resolveSelection(d, leaf)?.kind).toBe('leaf')
    expect(nodeTitle(d, leaf)).toMatch(/^A · /)
  })

  it('un cambio sobre la unidad vuelve al conjunto', () => {
    const d = pair()
    const cell = computeLayout(d, catalog).cells[0].nodeId
    const scope = scopeOf(d, cell, catalog)
    const next = scope.lift(setOpening(scope.design, scope.nodeId!, { kind: 'tilt_turn', hinge: 'left', direction: 'in' }))
    expect(next).not.toBe(d)
    expect(assemblyUnits(next)[1].design).toBe(assemblyUnits(d)[1].design)
    expect(scope.outer('n9')).toBe('A:n9')
  })

  it('una ventana suelta no cambia', () => {
    const d = createDesign('fixed', base)
    const scope = scopeOf(d, 'n1', catalog)
    expect(scope.design).toBe(d)
    expect(scope.lift(d)).toBe(d)
  })

  it('arrastrar un travesaño de la unidad B usa el eje de esa unidad', () => {
    const d = joinWindow(createDesign('fixed', { ...base, width: 800, height: 1200 }), createDesign('fixed_casement', { ...base, width: 1400, height: 1200 }), 'right', catalog)
    const layout = computeLayout(d, catalog)
    const m = layout.mullions.find((x) => x.nodeId.startsWith('B:')) as LayoutMullion
    const next = moveMullion(d, m, m.axis + 100, layout, catalog)
    const after = computeLayout(next, catalog).mullions.find((x) => x.nodeId === m.nodeId)!
    expect(after.axis).toBeCloseTo(m.axis + 100, 1)
    expect(next.width).toBe(d.width)
  })
})

describe('cotas de cada unidad', () => {
  it('la cota de una unidad cambia esa unidad y los totales', () => {
    const d = pair()
    const layout = computeLayout(d, catalog)
    const dim = layout.dimensions.find((x) => x.axis === 'x' && x.level === 1 && x.value === 800)!
    expect(dimensionTarget(d, dim)).toEqual({ kind: 'unit', unitId: 'B', axis: 'width' })
    const change = applyDimension(d, dim, 900, catalog)
    expect(change?.design.width).toBe(d.width + 100)
  })

  it('el total de un conjunto no se edita directo', () => {
    const d = pair()
    const total = computeLayout(d, catalog).dimensions.find((x) => x.axis === 'x' && x.level === 0)!
    expect(dimensionTarget(d, total)).toBeNull()
  })
})

describe('qué se ofrece', () => {
  it('sin poste en el catálogo, bay, bow y esquina se crean igual y dicen por qué', () => {
    const choices = presetChoices(catalog, [base.lineId])
    expect(choices.find((c) => c.preset.id === 'coupled_2')?.lineId).toBe(base.lineId)
    for (const id of ['corner_90', 'bay', 'bow']) expect(choices.find((c) => c.preset.id === id)).toMatchObject({ lineId: base.lineId, reason: 'no_post' })
  })

  it('con un poste de 135° se ofrece bay a ese ángulo y nada más', () => {
    const cat = { ...catalog, profiles: [...catalog.profiles, ...posts] }
    expect(presetChoices(cat, [base.lineId]).find((c) => c.preset.id === 'bay')).toMatchObject({ lineId: base.lineId, angle: 135 })
  })

  it('el «+» duplica la ventana completa y se une aunque falte la pieza', () => {
    const cat = { ...catalog, profiles: [...catalog.profiles, ...posts] }
    const bay = createAssembly('bay', { ...base, width: 800, height: 1400 }, cat)
    const next = addNeighbor(bay, 'top', cat, 'B')
    expect(assemblyUnits(next)).toHaveLength(4)
    const added = assemblyUnits(next).find((u) => u.id === 'D')!.design
    expect([added.width, added.height]).toEqual([1600, 1400])
    const single = createDesign('fixed_casement', { ...base, width: 1400, height: 1200 })
    const joined = addNeighbor(single, 'right', { ...catalog, profiles: catalog.profiles.filter((p) => p.role !== 'coupler') })
    expect(assemblyUnits(joined).map((u) => u.design.root)).toEqual([single.root, single.root])
    expect(assemblyUnits(joined)[0].design).not.toBe(assemblyUnits(joined)[1].design)
  })

  it('la unión nueva se encuentra, en una ventana suelta y entre dos paños', () => {
    const single = createDesign('fixed', base)
    expect(addedJoint(single, computeLayout(addNeighbor(single, 'left', catalog), catalog))?.label).toBe('A–B')
    const d = pair()
    expect(addedJoint(d, computeLayout(addNeighbor(d, 'right', catalog, 'B'), catalog), 'B')?.label).toBe('B–C')
    const middle = addNeighbor(d, 'right', catalog, 'A')
    expect(addedJoint(d, computeLayout(middle, catalog), 'A')?.label).toBe('A–C')
  })

  it('el ángulo escrito: 0 es recto, cualquier otro queda en rango y con dirección aparte', () => {
    expect(typedAngle(0)).toBe(180)
    expect(typedAngle(180)).toBe(180)
    expect(typedAngle(150)).toBe(150)
    expect(typedAngle(127.5)).toBe(127.5)
    expect(typedAngle(210)).toBe(150)
    expect(typedAngle(20)).toBe(45)
    expect(signedAngle(150, true)).toBe(210)
    expect(signedAngle(150, false)).toBe(150)
    expect(signedAngle(180, true)).toBe(180)
  })

  it('cambiar de tipología conserva medidas, material y accesorios', () => {
    const d = { ...createDesign('fixed', { ...base, width: 900, height: 1100 }), colorInId: 'x', extras: { sill: true } }
    const next = changeTypology(d, 'casement')
    expect(next).toMatchObject({ width: 900, height: 1100, lineId: base.lineId, colorInId: 'x', extras: { sill: true } })
    expect(next.root).not.toEqual(d.root)
  })

  it('el tipo de una unidad se elige entre lo que su línea fabrica', () => {
    const line = catalog.lines.find((l) => l.id === base.lineId)
    const ids = unitTypologies(line, catalog).map((t) => t.id)
    expect(ids).toContain('casement_bottom_fixed')
    expect(ids).not.toContain('sliding_2')
  })
})

describe('borde bajo el cursor', () => {
  const box = { id: 'A', x: 100, y: 100, w: 300, h: 400 }

  it('aparece cerca de cada borde, por dentro o por fuera', () => {
    expect(nearestEdge({ x: 405, y: 300 }, [box])).toEqual({ id: 'A', side: 'right', along: 200 })
    expect(nearestEdge({ x: 110, y: 300 }, [box])).toMatchObject({ side: 'left' })
    expect(nearestEdge({ x: 250, y: 80 }, [box])).toEqual({ id: 'A', side: 'top', along: 150 })
    expect(nearestEdge({ x: 250, y: 490 }, [box])).toMatchObject({ side: 'bottom' })
  })

  it('en la esquina vale el lado, que es por donde crece un bow', () => {
    expect(nearestEdge({ x: 395, y: 95 }, [box])).toMatchObject({ side: 'right', along: 14 })
    expect(nearestEdge({ x: 95, y: 505 }, [box])).toMatchObject({ side: 'left', along: 386 })
  })

  it('lejos del borde o en medio del paño no hay nada', () => {
    expect(nearestEdge({ x: 250, y: 300 }, [box])).toBeNull()
    expect(nearestEdge({ x: 500, y: 300 }, [box])).toBeNull()
  })

  it('entre dos ventanas gana la más cercana', () => {
    const next = { id: 'B', x: 430, y: 100, w: 300, h: 400 }
    expect(nearestEdge({ x: 395, y: 300 }, [box, next])).toMatchObject({ id: 'A', side: 'right' })
    expect(nearestEdge({ x: 410, y: 300 }, [box, next])).toMatchObject({ id: 'A', side: 'right' })
    expect(nearestEdge({ x: 425, y: 300 }, [box, next])).toMatchObject({ id: 'B', side: 'left' })
  })
})
