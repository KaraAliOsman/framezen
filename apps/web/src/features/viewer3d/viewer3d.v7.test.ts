import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createAssembly, type Catalog } from '@dekopen/engine'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { Box3, Mesh, MeshPhysicalMaterial, Vector2, Vector3 } from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type ArEnvironment, arItemFromUrl, arShareUrl, decideArMode, quickLookHref, sceneViewerIntent } from './ar/capability'
import { buildArScene, exportForAR } from './ar/export'
import { placementFromHit } from './ar/webxr'
import { FIXTURE_CATALOG, fixtureWindow } from './fixtures'
import { buildAssemblyModel, buildSceneModel, placeUnits, reduceCatalog } from './model/assembly'
import { type WindowModel } from './model/buildWindowModel'
import { heightToNormal } from './model/grainMaps'
import { applyGlassLook, createMaterialPalette, glassKindOf } from './model/materials'
import { frameNodes, gasketNodes, sashNodes } from './model/profiles'
import { buildSection, flipNodes, splitSection } from './model/section'
import { signedArea, sweepSection } from './model/sweep'
import { showcaseWindow } from './showcaseData'
import { generateStudioPixels, studioRadiance } from './studio/hdri'
import { contrastRatio, luminanceOfHex, studioLook, toneOf } from './studio/look'
import { tierFor } from './tier'

const catalog = SAMPLE_CATALOG as unknown as Catalog

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

/** Área con signo de un contorno cerrado de nodos, en (d, z). */
function nodeArea(nodes: { d: number; z: number }[]): number {
  return signedArea(nodes.map((node) => new Vector2(node.d, node.z)))
}

describe('secciones de perfil', () => {
  const frame = frameNodes({ face: 65, depth: 60, lip: 20, rebate: 21 })

  it('los contornos van antihorario y se mantienen así al reflejarlos', () => {
    expect(nodeArea(frame)).toBeGreaterThan(0)
    expect(nodeArea(flipNodes(frame, 60))).toBeGreaterThan(0)
    expect(nodeArea(sashNodes({ face: 78, z0: 22, z1: 68, overlapZ: 61, overlap: 7, floorZ: 32, bead: 20 }))).toBeGreaterThan(0)
    expect(nodeArea(gasketNodes(0, 40, 42))).toBeGreaterThan(0)
    expect(nodeArea(gasketNodes(0, 40, 38))).toBeGreaterThan(0)
  })

  it('un canto redondeado se expande a un arco con normales continuas; una arista viva corta la tira', () => {
    const square = buildSection([
      { d: 0, z: 0 },
      { d: 10, z: 0 },
      { d: 10, z: 10 },
      { d: 0, z: 10 },
    ])
    expect(square.strips).toHaveLength(4)
    const rounded = buildSection(
      [
        { d: 0, z: 0, r: 2 },
        { d: 10, z: 0, r: 2 },
        { d: 10, z: 10, r: 2 },
        { d: 0, z: 10, r: 2 },
      ],
      { arcSteps: 3 },
    )
    expect(rounded.strips).toHaveLength(1)
    for (const vertex of rounded.strips[0]) expect(Math.hypot(vertex.nd, vertex.nz)).toBeCloseTo(1, 5)
    expect(rounded.strips[0].some((vertex) => Math.abs(vertex.nd) > 0.2 && Math.abs(vertex.nz) > 0.2)).toBe(true)
  })

  it('bicolor: cada cara queda del lado de su mitad, sin perder tramos', () => {
    const section = buildSection(frame)
    const { exterior, interior } = splitSection(section, 30)
    const segments = (strips: typeof section.strips) => strips.reduce((sum, strip) => sum + strip.length - 1, 0)
    expect(segments(exterior.strips) + segments(interior.strips)).toBe(segments(section.strips))
    for (const strip of exterior.strips) for (let i = 1; i < strip.length; i++) expect((strip[i - 1].z + strip[i].z) / 2).toBeLessThan(30)
  })
})

describe('barrido con ingletes', () => {
  const box = buildSection(
    [
      { d: 0, z: 0 },
      { d: 20, z: 0 },
      { d: 20, z: 10 },
      { d: 0, z: 10 },
    ],
    { arcSteps: 1 },
  )
  const square = [new Vector2(0, 0), new Vector2(100, 0), new Vector2(100, 100), new Vector2(0, 100)]

  it('la esquina interior cae sobre la diagonal: inglete a 45°', () => {
    const geometry = sweepSection(square, box)!
    const position = geometry.getAttribute('position')
    const corners = new Set<string>()
    for (let i = 0; i < position.count; i++) corners.add(`${position.getX(i).toFixed(2)},${position.getY(i).toFixed(2)}`)
    for (const key of ['20.00,20.00', '80.00,20.00', '80.00,80.00', '20.00,80.00', '0.00,0.00']) expect(corners).toContain(key)
    geometry.dispose()
  })

  it('el sentido del polígono no cambia el resultado y las normales apuntan como las caras', () => {
    for (const path of [square, [...square].reverse()]) {
      const geometry = sweepSection(path, box)!
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      const index = geometry.index!
      const a = new Vector3()
      const b = new Vector3()
      const c = new Vector3()
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i))
        b.fromBufferAttribute(position, index.getX(i + 1))
        c.fromBufferAttribute(position, index.getX(i + 2))
        const face = b.clone().sub(a).cross(c.clone().sub(a))
        if (face.lengthSq() < 1e-9) continue
        const vertex = new Vector3().fromBufferAttribute(normal, index.getX(i))
        expect(face.dot(vertex)).toBeGreaterThan(0)
      }
      geometry.dispose()
    }
  })

  it('la veta corre a lo largo de cada pieza, en metros', () => {
    const geometry = sweepSection(square, box)!
    const uv = geometry.getAttribute('uv')
    let maxU = 0
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i))
    expect(maxU).toBeCloseTo(0.1, 3)
    geometry.dispose()
  })
})

describe('foliado', () => {
  it('una imagen plana da normales planas; un escalón inclina la normal contra la pendiente', () => {
    const flat = new Uint8ClampedArray(4 * 4 * 4).fill(128)
    const normals = heightToNormal(flat, 4, 4, 2)
    expect(Math.abs(normals[0] - 127.5)).toBeLessThan(1)
    expect(normals[2]).toBe(255)
    const step = new Uint8ClampedArray(8 * 1 * 4 * 8)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) step.fill(x < 4 ? 0 : 255, (y * 8 + x) * 4, (y * 8 + x) * 4 + 3)
    const relief = heightToNormal(step, 8, 8, 1)
    // En x = 3 la altura sube hacia la derecha: la normal se inclina hacia la izquierda.
    expect(relief[(4 * 8 + 3) * 4]).toBeLessThan(100)
  })
})

describe('estudio', () => {
  it('el mapa HDR es de verdad HDR, sin valores inválidos y sin energía de sobra', () => {
    const { data, width, height } = generateStudioPixels(128)
    expect(height).toBe(64)
    let max = 0
    let sum = 0
    let weight = 0
    for (let y = 0; y < height; y++) {
      const cos = Math.cos(((y + 0.5) / height - 0.5) * Math.PI)
      for (let x = 0; x < width; x++) {
        const value = data[(y * width + x) * 4 + 1]
        expect(Number.isFinite(value)).toBe(true)
        max = Math.max(max, value)
        sum += value * cos
        weight += cos
      }
    }
    expect(max).toBeGreaterThan(2)
    expect(sum / weight).toBeGreaterThan(0.5)
    expect(sum / weight).toBeLessThan(2.2)
  })

  it('al frente y atrás hay luz difusa: el vidrio refleja cielo, sin franjas recortadas', () => {
    const color: [number, number, number] = [0, 0, 0]
    const sample = (az: number) => {
      let peak = 0
      for (let step = 0; step < 80; step++) {
        studioRadiance(az + (step / 80) * 1.2 - 0.6, 0.05, color)
        peak = Math.max(peak, color[1])
      }
      return peak
    }
    expect(sample(0)).toBeGreaterThan(2)
    expect(sample(Math.PI)).toBeGreaterThan(2)
  })

  it.each([
    ['blanco', 0.91, 'smooth'],
    ['antracita', 0.047, 'smooth'],
    ['roble', 0.2, 'woodgrain'],
    ['nogal', 0.05, 'woodgrain'],
  ])('%s contrasta con su fondo en claro y en oscuro', (_name, luminance, finish) => {
    for (const dark of [false, true]) {
      const look = studioLook({ luminance, finish, dark })
      expect(contrastRatio(luminance, luminanceOfHex(look.backdrop.center))).toBeGreaterThan(2)
    }
  })

  it('el tono separa claros, maderas y oscuros', () => {
    expect(toneOf(0.9, 'smooth')).toBe('light')
    expect(toneOf(0.2, 'woodgrain')).toBe('wood')
    expect(toneOf(0.05, 'woodgrain')).toBe('dark')
    expect(toneOf(0.04, 'smooth')).toBe('dark')
    expect(toneOf(0.25, 'smooth')).toBe('mid')
  })

  it('un teléfono recibe menos resolución y sombras que un escritorio', () => {
    const phone = tierFor({ coarsePointer: true, shortSide: 390 })
    const desktop = tierFor({ coarsePointer: false, shortSide: 900, memoryGb: 16, cores: 12 })
    expect(phone.dpr[1]).toBeLessThan(desktop.dpr[1])
    expect(phone.shadowMap).toBeLessThan(desktop.shadowMap)
    expect(tierFor({ coarsePointer: false, shortSide: 900, memoryGb: 4 }).name).toBe('phone')
  })
})

describe('modelo detallado', () => {
  const countTriangles = (model: WindowModel) => {
    let triangles = 0
    model.root.traverse((object) => {
      if (object instanceof Mesh) triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3
    })
    return triangles
  }

  it('una ventana de dos hojas se queda dentro del presupuesto de un teléfono', () => {
    const model = buildSceneModel(showcaseWindow('casement_double', { colorId: 'blanco' }))
    expect(countTriangles(model)).toBeLessThan(30_000)
    model.dispose()
  })

  it('la hoja lleva bisagras y manilla modeladas y el doble vidriado dos hojas con separador', () => {
    const data = showcaseWindow('casement', { colorId: 'blanco' })
    const model = buildSceneModel(data)
    let handle = 0
    model.root.traverse((object) => {
      if (object.name === 'handle' && object instanceof Mesh) handle++
    })
    expect(handle).toBe(1)
    // El marco lleva los canutos fijos además de su perfil y el burlete.
    const frame = model.root.getObjectByName('frame')!
    expect(frame.children.length).toBeGreaterThanOrEqual(3)
    model.dispose()
  })

  it('guillotina: la hoja móvil sube y no se corre de lado', () => {
    const data = showcaseWindow('vertical_sliding', { colorId: 'blanco' })
    const model = buildSceneModel(data)
    const moving = model.parts.find((part) => part.motion.type === 'slide' && part.motion.travel !== 0)!
    expect(moving).toBeTruthy()
    model.setOpenAmount(1)
    expect(Math.abs(moving.object.position.y)).toBeGreaterThan(100)
    expect(moving.object.position.x).toBe(0)
    model.dispose()
  })

  it('celosía y zócalo se construyen', () => {
    for (const id of ['louver_fixed', 'door_zocalo'] as const) {
      const model = buildSceneModel(showcaseWindow(id, { colorId: 'nogal', colorInId: 'blanco' }))
      expect(countTriangles(model)).toBeGreaterThan(100)
      model.dispose()
    }
  })

  it('el vidrio no usa transmisión y el estudio ajusta su tinte y reflejo', () => {
    const data = showcaseWindow('casement', { colorId: 'blanco' })
    const model = buildSceneModel(data)
    applyGlassLook(model.root, { opacity: 0.3, reflect: 0.4 })
    let glass: MeshPhysicalMaterial | undefined
    model.root.traverse((object) => {
      if (object instanceof Mesh && object.material.userData.glass) glass = object.material
    })
    expect(glass?.transmission).toBe(0)
    expect(glass?.opacity).toBeCloseTo(0.3)
    expect(glass?.userData.reflect.value).toBe(0.4)
    model.dispose()
    expect(glassKindOf({ id: 'dvh-4-12-4-low-e', kind: 'dvh' })).toBe('lowE')
    expect(glassKindOf({ id: 'laminado', kind: 'laminated' })).toBe('laminated')
  })
})

describe('conjuntos', () => {
  const line = catalog.lines.find((item) => item.kind === 'casement')!
  const assembled = (preset: string) => {
    const design = createAssembly(preset, { lineId: line.id, colorId: 'blanco', glassId: 'dvh-4-12-4' }, catalog)
    return { design, layout: computeLayout(design, catalog), catalog }
  }

  it('dos ventanas unidas quedan una al lado de la otra, a escala', () => {
    const data = assembled('coupled_2')
    const model = buildSceneModel(data)
    model.root.updateMatrixWorld(true)
    const size = new Box3().setFromObject(model.root).getSize(new Vector3())
    expect(size.x).toBeCloseTo(data.layout.width / 1000, 2)
    expect(size.y).toBeCloseTo(data.layout.height / 1000, 2)
    expect(model.movable || model.parts.length === 0).toBe(true)
    model.dispose()
  })

  it('bay: los paños laterales giran y salen hacia el exterior (−Z), y el modelo queda centrado', () => {
    const data = assembled('bay')
    const places = placeUnits(data.layout.assembly!, data.layout.height)
    expect(places).toHaveLength(3)
    expect(places[0].yaw).toBeCloseTo(Math.PI / 4, 3)
    expect(places[1].yaw).toBeCloseTo(0, 3)
    expect(places[2].yaw).toBeCloseTo(-Math.PI / 4, 3)
    expect(places[1].z).toBeLessThan(places[0].z)
    const model = buildSceneModel(data)
    model.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(model.root)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.x + box.min.x).toBeCloseTo(0, 3)
    expect(model.size.depth).toBeGreaterThan(0.3)
    expect(() => model.dispose()).not.toThrow()
  })

  it('un poste solo se dibuja con el ancho que da el motor: sin dato no se inventa', () => {
    const data = assembled('bay')
    const joints = (layout: typeof data.layout) => {
      const model = buildSceneModel({ ...data, layout })
      let count = 0
      model.root.traverse((object) => {
        if (object.name === 'joint') count++
      })
      model.dispose()
      return count
    }
    const plan = data.layout.assembly!.plan!
    expect(joints(data.layout)).toBe(plan.posts.filter((post) => post.face > 0).length)
    const withPosts = structuredClone(data.layout)
    withPosts.assembly!.plan!.posts = plan.posts.map((post) => ({ ...post, face: 60 }))
    expect(joints(withPosts)).toBe(2)
  })

  it('bow: cinco paños con giro creciente', () => {
    const data = assembled('bow')
    const places = placeUnits(data.layout.assembly!, data.layout.height)
    expect(places).toHaveLength(5)
    expect(places[0].yaw).toBeGreaterThan(places[1].yaw)
    expect(places[2].yaw).toBeCloseTo(0, 3)
    const model = buildAssemblyModel({ ...data, layout: data.layout as never })
    model.setOpenAmount(1)
    model.setOpenAmount(0)
    model.dispose()
  })

  it('una paleta compartida no se libera con la unidad, sino con el conjunto', () => {
    const data = showcaseWindow('casement', { colorId: 'blanco' })
    const palette = createMaterialPalette(data.design, data.catalog)
    const spy = vi.fn()
    palette.exterior.addEventListener('dispose', spy)
    const model = buildSceneModel({ ...data, palette })
    model.dispose()
    expect(spy).not.toHaveBeenCalled()
    palette.dispose()
    expect(spy).toHaveBeenCalled()
  })

  it('el catálogo reducido conserva los colores, líneas y vidrios de todas las unidades', () => {
    const data = assembled('bay')
    const reduced = reduceCatalog(data.layout, data.design, data.catalog)
    expect(reduced.colors.map((color) => color.id)).toContain('blanco')
    expect(reduced.lines.length).toBeGreaterThan(0)
    expect(reduced.items).toHaveLength(0)
  })
})

describe('qué camino de AR tiene cada equipo', () => {
  const base: ArEnvironment = {
    userAgent: '',
    platform: 'Linux',
    maxTouchPoints: 0,
    anchorSupportsAr: false,
    embeddedWebKit: false,
    webXrAr: false,
    secureContext: true,
    canHost: false,
  }
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

  it('iPhone en Safari: Quick Look', () => {
    expect(decideArMode({ ...base, userAgent: iphone, anchorSupportsAr: true })).toBe('quick-look')
  })

  it('iPad que se presenta como Mac: Quick Look', () => {
    expect(decideArMode({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5, anchorSupportsAr: true })).toBe('quick-look')
  })

  it('iPhone dentro de WhatsApp o una vista incrustada: pide abrir el navegador', () => {
    expect(decideArMode({ ...base, userAgent: `${iphone} WhatsApp/2.24`, anchorSupportsAr: true })).toBe('open-in-browser')
    expect(decideArMode({ ...base, userAgent: iphone, embeddedWebKit: true })).toBe('open-in-browser')
    expect(decideArMode({ ...base, userAgent: `${iphone} CriOS/130.0`, embeddedWebKit: true })).toBe('quick-look')
  })

  it('Android: WebXR si hay ARCore; Scene Viewer solo si alguien aloja el GLB; si no, nada que prometer', () => {
    expect(decideArMode({ ...base, userAgent: pixel, webXrAr: true })).toBe('webxr')
    expect(decideArMode({ ...base, userAgent: pixel, canHost: true })).toBe('scene-viewer')
    expect(decideArMode({ ...base, userAgent: pixel })).toBe('unsupported')
    expect(decideArMode({ ...base, userAgent: pixel, webXrAr: true, secureContext: false })).toBe('unsupported')
  })

  it('Android dentro de otra app: pide abrir el navegador', () => {
    expect(decideArMode({ ...base, userAgent: pixel.replace('Pixel 8)', 'Pixel 8; wv)'), webXrAr: true })).toBe('open-in-browser')
  })

  it('escritorio: QR', () => {
    expect(decideArMode({ ...base, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0', platform: 'Win32' })).toBe('qr')
  })

  it('los enlaces llevan lo que cada sistema exige', () => {
    const intent = sceneViewerIntent('https://x.test/v.glb', { title: 'V1', fallbackUrl: 'https://x.test/p', wall: true })
    expect(intent).toMatch(/^intent:\/\/arvr\.google\.com\/scene-viewer\/1\.0\?/)
    expect(intent).toContain('file=https%3A%2F%2Fx.test%2Fv.glb')
    expect(intent).toContain('mode=ar_preferred')
    expect(intent).toContain('resizable=false')
    expect(intent).toContain('enable_vertical_placement=true')
    expect(intent).toContain('package=com.google.android.googlequicksearchbox')
    expect(intent).toContain('S.browser_fallback_url=https%3A%2F%2Fx.test%2Fp')
    expect(intent.endsWith(';end;')).toBe(true)
    expect(quickLookHref('blob:x')).toBe('blob:x#allowsContentScaling=0')
    const share = arShareUrl('https://x.test/p/abc?x=1', 'item-3')
    expect(arItemFromUrl(share)).toBe('item-3')
    expect(share).toContain('x=1')
  })
})

describe('colocación en WebXR', () => {
  const pose = (normal: [number, number, number], at: [number, number, number]) => {
    const matrix = new Float32Array(16)
    matrix.set(normal, 4)
    matrix.set(at, 12)
    return matrix
  }

  it('en el piso queda de pie, en el punto tocado y mirando al teléfono', () => {
    const place = placementFromHit(pose([0, 1, 0], [1, 0, 2]), { x: 1, z: 4 }, 1.2)
    expect(place.surface).toBe('floor')
    expect(place.position).toEqual({ x: 1, y: 0, z: 2 })
    expect(place.yaw).toBeCloseTo(0, 5)
  })

  it('en una pared queda centrada en el toque y su interior mira a la sala', () => {
    const place = placementFromHit(pose([1, 0, 0], [0, 1.4, -2]), { x: 2, z: 0 }, 1.2)
    expect(place.surface).toBe('wall')
    expect(place.position.y).toBeCloseTo(0.8, 5)
    expect(place.yaw).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('exportación para AR', () => {
  const data = showcaseWindow('casement', { colorId: 'blanco' })

  it('el modelo aplanado está en metros, a escala real, con una malla por material', async () => {
    const scene = await buildArScene(data, { keepAo: true })
    expect(scene.size.width).toBeCloseTo(data.design.width / 1000, 3)
    expect(scene.size.height).toBeCloseTo(data.design.height / 1000, 3)
    expect(scene.root.children.length).toBe(scene.materials)
    expect(scene.triangles).toBeLessThan(20_000)
    expect(scene.root.scale.x).toBe(1)
    scene.dispose()
    expect(scene.root.children).toHaveLength(0)
  })

  it('abre las hojas si se le pide, sin dejar nada del visor', async () => {
    const closed = await buildArScene(data, { keepAo: false })
    const opened = await buildArScene(data, { keepAo: false, openAmount: 1 })
    expect(opened.size.depth).toBeGreaterThan(closed.size.depth + 0.2)
    closed.dispose()
    opened.dispose()
  })

  it('USDZ: metros, eje Y, anclaje al plano pedido y paquete sin compresión', async () => {
    const asset = await exportForAR(data, 'usdz', { placement: 'wall' })
    expect(asset.blob.type).toBe('model/vnd.usdz+zip')
    expect(asset.blob.size).toBeGreaterThan(10_000)
    const files = unzipSync(new Uint8Array(await asset.blob.arrayBuffer()))
    const names = Object.keys(files)
    expect(names[0]).toBe('model.usda')
    const usda = strFromU8(files['model.usda'])
    expect(usda).toContain('metersPerUnit = 1')
    expect(usda).toContain('upAxis = "Y"')
    expect(usda).toContain('alignment = "vertical"')
  })

  it('el catálogo de ejemplo del visor también exporta (sin foliado que esperar)', async () => {
    const fixture = fixtureWindow('fixed', { colorId: 'blanco' })
    const scene = await buildArScene({ ...fixture, catalog: FIXTURE_CATALOG }, { keepAo: true })
    expect(scene.triangles).toBeGreaterThan(50)
    scene.dispose()
  })
})

describe('accesorios en 3D', () => {
  it('persiana, mosquitero y alféizar agregan piezas y el modelo sigue apoyado en el piso', () => {
    const plain = showcaseWindow('casement', { colorId: 'blanco' })
    const dressed = showcaseWindow('casement', { colorId: 'blanco' })
    const layout = {
      ...dressed.layout,
      attachments: {
        sill: { rect: { x: -25, y: dressed.layout.height, w: dressed.layout.width + 50, h: 30 } },
        rollerShutter: { type: 'monoblock', operation: 'strap', box: { x: 0, y: -180, w: dressed.layout.width, h: 180 }, guides: [{ x: 0, y: 0, w: 45, h: dressed.layout.height }] },
        insectScreen: { type: 'fixed' },
      },
    } as typeof dressed.layout
    const base = buildSceneModel(plain)
    const model = buildSceneModel({ ...dressed, layout })
    expect(model.size.height * 1000).toBeCloseTo(base.size.height * 1000 + 210, 3)
    expect(model.root.position.y).toBeCloseTo(0.03, 5)
    let screens = 0
    model.root.traverse((object) => {
      if (object instanceof Mesh && object.material.userData.screen) screens++
    })
    expect(screens).toBe(1)
    base.dispose()
    model.dispose()
  })
})
