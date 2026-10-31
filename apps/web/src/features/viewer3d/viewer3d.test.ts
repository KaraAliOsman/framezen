import { Box3, Mesh, Vector3 } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FIXTURE_TYPOLOGIES, fixtureWindow } from './fixtures'
import { buildWindowModel } from './model/buildWindowModel'
import { outlineToModel } from './model/geometry'
import {
  computeSashMotion,
  computeSlidingTravel,
  handleProgress,
  moveProgress,
  OPENING_ANGLES,
  resolveSlidingTracks,
  type SlidingSpan,
} from './model/kinematics'
import { classifyFinish } from './model/materials'

const rect = { x: 100, y: 50, w: 600, h: 1000 }
const z = { back: 4, front: 70 }

// jsdom no dibuja en canvas: la veta de madera se omite sin ruido en la consola.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

describe('cinemática de hojas', () => {
  it('abatir con bisagra izquierda gira hacia el interior sobre el canto izquierdo', () => {
    const motion = computeSashMotion({ opening: { kind: 'casement', hinge: 'left', direction: 'in' }, rect }, z)
    expect(motion).toMatchObject({ type: 'rotate', axis: 'y', pivot: { x: 100, z: 70 } })
    if (motion.type !== 'rotate') throw new Error('sin giro')
    expect(motion.angle).toBeCloseTo(-OPENING_ANGLES.casement)
  })

  it('abatir con bisagra derecha hacia fuera usa el canto derecho y la cara exterior', () => {
    const motion = computeSashMotion({ opening: { kind: 'casement', hinge: 'right', direction: 'out' }, rect }, z)
    expect(motion).toMatchObject({ type: 'rotate', axis: 'y', pivot: { x: 700, z: 4 } })
    if (motion.type !== 'rotate') throw new Error('sin giro')
    // Bisagra derecha + afuera: el ángulo negativo lleva la hoja hacia −Z (exterior).
    expect(motion.angle).toBeCloseTo(-OPENING_ANGLES.casement)
  })

  it('oscilante gira sobre el eje inferior y proyectante sobre el superior', () => {
    const tilt = computeSashMotion({ opening: { kind: 'tilt' }, rect }, z)
    const awning = computeSashMotion({ opening: { kind: 'awning' }, rect }, z)
    expect(tilt).toMatchObject({ axis: 'x', pivot: { y: 1050, z: 70 } })
    expect(awning).toMatchObject({ axis: 'x', pivot: { y: 50, z: 4 } })
    if (tilt.type !== 'rotate' || awning.type !== 'rotate') throw new Error('sin giro')
    expect(tilt.angle).toBeGreaterThan(0)
    expect(awning.angle).toBeGreaterThan(0)
  })

  it('el fijo no se mueve y la manilla gira antes que la hoja', () => {
    expect(computeSashMotion({ opening: { kind: 'fixed' }, rect }, z)).toEqual({ type: 'none' })
    expect(handleProgress(0.16)).toBeCloseTo(1)
    expect(moveProgress(0.1)).toBe(0)
    expect(moveProgress(1)).toBe(1)
  })
})

describe('correderas', () => {
  const span = (x0: number, x1: number, kind: 'moving' | 'fixed', track: number, direction?: 'left' | 'right'): SlidingSpan => ({ x0, x1, kind, track, direction })

  it('2 hojas: la izquierda corre entera detrás de la derecha y la derecha no la tapa', () => {
    const travel = computeSlidingTravel([span(44, 960, 'moving', 0, 'right'), span(880, 1796, 'moving', 1, 'left')])
    expect(travel[0]).toBeCloseTo(836)
    expect(travel[1]).toBe(0)
  })

  it('4 hojas: las centrales se abren hacia las fijas', () => {
    const travel = computeSlidingTravel([
      span(44, 760, 'fixed', 0),
      span(680, 1400, 'moving', 1, 'left'),
      span(1320, 2040, 'moving', 1, 'right'),
      span(1960, 2756, 'fixed', 0),
    ])
    expect(travel[1]).toBeCloseTo(-636)
    expect(travel[2]).toBeCloseTo(716)
  })

  it('3 hojas en dos rieles: las móviles del mismo riel no se cruzan', () => {
    const travel = computeSlidingTravel([span(0, 1000, 'moving', 1, 'right'), span(920, 1920, 'fixed', 0), span(1840, 2840, 'moving', 1, 'left')])
    expect(travel[0]).toBeCloseTo(840)
    expect(travel[2]).toBe(0)
  })

  it('3 rieles telescópica: las hojas se apilan a un lado', () => {
    const travel = computeSlidingTravel([span(0, 1000, 'fixed', 0), span(1000, 2000, 'moving', 1, 'left'), span(2000, 3000, 'moving', 2, 'left')])
    expect(travel[1]).toBeCloseTo(-1000)
    expect(travel[2]).toBeCloseTo(-2000)
  })

  it('monorriel: la fija pasa a su propio carril para que la móvil pueda correr', () => {
    const { tracks, count } = resolveSlidingTracks(
      [
        { kind: 'moving', rail: 0 },
        { kind: 'fixed', rail: 0 },
      ],
      1,
    )
    expect(count).toBe(2)
    expect(tracks).toEqual([0, 1])
  })
})

describe('contornos especiales', () => {
  it('lee el arco del motor como curva suave en coordenadas del modelo', () => {
    const contour = outlineToModel({ width: 1000, height: 1200, depth: 60 }, 'M 0 1200 L 1000 1200 L 1000 500 A 500 500 0 0 0 0 500 Z')
    expect(contour).not.toBeNull()
    const points = contour![0]
    expect(points.length).toBeGreaterThan(20)
    // La clave del arco queda arriba (y del modelo = alto total) y centrada.
    const top = points.reduce((best, p) => (p.y > best.y ? p : best))
    expect(top.y).toBeCloseTo(1200, 0)
    expect(top.x).toBeCloseTo(0, 0)
  })

  it('un path ilegible no rompe: devuelve null', () => {
    expect(outlineToModel({ width: 100, height: 100, depth: 60 }, 'esto no es un path')).toBeNull()
  })
})

describe('acabados', () => {
  it('reconoce blanco, madera y oscuros', () => {
    expect(classifyFinish({ name: 'Blanco', hex: '#F6F5F1' })).toBe('white')
    expect(classifyFinish({ name: 'Nogal', hex: '#5B3A22' })).toBe('wood')
    expect(classifyFinish({ name: 'Color 7', hex: '#A8692E' })).toBe('wood')
    expect(classifyFinish({ name: 'Antracita', hex: '#383E42' })).toBe('dark')
  })
})

function boundsOf(root: import('three').Object3D) {
  root.updateMatrixWorld(true)
  return new Box3().setFromObject(root)
}

describe('modelo 3D', () => {
  it.each(FIXTURE_TYPOLOGIES.map((typology) => typology.id))('%s se construye a escala y se libera', (id) => {
    const { design, layout, catalog } = fixtureWindow(id)
    const model = buildWindowModel({ design, layout, catalog })
    const box = boundsOf(model.root)
    const size = box.getSize(new Vector3())
    // Escala en metros: el contorno del marco manda.
    expect(size.x).toBeCloseTo(design.width / 1000, 2)
    expect(size.y).toBeCloseTo(design.height / 1000, 2)
    expect(box.min.y).toBeCloseTo(0, 3)
    let meshes = 0
    model.root.traverse((object) => {
      if (object instanceof Mesh) meshes++
    })
    expect(meshes).toBeGreaterThan(1)
    model.setOpenAmount(1)
    model.setOpenAmount(0)
    expect(() => model.dispose()).not.toThrow()
    expect(model.root.children).toHaveLength(0)
  })

  it('abatir interior: abierta, la hoja sale hacia el interior (+Z)', () => {
    const { design, layout, catalog } = fixtureWindow('casement')
    const model = buildWindowModel({ design, layout, catalog })
    const sash = model.parts.find((part) => part.kind === 'sash')
    expect(sash).toBeDefined()
    const closed = boundsOf(sash!.object)
    model.setOpenAmount(1)
    const opened = boundsOf(sash!.object)
    expect(sash!.object.rotation.y).toBeCloseTo(-OPENING_ANGLES.casement)
    expect(opened.max.z).toBeGreaterThan(closed.max.z + 0.4)
    model.dispose()
  })

  it('abatir exterior: abierta, la hoja sale hacia el exterior (−Z)', () => {
    const { design, layout, catalog } = fixtureWindow('casement_out')
    const model = buildWindowModel({ design, layout, catalog })
    const sash = model.parts.find((part) => part.kind === 'sash')!
    const closed = boundsOf(sash.object)
    model.setOpenAmount(1)
    expect(boundsOf(sash.object).min.z).toBeLessThan(closed.min.z - 0.4)
    model.dispose()
  })

  it('corredera 2 hojas: la hoja móvil se desliza por su riel', () => {
    const { design, layout, catalog } = fixtureWindow('sliding_2')
    const model = buildWindowModel({ design, layout, catalog })
    const [left, right] = model.parts
    model.setOpenAmount(1)
    expect(left.object.position.x).toBeGreaterThan(500)
    expect(right.object.position.x).toBe(0)
    expect(left.object.position.y).toBe(0)
    expect(model.movable).toBe(true)
    model.dispose()
  })

  it('el paño fijo no tiene nada que abrir y el arco usa su contorno', () => {
    const fixed = fixtureWindow('fixed')
    const fixedModel = buildWindowModel(fixed)
    expect(fixedModel.movable).toBe(false)
    fixedModel.dispose()

    const arch = fixtureWindow('arch')
    const archModel = buildWindowModel(arch)
    const box = boundsOf(archModel.root)
    expect(box.max.y).toBeCloseTo(arch.design.height / 1000, 2)
    archModel.dispose()
  })

  it('bicolor: usa materiales distintos por fuera y por dentro', () => {
    const { design, layout, catalog } = fixtureWindow('casement', { colorId: 'nogal', colorInId: 'blanco' })
    const model = buildWindowModel({ design, layout, catalog })
    const materials = new Set<unknown>()
    model.root.traverse((object) => {
      if (object instanceof Mesh) materials.add(object.material)
    })
    // exterior, interior, burlete, vidrio y manilla
    expect(materials.size).toBeGreaterThanOrEqual(5)
    model.dispose()
  })

  it('un layout vacío no rompe nada', () => {
    const { design, catalog } = fixtureWindow('fixed')
    const model = buildWindowModel({
      design,
      catalog,
      layout: { width: 0, height: 0, frame: { rect: { x: 0, y: 0, w: 0, h: 0 }, face: 0 }, mullions: [], sashes: [], panes: [], sliding: [], dimensions: [], cells: [] },
    })
    expect(model.movable).toBe(false)
    expect(() => model.setOpenAmount(1)).not.toThrow()
    model.dispose()
  })
})
