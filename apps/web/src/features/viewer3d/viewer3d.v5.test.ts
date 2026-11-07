import { loadBuiltinTextures } from '@dekopen/documents'
import { Box3, Group, MeshPhysicalMaterial, Vector3 } from 'three'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildWindowModel } from './model/buildWindowModel'
import { computeFoldingChains, computeSashMotion, handleLever, LIFT_SLIDE_RISE_MM, liftProgress, OPENING_ANGLES, PARALLEL_OFFSET_MM, parallelProgress } from './model/kinematics'
import { createMaterialPalette } from './model/materials'
import { SHOWCASE_CATALOG, showcaseWindow } from './showcaseData'

const rect = { x: 100, y: 50, w: 600, h: 1000 }
const z = { back: 4, front: 70 }

beforeAll(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  await loadBuiltinTextures()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Caja de las hojas (sin el marco, que no se mueve): las cadenas cuelgan de su primera hoja. */
const size = (model: ReturnType<typeof buildWindowModel>) => {
  model.root.updateMatrixWorld(true)
  const box = new Box3()
  for (const part of model.parts) if (part.object.parent === model.root) box.expandByObject(part.object)
  return box.getSize(new Vector3())
}

describe('cinemática de las aperturas v5', () => {
  it('pivotante vertical: eje vertical por el centro; la mitad entra y la otra sale', () => {
    const motion = computeSashMotion({ opening: { kind: 'pivot_v', pivot: 0.5 }, rect }, z)
    expect(motion).toMatchObject({ type: 'rotate', axis: 'y', pivot: { x: 400, y: 550, z: 37 } })
    if (motion.type !== 'rotate') throw new Error('sin giro')
    expect(Math.abs(motion.angle)).toBeCloseTo(OPENING_ANGLES.pivot)
  })

  it('pivotante horizontal respeta el eje desplazado (fracción del alto desde arriba)', () => {
    const motion = computeSashMotion({ opening: { kind: 'pivot_h', pivot: 0.3 }, rect }, z)
    expect(motion).toMatchObject({ type: 'rotate', axis: 'x', pivot: { x: 400, y: 350 } })
  })

  it('osciloparalela corre hacia donde indica `slide`, nunca más allá del marco, e inclina; la paralela no inclina', () => {
    const psk = computeSashMotion({ opening: { kind: 'tilt_slide', slide: 'left' }, rect }, z, { left: 250, right: 0 })
    const ps = computeSashMotion({ opening: { kind: 'parallel_slide', slide: 'right' }, rect }, z, { left: 0, right: 900 })
    if (psk.type !== 'parallel' || ps.type !== 'parallel') throw new Error('sin movimiento paralelo')
    expect(psk.travel).toBe(-250) // limitado por el espacio libre
    expect(psk.tilt).toBeGreaterThan(0)
    expect(ps.travel).toBe(600) // la hoja entera por delante del fijo
    expect(ps.tilt).toBe(0)
    expect(ps.offset).toBe(PARALLEL_OFFSET_MM)
  })

  it('la hoja paralela primero sale, después corre, y la inclinación vuelve a cero', () => {
    expect(parallelProgress(0)).toEqual({ out: 0, slide: 0, tilt: 0 })
    const mid = parallelProgress(0.4)
    expect(mid.out).toBeCloseTo(1)
    expect(mid.slide).toBeGreaterThan(0)
    expect(mid.slide).toBeLessThan(0.2)
    const end = parallelProgress(1)
    expect(end.slide).toBeCloseTo(1)
    expect(end.tilt).toBeCloseTo(0, 5)
    expect(liftProgress(0.2)).toBeCloseTo(1)
  })

  it('plegable: la hoja de la jamba gira sobre ella y las demás cuelgan de la anterior con giro contrario (zigzag)', () => {
    const leaf = (nodeId: string, x: number, hinge: 'left' | 'right') => ({ nodeId, rect: { x, y: 0, w: 500, h: 2000 }, hinge })
    const steps = computeFoldingChains([leaf('a', 0, 'left'), leaf('b', 500, 'left'), leaf('c', 1000, 'left'), leaf('d', 1500, 'right'), leaf('e', 2000, 'right')], z)
    const by = new Map(steps.map((s) => [s.nodeId, s]))
    expect(by.get('a')!.parent).toBeNull()
    expect(by.get('b')!.parent).toBe('a')
    expect(by.get('c')!.parent).toBe('b')
    // Grupo derecho: la jamba es el canto derecho de `e`; `d` cuelga de `e`.
    expect(by.get('e')!.parent).toBeNull()
    expect(by.get('d')!.parent).toBe('e')
    expect(by.get('e')!.motion.pivot.x).toBe(2500)
    // Ángulos absolutos alternan ±φ: a = sφ, b = a + rel(b) = −sφ, c = +sφ.
    const abs = (id: string): number => {
      const step = by.get(id)!
      return step.motion.angle + (step.parent ? abs(step.parent) : 0)
    }
    expect(abs('a')).toBeCloseTo(-OPENING_ANGLES.folding)
    expect(abs('b')).toBeCloseTo(OPENING_ANGLES.folding)
    expect(abs('c')).toBeCloseTo(-OPENING_ANGLES.folding)
    // El grupo derecho se pliega hacia el otro lado.
    expect(abs('e')).toBeCloseTo(OPENING_ANGLES.folding)
  })

  it('las manillas de las aperturas nuevas tienen giro definido', () => {
    expect(handleLever('pivot_v', 'right').turn).not.toBe(0)
    expect(handleLever('tilt_slide', 'left').turn).not.toBe(0)
  })
})

describe('modelo 3D de las aperturas v5', () => {
  it('plegable de 4 hojas: se articulan en cadena y al abrir la pila ocupa menos ancho', () => {
    const data = showcaseWindow('folding_4', { colorId: 'blanco' })
    const model = buildWindowModel(data)
    model.setOpenAmount(0)
    const closed = size(model)
    expect(model.parts.filter((part) => part.kind === 'sash')).toHaveLength(4)
    // Al menos una hoja cuelga de otra (no de la raíz).
    const nested = model.parts.filter((part) => part.object.parent && part.object.parent !== model.root)
    expect(nested.length).toBeGreaterThanOrEqual(2)
    expect(model.movable).toBe(true)
    model.setOpenAmount(1)
    const open = size(model)
    expect(open.x).toBeLessThan(closed.x * 0.75)
    expect(model.reach).toBeGreaterThan(0)
    model.setOpenAmount(0)
    expect(size(model).x).toBeCloseTo(closed.x, 4)
    model.dispose()
  })

  it('las hojas plegables pasivas no llevan manilla propia (solo la que pide el motor)', () => {
    const data = showcaseWindow('folding_4', { colorId: 'blanco' })
    const handles = (passive: boolean) => {
      const layout = { ...data.layout, sashes: data.layout.sashes.map((s) => ({ ...s, passive: passive ? (true as const) : undefined, handle: undefined })) }
      const model = buildWindowModel({ ...data, layout })
      let count = 0
      model.root.traverse((o) => {
        if (o.name === 'handle') count++
      })
      model.dispose()
      return count
    }
    expect(handles(true)).toBe(0)
    expect(handles(false)).toBeGreaterThan(0)
  })

  it('osciloparalela: la hoja sale hacia el interior y corre por delante del fijo', () => {
    const data = showcaseWindow('tilt_slide', { colorId: 'blanco' })
    const model = buildWindowModel(data)
    const part = model.parts.find((p) => p.motion.type === 'parallel')!
    expect(part).toBeTruthy()
    const home = part.object.position.clone()
    model.setOpenAmount(1)
    expect(part.object.position.z - home.z).toBeCloseTo(PARALLEL_OFFSET_MM, 3)
    expect(Math.abs(part.object.position.x - home.x)).toBeGreaterThan(300)
    expect(part.object.rotation.x).toBeCloseTo(0, 4)
    model.setOpenAmount(0)
    expect(part.object.position.distanceTo(home)).toBeCloseTo(0, 4)
    model.dispose()
  })

  it('pivotante vertical: gira sobre su eje y deja la ventana encuadrable (reach > 0)', () => {
    const data = showcaseWindow('pivot_v', { colorId: 'blanco' })
    const model = buildWindowModel(data)
    model.setOpenAmount(1)
    const sash = model.parts[0]
    expect(Math.abs(sash.object.rotation.y)).toBeGreaterThan(1)
    expect(model.reach).toBeGreaterThan(0.1)
    model.dispose()
  })

  it('elevadora: la hoja móvil se levanta unos milímetros antes de correr', () => {
    const data = showcaseWindow('lift_slide_2', { colorId: 'blanco' })
    const model = buildWindowModel(data)
    const moving = model.parts.find((p) => p.motion.type === 'slide' && p.motion.travel !== 0)!
    model.setOpenAmount(1)
    expect(moving.object.position.y).toBeCloseTo(LIFT_SLIDE_RISE_MM)
    model.setOpenAmount(0)
    expect(moving.object.position.y).toBe(0)
    model.dispose()
  })
})

describe('materiales físicos con el resolvedor de texturas', () => {
  const glassOf = (palette: ReturnType<typeof createMaterialPalette>) => palette.glass('dvh-4-12-4') as MeshPhysicalMaterial

  it('PVC liso: rugosidad ≈ 0,42 y barniz ≈ 0,1; vidrio transparente sin pase de transmisión', () => {
    const data = showcaseWindow('casement', { colorId: 'blanco' })
    const palette = createMaterialPalette(data.design, data.catalog)
    const pvc = palette.exterior as MeshPhysicalMaterial
    expect(pvc.roughness).toBeCloseTo(0.42, 2)
    expect(pvc.clearcoat).toBeCloseTo(0.1, 2)
    const glass = glassOf(palette)
    expect(glass.transmission).toBe(0)
    expect(glass.transparent).toBe(true)
    expect(glass.depthWrite).toBe(false)
    expect(glass.ior).toBeGreaterThan(1.5)
    expect(pvc.vertexColors).toBe(true)
    palette.dispose()
  })

  it('un foliado de madera usa el resolvedor: material más mate y la tesela llega como mapa con escala física', async () => {
    const OriginalImage = globalThis.Image
    // jsdom no decodifica imágenes: simula una carga inmediata.
    vi.stubGlobal(
      'Image',
      class FakeImage {
        onload: (() => void) | null = null
        decoding = ''
        set src(_value: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )
    expect(OriginalImage).toBeDefined()
    const data = showcaseWindow('casement', { colorId: 'roble-dorado', colorInId: 'blanco' })
    let loaded = 0
    const palette = createMaterialPalette(data.design, data.catalog, { onTextureLoad: () => loaded++ })
    const wood = palette.exterior as MeshPhysicalMaterial
    expect(wood.roughness).toBeGreaterThan(0.5)
    expect(palette.interior).not.toBe(palette.exterior)
    expect((palette.interior as MeshPhysicalMaterial).map).toBeNull() // blanco liso: sin mapa
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loaded).toBe(1)
    expect(wood.map).toBeTruthy()
    // UV en metros: 1000 / escala física (mm) repeticiones por metro a lo largo de la pieza.
    const repeatU = wood.map!.repeat.x
    expect(repeatU).toBeGreaterThan(1)
    expect(repeatU).toBeLessThan(10)
    palette.dispose()
    expect(wood.map!.image).toBeTruthy()
  })

  it('una textura que llega después de liberar el material no se asigna', async () => {
    vi.stubGlobal(
      'Image',
      class FakeImage {
        onload: (() => void) | null = null
        decoding = ''
        set src(_value: string) {
          setTimeout(() => this.onload?.(), 5)
        }
      },
    )
    const data = showcaseWindow('casement', { colorId: 'nogal' })
    const palette = createMaterialPalette(data.design, data.catalog)
    const material = palette.exterior as MeshPhysicalMaterial
    palette.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(material.map).toBeNull()
  })

  it('una textura subida llega solo como data URL: sin imagen cae al color plano', () => {
    const catalog = {
      ...SHOWCASE_CATALOG,
      colors: [{ id: 'mi-veta', name: 'Mi veta', hex: '#8A5A2B', texture: { kind: 'upload' as const, assetId: 'a1' } }, ...SHOWCASE_CATALOG.colors],
    }
    const data = showcaseWindow('casement', { colorId: 'blanco' })
    const design = { ...data.design, colorId: 'mi-veta' }
    const palette = createMaterialPalette(design, catalog, { sources: { uploads: { a1: { href: 'https://evil.example/x.webp' } } } })
    expect((palette.exterior as MeshPhysicalMaterial).map).toBeNull()
    palette.dispose()
  })

  it('los materiales y teselas del modelo se liberan con dispose()', () => {
    const data = showcaseWindow('casement', { colorId: 'roble-dorado' })
    const model = buildWindowModel(data)
    const spy = vi.fn()
    model.root.traverse((o) => {
      if ('geometry' in o) (o as unknown as { geometry: { addEventListener: (n: string, cb: () => void) => void } }).geometry.addEventListener('dispose', spy)
    })
    model.dispose()
    expect(spy).toHaveBeenCalled()
    expect(model.root instanceof Group).toBe(true)
  })
})
