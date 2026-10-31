import { computeLayout, TYPOLOGIES } from '@framezen/engine'
import { Box3, Vector3 } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildWindowModel } from './model/buildWindowModel'
import { SHOWCASE_CATALOG, showcaseWindow } from './showcaseData'

// Integración con el motor real: cada tipología del motor se construye en 3D sin errores.
// jsdom no dibuja en canvas: la veta de madera se omite sin ruido en la consola.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

describe('visor 3D con el motor y el catálogo de ejemplo', () => {
  it.each(TYPOLOGIES.map((typology) => typology.id))('%s', (id) => {
    const data = showcaseWindow(id, { colorId: 'nogal', colorInId: 'blanco' })
    expect(data.fallback).toBe(false)
    const model = buildWindowModel(data)
    model.setOpenAmount(0)
    model.root.updateMatrixWorld(true)
    const size = new Box3().setFromObject(model.root).getSize(new Vector3())
    expect(size.x).toBeCloseTo(data.design.width / 1000, 1)
    expect(size.y).toBeCloseTo(data.design.height / 1000, 1)
    const opening = data.layout.sashes.some((sash) => sash.opening.kind !== 'fixed') || data.layout.sliding.some((panel) => panel.kind === 'moving')
    expect(model.movable).toBe(opening)
    model.setOpenAmount(1)
    model.dispose()
  })

  it('una corredera de 2 hojas del motor abre una hoja entera', () => {
    const data = showcaseWindow('sliding_2', { colorId: 'blanco' })
    const model = buildWindowModel({ ...data, layout: computeLayout(data.design, SHOWCASE_CATALOG) })
    model.setOpenAmount(1)
    const moved = model.parts.filter((part) => part.object.position.x !== 0)
    expect(moved).toHaveLength(1)
    model.dispose()
  })
})
