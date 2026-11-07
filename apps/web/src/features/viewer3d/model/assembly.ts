import type { Catalog, Layout, LayoutAssembly, LayoutAssemblyJoint, WindowDesign } from '@dekopen/engine'
import { Box3, type BufferGeometry, Group, Mesh, Vector2, Vector3 } from 'three'
import { buildWindowModel, type BuildWindowModelInput, type WindowModel, type WindowModelPart } from './buildWindowModel'
import { createMaterialPalette, type MaterialPalette } from './materials'
import { barNodes } from './profiles'
import { buildSection } from './section'
import { sweepSection } from './sweep'

/**
 * Conjuntos (`layout.assembly`, del motor): varias ventanas completas en un solo modelo. Cada unidad se
 * construye con `buildWindowModel` y se ubica en planta; bay, bow y esquina giran cada paño según
 * `plan.facets` y sus postes salen de `plan.posts`.
 *
 * Planta del motor: x a lo largo del muro e y hacia el exterior. Modelo: X igual y Z hacia el interior,
 * así que z = −y. Un rumbo positivo (`heading`) lleva el paño hacia afuera: rotation.y = heading.
 */

const DEFAULT_DEPTH_MM = 70
const POST_RADIUS = 4

export interface UnitPlacement {
  /** Centro de la base de la unidad, en mm. */
  x: number
  y: number
  z: number
  /** Giro alrededor de Y (rad). */
  yaw: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Dónde cae en planta un punto del desarrollo que pertenece a un paño. */
function planPoint(assembly: LayoutAssembly, facetIndex: number, developedX: number): { x: number; z: number; yaw: number } {
  const facet = assembly.plan?.facets[facetIndex]
  if (!facet) return { x: developedX, z: 0, yaw: 0 }
  const start = Math.min(...assembly.units.filter((unit) => unit.facet === facetIndex).map((unit) => unit.rect.x))
  const length = Math.hypot(facet.to.x - facet.from.x, facet.to.y - facet.from.y) || 1
  const along = developedX - (Number.isFinite(start) ? start : 0)
  const x = facet.from.x + ((facet.to.x - facet.from.x) / length) * along
  const y = facet.from.y + ((facet.to.y - facet.from.y) / length) * along
  return { x, z: -y, yaw: rad(facet.heading) }
}

/** Ubicación de cada unidad del conjunto, en mm (origen sin centrar). */
export function placeUnits(assembly: LayoutAssembly, totalHeight: number): UnitPlacement[] {
  return assembly.units.map((unit) => {
    const base = totalHeight - unit.rect.y - unit.rect.h
    if (!assembly.plan) return { x: unit.rect.x + unit.rect.w / 2, y: base, z: 0, yaw: 0 }
    const point = planPoint(assembly, unit.facet, unit.rect.x + unit.rect.w / 2)
    return { x: point.x, y: base, z: point.z, yaw: point.yaw }
  })
}

interface JointBar {
  geometry: BufferGeometry
  x: number
  y: number
  z: number
  yaw: number
}

/** Poste o acople entre unidades: una barra redondeada del ancho que da el motor. Sin ancho, no hay nada que dibujar. */
function jointBar(joint: LayoutAssemblyJoint, assembly: LayoutAssembly, totalHeight: number, depth: number): JointBar | null {
  const post = assembly.plan?.posts.find((item) => item.jointId === joint.id)
  const vertical = joint.dir === 'vertical'
  const across = post ? post.face : vertical ? joint.rect.w : joint.rect.h
  const length = vertical ? joint.rect.h : joint.rect.w
  if (!(across > 0 && length > 0)) return null
  const section = buildSection(barNodes(across, -depth / 2, depth / 2, POST_RADIUS), { arcSteps: 3 })
  const from = vertical ? new Vector2(0, 0) : new Vector2(-length / 2, 0)
  const to = vertical ? new Vector2(0, length) : new Vector2(length / 2, 0)
  const geometry = sweepSection([from, to], section, { closed: false })
  if (!geometry) return null
  const base = totalHeight - joint.rect.y - joint.rect.h
  if (post) return { geometry, x: post.x, y: base, z: -post.y, yaw: rad(post.heading) }
  const center = joint.rect.x + joint.rect.w / 2
  const unit = assembly.units.find((item) => center >= item.rect.x - 1 && center <= item.rect.x + item.rect.w + 1)
  const point = assembly.plan ? planPoint(assembly, unit?.facet ?? 0, center) : { x: center, z: 0, yaw: 0 }
  return { geometry, x: point.x, y: vertical ? base : base + joint.rect.h / 2, z: point.z, yaw: point.yaw }
}

function paletteKey(design: WindowDesign): string {
  return [design.colorId, design.colorInId ?? '', design.glassId].join('|')
}

/** Modelo de un conjunto con la misma interfaz que una ventana sola. */
export function buildAssemblyModel(input: BuildWindowModelInput & { layout: Layout & { assembly: LayoutAssembly } }): WindowModel {
  const { layout, catalog, textures, onTextureLoad, quality } = input
  const assembly = layout.assembly
  const root = new Group()
  root.name = 'assembly3d'
  const content = new Group()
  root.add(content)

  const palettes = new Map<string, MaterialPalette>()
  const paletteFor = (design: WindowDesign) => {
    const key = paletteKey(design)
    let palette = palettes.get(key)
    if (!palette) {
      palette = createMaterialPalette(design, catalog, { sources: textures, onTextureLoad })
      palettes.set(key, palette)
    }
    return palette
  }

  const placements = placeUnits(assembly, layout.height)
  const units: WindowModel[] = assembly.units.map((unit, i) => {
    const model = buildWindowModel({ layout: unit.layout, design: unit.design, catalog, textures, onTextureLoad, quality, palette: paletteFor(unit.design) })
    const place = placements[i]
    model.root.position.set(place.x / 1000, place.y / 1000, place.z / 1000)
    model.root.rotation.y = place.yaw
    content.add(model.root)
    return model
  })

  const jointGeometries: BufferGeometry[] = []
  const depth = Math.max(DEFAULT_DEPTH_MM * 0.5, ...units.map((model) => model.size.depth * 1000))
  const first = assembly.units[0]
  if (first) {
    const material = paletteFor(first.design).exterior
    for (const joint of assembly.joints) {
      const bar = jointBar(joint, assembly, layout.height, depth)
      if (!bar) continue
      jointGeometries.push(bar.geometry)
      const mesh = new Mesh(bar.geometry, material)
      mesh.name = 'joint'
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.scale.setScalar(0.001)
      mesh.position.set(bar.x / 1000, bar.y / 1000, bar.z / 1000)
      mesh.rotation.y = bar.yaw
      content.add(mesh)
    }
  }

  // Cerrada: base en y = 0 y centrada en x y z, igual que una ventana sola.
  for (const model of units) model.setOpenAmount(0)
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(content)
  const center = box.getCenter(new Vector3())
  content.position.set(-center.x, -box.min.y, -center.z)
  const dimensions = box.getSize(new Vector3())

  const parts: WindowModelPart[] = units.flatMap((model, i) => model.parts.map((part) => ({ ...part, id: `${assembly.units[i].unitId}:${part.id}` })))
  let disposed = false
  return {
    root,
    size: { width: dimensions.x, height: dimensions.y, depth: dimensions.z },
    reach: Math.max(0, ...units.map((model) => model.reach)),
    parts,
    movable: units.some((model) => model.movable),
    setOpenAmount(amount) {
      for (const model of units) model.setOpenAmount(amount)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const model of units) model.dispose()
      for (const geometry of jointGeometries) geometry.dispose()
      for (const palette of palettes.values()) palette.dispose()
      palettes.clear()
      root.clear()
    },
  }
}

/** Ventana sola o conjunto, según lo que traiga el layout. */
export function buildSceneModel(input: BuildWindowModelInput): WindowModel {
  const { layout } = input
  if (layout.assembly && layout.assembly.units.length > 0) return buildAssemblyModel({ ...input, layout: layout as Layout & { assembly: LayoutAssembly } })
  return buildWindowModel(input)
}

/** Todos los diseños de una vista: el propio o, en un conjunto, los de sus unidades. */
export function designsOf(layout: Layout, design: WindowDesign): WindowDesign[] {
  return layout.assembly && layout.assembly.units.length > 0 ? layout.assembly.units.map((unit) => unit.design) : [design]
}

/** Solo lo que el modelo usa del catálogo: así un catálogo grande no reconstruye la escena. */
export function reduceCatalog(layout: Layout, design: WindowDesign, catalog: Catalog): Catalog {
  const designs = designsOf(layout, design)
  const layouts = layout.assembly && layout.assembly.units.length > 0 ? layout.assembly.units.map((unit) => unit.layout) : [layout]
  const colorIds = new Set(designs.flatMap((item) => [item.colorId, item.colorInId]).filter(Boolean))
  const lineIds = new Set(designs.map((item) => item.lineId))
  const glassIds = new Set([...designs.map((item) => item.glassId), ...layouts.flatMap((item) => item.panes.map((pane) => pane.glassId))].filter(Boolean))
  return {
    colors: catalog.colors.filter((color) => colorIds.has(color.id)),
    lines: catalog.lines.filter((line) => lineIds.has(line.id)).map((line) => ({ ...line, hardwareRules: [], accessoryRules: [], profiles: {}, typologyIds: [], colorIds: [] })),
    glass: catalog.glass.filter((glass) => glassIds.has(glass.id)),
    brands: [],
    profiles: [],
    items: [],
    brandSettings: [],
  }
}
