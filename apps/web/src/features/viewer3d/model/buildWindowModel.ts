import { slidingPullSide, slidingVisibleRect, type TextureSources } from '@dekopen/documents'
import type { Catalog, Layout, LayoutSash, LayoutSlidingPanel, PaneFill, Rect, WindowDesign } from '@dekopen/engine'
import { Box2, BufferAttribute, BoxGeometry, type BufferGeometry, Group, type Material, Mesh, type MeshStandardMaterial, type Object3D, Vector2 } from 'three'
import { addAttachments, attachmentExtent } from './attachments'
import { boxAt, extrudePolygon, mergeAndDispose, type ModelSpace, offsetPolygon, outlineToModel, rectPath, toModel, toModelZ } from './geometry'
import { doorPlateGeometry, hingeGeometries, leverGeometry, pullGeometry, rosetteGeometry, weepCapGeometry } from './hardware'
import {
  clamp01,
  computeFoldingChains,
  computeSashMotion,
  computeSlidingTravel,
  defaultHandleSide,
  type HandleSide,
  handleLever,
  handleProgress,
  LIFT_SLIDE_RISE_MM,
  liftProgress,
  moveProgress,
  openingDirection,
  parallelProgress,
  resolveSlidingTracks,
  type RotateMotion,
  type SashMotion,
} from './kinematics'
import { createMaterialPalette, type MaterialPalette } from './materials'
import { barNodes, beadNodes, frameNodes, gasketNodes, mullionNodes, railNodes, sashNodes, sectionOf, shiftNodes, slidingFrameNodes, slidingPanelNodes } from './profiles'
import { buildSection, type Section, type SectionNode, splitSection } from './section'
import { sweepSection } from './sweep'

/** Medidas de detalle (mm). Lo que no viene en el Layout se modela con valores típicos de PVC. */
const DEFAULT_DEPTH = 60
const DEFAULT_FRAME_FACE = 64
/** Cuánto sobresale la hoja de la cara interior del marco. */
const SASH_PROUD = 8
/** Cuánto monta la hoja sobre la cara del marco. */
const SASH_OVERHANG = 7
const DOOR_HANDLE_HEIGHT = 1050
const GLASS_TUCK = 6
const BEAD_WIDTH = 20
const SLIDING_BEAD = 14
const SLIDING_LIP = 7
const TRACK_GAP = 6
/** Ángulo con que se mide cuánto sobresale la pila de un plegable (el 3D la encuadra con margen). */
const OPENING_FOLD_REACH = Math.PI / 2.2

export type PartMotion = SashMotion | { type: 'slide'; travel: number }

export interface WindowModelPart {
  id: string
  kind: 'sash' | 'panel'
  /** Grupo que se gira (en el punto de bisagra) o se desliza. */
  object: Group
  motion: PartMotion
}

export interface WindowModel {
  /** Escena lista para agregar: metros, base en y = 0, centrada en x y z. */
  root: Group
  /** Tamaño en metros. */
  size: { width: number; height: number; depth: number }
  /** Cuánto se adelantan las hojas abiertas fuera del plano del marco (m), para encuadrar. */
  reach: number
  parts: WindowModelPart[]
  /** Hay algo que abrir. */
  movable: boolean
  setOpenAmount(amount: number): void
  dispose(): void
}

export interface BuildWindowModelInput {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  /** Texturas subidas (data URL) e integradas ya cargadas; las mismas que el dibujo 2D. */
  textures?: TextureSources
  /** Avisa cuando llega una imagen de textura (el visor redibuja). */
  onTextureLoad?: () => void
  /** `ar` simplifica lo que un visor de realidad aumentada no aprovecha: una hoja de vidrio, menos curvas. */
  quality?: 'view' | 'ar'
  /** Paleta ya creada: un conjunto reutiliza la misma entre unidades iguales y la libera él. */
  palette?: MaterialPalette
}

/** Acumula geometrías por material y las fusiona en una malla por material. */
class PartBuilder {
  private readonly buckets = new Map<Material, BufferGeometry[]>()

  add(material: Material, geometry: BufferGeometry | null | undefined) {
    if (!geometry) return
    const wantsAo = (material as MeshStandardMaterial).vertexColors
    if (wantsAo && !geometry.getAttribute('color')) {
      const count = geometry.getAttribute('position').count
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(1), 3))
    } else if (!wantsAo) {
      geometry.deleteAttribute('color')
    }
    const list = this.buckets.get(material)
    if (list) list.push(geometry)
    else this.buckets.set(material, [geometry])
  }

  build(target: Object3D, name: string) {
    for (const [material, geometries] of this.buckets) {
      const merged = mergeAndDispose(geometries)
      if (!merged) continue
      const mesh = new Mesh(merged, material)
      mesh.name = name
      // El vidrio no proyecta sombra; todo lo demás sí, y la recibe: es lo que separa hoja y marco.
      const glass = Boolean(material.userData.glass)
      mesh.castShadow = !glass
      mesh.receiveShadow = !glass
      if (glass) mesh.renderOrder = 2
      target.add(mesh)
    }
    this.buckets.clear()
  }
}

interface BuildContext {
  space: ModelSpace
  palette: MaterialPalette
  arcSteps: number
  ar: boolean
}

/** Barre una sección de perfil; en bicolor reparte cada cara según de qué lado del plano medio queda. */
function addProfile(part: PartBuilder, ctx: BuildContext, path: Vector2[], section: Section, zMid: number, options: { closed?: boolean; weld?: boolean; material?: 'exterior' | 'interior' } = {}) {
  const { palette } = ctx
  const sweep = { closed: options.closed ?? true, weld: (options.weld ?? true) && !ctx.ar }
  if (options.material === 'interior') {
    part.add(palette.interior, sweepSection(path, section, sweep))
    return
  }
  if (palette.bicolor && !options.material) {
    const { exterior, interior } = splitSection(section, zMid)
    part.add(palette.exterior, sweepSection(path, exterior, sweep))
    part.add(palette.interior, sweepSection(path, interior, sweep))
    return
  }
  part.add(palette.exterior, sweepSection(path, section, sweep))
}

/** Nodos en coordenadas del modelo (z − D/2), que es en lo que se barren. */
function toModelNodes(ctx: BuildContext, nodes: SectionNode[]): SectionNode[] {
  return shiftNodes(nodes, -ctx.space.depth / 2)
}

interface GlazingSpec {
  /** Luz visible (contorno del modelo). */
  contour: Vector2[]
  /** Centro del vidrio en mm desde la cara exterior del marco. */
  zCenter: number
  thickness: number
  fill: PaneFill
  glassId: string | undefined
  /** Si la hoja es un doble vidriado con cámara. */
  insulated: boolean
}

/** Vidrio con sus hojas y separador, o panel ciego. El vidrio entra unos milímetros bajo el perfil. */
function addGlazing(part: PartBuilder, ctx: BuildContext, spec: GlazingSpec) {
  const { palette, space } = ctx
  const { contour, zCenter, thickness, fill } = spec
  const Z = (z: number) => toModelZ(space, z)
  const z0 = zCenter - thickness / 2
  const z1 = zCenter + thickness / 2
  const tucked = offsetPolygon(contour, GLASS_TUCK)
  if (fill === 'louver') {
    addLouvers(part, ctx, contour, zCenter)
    return
  }
  if (fill === 'panel') {
    if (palette.bicolor) {
      part.add(palette.exterior, extrudePolygon(tucked, Z(z0), Z(zCenter), { bevel: 0.8, alongX: false }))
      part.add(palette.interior, extrudePolygon(tucked, Z(zCenter), Z(z1), { bevel: 0.8, alongX: false }))
    } else {
      part.add(palette.exterior, extrudePolygon(tucked, Z(z0), Z(z1), { bevel: 0.8, alongX: false }))
    }
    return
  }
  const material = palette.glass(spec.glassId)
  if (!spec.insulated || ctx.ar) {
    part.add(material, extrudePolygon(tucked, Z(z0), Z(z1)))
    return
  }
  // Doble vidriado: dos hojas con cámara y separador; el reflejo doble es lo que delata un DVH de verdad.
  const lite = Math.min(5, thickness / 3)
  part.add(material, extrudePolygon(tucked, Z(z0), Z(z0 + lite)))
  part.add(material, extrudePolygon(tucked, Z(z1 - lite), Z(z1)))
  const spacerNodes: SectionNode[] = [
    { d: -GLASS_TUCK, z: Z(z0 + lite + 0.2) },
    { d: 3.2, z: Z(z0 + lite + 0.2), ao: 0.8 },
    { d: 3.2, z: Z(z1 - lite - 0.2), ao: 0.8 },
    { d: -GLASS_TUCK, z: Z(z1 - lite - 0.2) },
  ]
  part.add(palette.spacer, sweepSection(contour, buildSection(spacerNodes), { closed: true }))
}

/** Celosía: lamas fijas inclinadas que cubren la luz, del color exterior. */
function addLouvers(part: PartBuilder, ctx: BuildContext, contour: Vector2[], zCenter: number) {
  const box = new Box2().setFromPoints(contour)
  const width = box.max.x - box.min.x
  const slat = 62
  const pitch = 42
  const center = (box.min.x + box.max.x) / 2
  for (let y = box.min.y + pitch / 2; y < box.max.y; y += pitch) {
    const blade = new BoxGeometry(width + 2 * GLASS_TUCK, slat, 5)
    blade.rotateX(-Math.PI / 4)
    blade.translate(center, y, toModelZ(ctx.space, zCenter))
    part.add(ctx.palette.exterior, blade)
  }
}

/** Junquillo y burletes alrededor de la luz: anillo que crece hacia afuera desde el contorno. */
function addBeadAndGaskets(
  part: PartBuilder,
  ctx: BuildContext,
  options: { contour: Vector2[]; width: number; zGlassBack: number; zGlassFront: number; zTop: number; flip: boolean },
) {
  const { contour, width, zGlassBack, zGlassFront, zTop, flip } = options
  const { palette, space, arcSteps } = ctx
  const D = space.depth
  const toSection = (nodes: SectionNode[]) => buildSection(toModelNodes(ctx, nodes), { arcSteps })
  const mirror = (nodes: SectionNode[]) => (flip ? nodes.map((node) => ({ ...node, z: D - node.z })).reverse() : nodes)
  const bead = mirror(beadNodes(width, zGlassFront + 1.6, zTop).map((node) => ({ ...node, d: node.d - width })))
  part.add(palette.interior, sweepSection(contour, toSection(bead), { closed: true, weld: !ctx.ar }))
  const front = mirror(gasketNodes(0, zGlassFront + 0.1, zGlassFront + 1.7))
  const back = mirror(gasketNodes(0, zGlassBack - 0.1, zGlassBack - 2.1))
  part.add(palette.gasket, sweepSection(contour, toSection(front), { closed: true }))
  part.add(palette.gasket, sweepSection(contour, toSection(back), { closed: true }))
}

function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

function insetRect(rect: Rect, by: number): Rect {
  return { x: rect.x + by, y: rect.y + by, w: Math.max(0, rect.w - 2 * by), h: Math.max(0, rect.h - 2 * by) }
}

function touches(a: Rect, b: Rect, tolerance = 3): boolean {
  return a.x <= b.x + b.w + tolerance && b.x <= a.x + a.w + tolerance && a.y <= b.y + b.h + tolerance && b.y <= a.y + a.h + tolerance
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function handleAnchor(rect: Rect, face: number, side: HandleSide, isDoor: boolean, height: number): { x: number; y: number } {
  const midY = isDoor ? Math.min(Math.max(height - DOOR_HANDLE_HEIGHT, rect.y + 150), rect.y + rect.h - 150) : rect.y + rect.h / 2
  switch (side) {
    case 'left':
      return { x: rect.x + face / 2, y: midY }
    case 'right':
      return { x: rect.x + rect.w - face / 2, y: midY }
    case 'top':
      return { x: rect.x + rect.w / 2, y: rect.y + face / 2 }
    case 'bottom':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h - face / 2 }
  }
}

function emptyModel(): WindowModel {
  const root = new Group()
  return { root, size: { width: 0, height: 0, depth: 0 }, reach: 0, parts: [], movable: false, setOpenAmount() {}, dispose() {} }
}

/** Dos o tres bisagras repartidas por el canto, con sus canutos sobre el eje real de giro. */
function addHinges(frame: PartBuilder, part: PartBuilder, ctx: BuildContext, sash: LayoutSash, motion: RotateMotion, foldChild: boolean) {
  const { space, palette } = ctx
  const door = sash.opening.kind === 'door'
  const span = motion.axis === 'y' ? sash.rect.h : sash.rect.w
  const count = door ? 3 : 2
  const length = door ? 92 : 60
  const radius = door ? 7 : 5.5
  const start = motion.axis === 'y' ? sash.rect.y : sash.rect.x
  for (let i = 0; i < count; i++) {
    const t = 0.12 + (0.76 * i) / (count - 1)
    const along = start + span * t
    const center = motion.axis === 'y' ? toModel(space, motion.pivot.x, along) : toModel(space, along, motion.pivot.y)
    const hinge = hingeGeometries(length, radius)
    for (const geometry of [hinge.fixed, hinge.moving]) {
      if (motion.axis === 'x') geometry.rotateZ(Math.PI / 2)
      geometry.translate(center.x, center.y, toModelZ(space, motion.pivot.z))
    }
    ;(foldChild ? part : frame).add(palette.handle, hinge.fixed)
    part.add(palette.handle, hinge.moving)
  }
}

/**
 * Construye la ventana en three.js desde la geometría del motor.
 * Puro respecto de React: se puede probar sin WebGL. Llama a `dispose()` al desmontar.
 */
export function buildWindowModel({ layout, design, catalog, textures, onTextureLoad, quality = 'view', palette: sharedPalette }: BuildWindowModelInput): WindowModel {
  const frameRect = layout.frame?.rect ?? { x: 0, y: 0, w: layout.width, h: layout.height }
  const width = layout.width > 0 ? layout.width : frameRect.w
  const height = layout.height > 0 ? layout.height : frameRect.h
  if (!(width > 0 && height > 0)) return emptyModel()

  const ar = quality === 'ar'
  const line = catalog.lines.find((item) => item.id === design.lineId)
  const sliding = layout.sliding ?? []
  const trackInfo = resolveSlidingTracks(
    sliding.map((panel) => ({ kind: panel.kind, rail: panel.rail })),
    layout.rails ?? 1,
  )
  let depth = line?.depth && line.depth > 0 ? line.depth : DEFAULT_DEPTH
  if (sliding.length > 0) depth = Math.max(depth, trackInfo.count * 22 + 2 * SLIDING_LIP)

  const space: ModelSpace = { width, height, depth }
  const palette = sharedPalette ?? createMaterialPalette(design, catalog, { sources: textures, onTextureLoad })
  const ctx: BuildContext = { space, palette, arcSteps: ar ? 2 : 3, ar }
  const Z = (z: number) => toModelZ(space, z)
  const zMid = 0 // en el modelo, el plano medio del marco
  const nodesToSection = (nodes: SectionNode[]) => buildSection(toModelNodes(ctx, nodes), { arcSteps: ctx.arcSteps })

  const root = new Group()
  root.name = 'window3d'
  root.scale.setScalar(0.001)

  const sharedGeometries: BufferGeometry[] = []
  const parts: WindowModelPart[] = []
  const animators: ((handle: number, move: number) => void)[] = []
  let reach = 0

  const glassOf = (glassId: string | undefined) => catalog.glass.find((glass) => glass.id === (glassId ?? design.glassId))
  const glassThickness = (glassId: string | undefined, max = 24) => Math.min(Math.max(glassOf(glassId)?.thickness ?? 20, 4), max)
  const isInsulated = (glassId: string | undefined) => glassOf(glassId)?.kind === 'dvh'
  const contourOf = (rect: Rect, outline?: string) => {
    const shaped = outline ? outlineToModel(space, outline)?.[0] : undefined
    return shaped ?? rectPath(space, rect)
  }

  // ── Marco ────────────────────────────────────────────────────────────────
  const frame = new PartBuilder()
  const frameFace = (layout.frame?.face ?? 0) > 0 ? layout.frame.face : DEFAULT_FRAME_FACE
  const lip = clamp(depth * 0.33, 12, 26)
  const rebate = clamp(frameFace * 0.32, 12, 24)
  // Si la mayoría de las hojas abre hacia afuera, el rebaje del marco queda del lado exterior.
  const outward = layout.sashes.filter((sash) => sash.opening.kind !== 'fixed' && openingDirection(sash.opening) === 'out').length
  const inward = layout.sashes.filter((sash) => sash.opening.kind !== 'fixed' && openingDirection(sash.opening) === 'in').length
  const frameFlip = outward > inward
  const frameOutline = outlineToModel(space, layout.frame?.outline)?.[0]
  const framePath = frameOutline ?? rectPath(space, frameRect)
  const guillotine = layout.slidingSystem === 'vertical'
  const channel =
    sliding.length > 0 ? clamp((sliding[0] ? sliding[0].rect.y - frameRect.y : frameFace) - 12, frameFace * 0.4, frameFace - 6) : 0

  if (sliding.length > 0) {
    addProfile(frame, ctx, framePath, nodesToSection(slidingFrameNodes({ face: frameFace, depth, lip: SLIDING_LIP, channel })), zMid)
  } else {
    const nodes = frameNodes({ face: frameFace, depth, lip, rebate })
    addProfile(frame, ctx, framePath, sectionOf(toModelNodes(ctx, nodes), ctx.arcSteps, frameFlip ? { zSum: 0 } : undefined), zMid)
  }

  // ── Travesaños (los de unión francesa viajan con su hoja pasiva) ─────────
  const innerRect = insetRect(frameRect, frameFace)
  layout.mullions
    // Inversores (viajan con su hoja) y holguras de plegable (solo un espacio entre hojas): no son perfil fijo.
    .filter((mullion) => mullion.kind !== 'french' && mullion.kind !== 'fold')
    .forEach((mullion, index) => {
      const rect = intersectRect(mullion.rect, innerRect)
      if (!rect) return
      const vertical = mullion.dir === 'vertical'
      const across = vertical ? rect.w : rect.h
      const nudge = 0.15 + (index % 6) * 0.12 // evita caras coplanares entre travesaños que se cruzan
      const extend = rebate + 1
      const from = vertical ? toModel(space, rect.x + rect.w / 2, rect.y + rect.h + extend) : toModel(space, rect.x - extend, rect.y + rect.h / 2)
      const to = vertical ? toModel(space, rect.x + rect.w / 2, rect.y - extend) : toModel(space, rect.x + rect.w + extend, rect.y + rect.h / 2)
      const nodes = shiftNodes(mullionNodes({ width: across, depth: depth - 2 * nudge, lip, rebate }), nudge)
      addProfile(frame, ctx, [from, to], sectionOf(toModelNodes(ctx, nodes), ctx.arcSteps, frameFlip ? { zSum: 0 } : undefined), zMid, { closed: false, weld: false })
    })

  // ── Paños fijos en el marco ──────────────────────────────────────────────
  const fixedBack = lip + 2.6
  for (const pane of layout.panes) {
    if (pane.kind !== 'fixed' || sliding.length > 0) continue
    const contour = contourOf(pane.glassRect, pane.outline)
    const thickness = pane.fill === 'panel' ? 24 : Math.min(glassThickness(pane.glassId), depth - fixedBack - 8)
    const back = frameFlip ? depth - fixedBack - thickness : fixedBack
    addGlazing(frame, ctx, { contour, zCenter: back + thickness / 2, thickness, fill: pane.fill, glassId: pane.glassId, insulated: isInsulated(pane.glassId) })
    addBeadAndGaskets(frame, ctx, {
      contour,
      width: Math.min(BEAD_WIDTH, rebate - 0.6),
      zGlassBack: fixedBack,
      zGlassFront: fixedBack + thickness,
      zTop: depth - 0.6,
      flip: frameFlip,
    })
  }

  // ── Rieles de corredera ─────────────────────────────────────────────────
  const trackPitch = (depth - 2 * SLIDING_LIP) / trackInfo.count
  const trackCenter = (track: number) => SLIDING_LIP + trackPitch * (track + 0.5)
  if (sliding.length > 0) {
    const usedTracks = guillotine ? [] : [...new Set(trackInfo.tracks)]
    const sill = frameRect.y + frameRect.h - channel
    const head = frameRect.y + channel
    const xLeft = frameRect.x + channel
    const xRight = frameRect.x + frameRect.w - channel
    for (const track of usedTracks) {
      const z = Z(trackCenter(track))
      // Riel de aluminio abajo y guía del color del marco arriba.
      const rail = buildSection(shiftNodes(railNodes(11, 5), z), { arcSteps: 2 })
      frame.add(palette.rail, sweepSection([toModel(space, xLeft, sill), toModel(space, xRight, sill)], rail, { closed: false }))
      const guide = buildSection(shiftNodes(railNodes(9, 4), z), { arcSteps: 2 })
      frame.add(palette.exterior, sweepSection([toModel(space, xRight, head), toModel(space, xLeft, head)], guide, { closed: false }))
    }
  }

  // ── Drenaje: tapas en la cara exterior del travesaño inferior ────────────
  if (!frameOutline && !ar) {
    const count = frameRect.w > 1400 ? 3 : 2
    for (let i = 0; i < count; i++) {
      const cap = weepCapGeometry()
      if (!cap) continue
      cap.rotateY(Math.PI)
      const at = toModel(space, frameRect.x + (frameRect.w * (i + 1)) / (count + 1), frameRect.y + frameRect.h - frameFace * 0.36)
      cap.translate(at.x, at.y, Z(0) + 0.2)
      frame.add(palette.exterior, cap)
    }
  }

  const staticGroup = new Group()
  staticGroup.name = 'frame'
  root.add(staticGroup)

  // ── Hojas practicables ──────────────────────────────────────────────────
  const shared = (geometry: BufferGeometry | null) => {
    if (geometry) sharedGeometries.push(geometry)
    return geometry
  }
  const windowLever = shared(leverGeometry(88, ar ? 8 : 12))
  const doorLever = shared(leverGeometry(118, ar ? 8 : 12))

  // Inversor de unión francesa: va en la hoja pasiva (la que no lleva manilla).
  const frenchBySash = new Map<string, Rect[]>()
  for (const mullion of layout.mullions) {
    if (mullion.kind !== 'french') continue
    const neighbours = layout.sashes.filter((sash) => touches(sash.rect, mullion.rect))
    const passive = neighbours.find((sash) => !sash.handle) ?? neighbours[0]
    if (!passive) continue
    frenchBySash.set(passive.nodeId, [...(frenchBySash.get(passive.nodeId) ?? []), mullion.rect])
  }

  const addLever = (content: Group, lever: BufferGeometry, kind: LayoutSash['opening']['kind'], side: HandleSide, at: Vector2, z: number, mirrored = false) => {
    const group = new Group()
    group.name = 'handle'
    group.position.set(at.x, at.y, z)
    if (mirrored) group.rotation.y = Math.PI
    const inner = new Group()
    const { rest, turn } = handleLever(kind, side)
    inner.rotation.z = rest
    const mesh = new Mesh(lever, palette.handle)
    mesh.name = 'handle'
    mesh.castShadow = true
    inner.add(mesh)
    group.add(inner)
    content.add(group)
    animators.push((handle) => {
      inner.rotation.z = rest + turn * handle
    })
  }

  const addHandle = (content: Group, part: PartBuilder, sash: LayoutSash, zFront: number, zBack: number) => {
    // Las hojas pasivas (francesa, plegable) solo llevan manilla si el motor la pide.
    const side = sash.handle ?? (frenchBySash.has(sash.nodeId) || sash.passive ? undefined : defaultHandleSide(sash.opening))
    if (!side || sash.opening.kind === 'fixed') return
    const isDoor = sash.opening.kind === 'door'
    const anchor = handleAnchor(sash.rect, sash.face, side, isDoor, height)
    const at = toModel(space, anchor.x, anchor.y)
    const lying = side === 'top' || side === 'bottom'
    if (isDoor) {
      const place = (geometry: BufferGeometry, z: number, mirrored: boolean) => {
        if (mirrored) geometry.rotateY(Math.PI)
        geometry.translate(at.x, at.y, z)
        part.add(palette.handle, geometry)
      }
      const front = doorPlateGeometry()
      place(front.plate, Z(zFront), false)
      place(front.cylinder, Z(zFront), false)
      const rear = doorPlateGeometry()
      place(rear.plate, Z(zBack), true)
      place(rear.cylinder, Z(zBack), true)
      if (doorLever) {
        addLever(content, doorLever, sash.opening.kind, side, at, Z(zFront + 7))
        addLever(content, doorLever, sash.opening.kind, side === 'left' ? 'right' : 'left', at, Z(zBack - 7), true)
      }
      return
    }
    const rosette = rosetteGeometry(lying)
    rosette.translate(at.x, at.y, Z(zFront))
    part.add(palette.handle, rosette)
    if (windowLever) addLever(content, windowLever, sash.opening.kind, side, at, Z(zFront + 7))
  }

  // Plegables: cada hoja cuelga de la anterior (movimiento relativo), así que se arman todas y se enlazan al final.
  const zFor = (direction: 'in' | 'out') => {
    const z0 = lip + 1.5
    const z1 = depth + SASH_PROUD
    return direction === 'out' ? { z0: depth - z1, z1: depth - z0 } : { z0, z1 }
  }
  const foldingSashes = layout.sashes.filter((sash) => sash.opening.kind === 'folding')
  const foldRange = zFor('in')
  const foldSteps = new Map(
    computeFoldingChains(
      foldingSashes.map((sash) => ({ nodeId: sash.nodeId, rect: sash.rect, hinge: sash.opening.hinge ?? 'left', direction: openingDirection(sash.opening) })),
      { back: foldRange.z0, front: foldRange.z1 },
    ).map((step) => [step.nodeId, step]),
  )
  const contentById = new Map<string, Group>()
  const attachments: { pivot: Group; parent: string | null }[] = []

  for (const sash of layout.sashes) {
    const direction = openingDirection(sash.opening)
    const flip = direction === 'out' && sash.opening.kind !== 'fixed'
    const range = zFor(flip ? 'out' : 'in')
    const pane = layout.panes.find((item) => item.nodeId === sash.nodeId)
    const seat = zFor('in')
    const glassT = sash.fill === 'panel' ? 24 : glassThickness(pane?.glassId, 24)
    // Geometría en el sentido "hacia adentro"; el espejo la lleva al lado exterior si la hoja abre hacia afuera.
    const zGlass = seat.z0 + (seat.z1 - seat.z0) * 0.44
    const glassBack = zGlass - glassT / 2
    const glassFront = zGlass + glassT / 2
    const mirrorZ = (z: number) => (flip ? depth - z : z)
    const bead = Math.min(BEAD_WIDTH, sash.face * 0.28)

    const part = new PartBuilder()
    const nodes = sashNodes({
      face: sash.face,
      z0: seat.z0,
      z1: seat.z1,
      overlapZ: depth + 1,
      overlap: Math.min(SASH_OVERHANG, sash.face * 0.12),
      floorZ: Math.max(seat.z0 + 5.5, glassBack - 2.5),
      bead,
    })
    addProfile(part, ctx, rectPath(space, sash.rect), sectionOf(toModelNodes(ctx, nodes), ctx.arcSteps, flip ? { zSum: 0 } : undefined), zMid)
    const contour = rectPath(space, sash.glassRect)
    addGlazing(part, ctx, { contour, zCenter: mirrorZ(zGlass), thickness: glassT, fill: sash.fill, glassId: pane?.glassId, insulated: isInsulated(pane?.glassId) })
    addBeadAndGaskets(part, ctx, { contour, width: bead, zGlassBack: glassBack, zGlassFront: glassFront, zTop: seat.z1 - 0.7, flip })
    if (sash.zocalo) {
      // Zócalo: banda ciega bajo el vidrio, separada por un travesaño de hoja.
      const { panel, bar } = sash.zocalo
      const panelContour = rectPath(space, panel)
      addGlazing(part, ctx, { contour: panelContour, zCenter: mirrorZ(zGlass), thickness: 24, fill: 'panel', glassId: undefined, insulated: false })
      addBeadAndGaskets(part, ctx, { contour: panelContour, width: bead, zGlassBack: zGlass - 12, zGlassFront: zGlass + 12, zTop: seat.z1 - 0.7, flip })
      const from = toModel(space, bar.x - 8, bar.y + bar.h / 2)
      const to = toModel(space, bar.x + bar.w + 8, bar.y + bar.h / 2)
      addProfile(part, ctx, [from, to], nodesToSection(barNodes(bar.h, range.z0 + 1, range.z1 - 0.5, 3)), zMid, { closed: false, weld: false })
    }

    // Burlete del marco: la línea negra que asoma entre el labio exterior y la hoja.
    const lipEdge = clamp(frameFace - (sash.rect.x - frameRect.x), 6, 36)
    if (!ar) {
      const seal = gasketNodes(0, lip + 0.2, lip + 2, 1.3)
      const section = sectionOf(toModelNodes(ctx, seal), 2, flip ? { zSum: 0 } : undefined)
      frame.add(palette.gasket, sweepSection(rectPath(space, insetRect(sash.rect, lipEdge)), section, { closed: true }))
    }

    for (const rect of frenchBySash.get(sash.nodeId) ?? []) {
      const vertical = rect.h >= rect.w
      const from = vertical ? toModel(space, rect.x + rect.w / 2, rect.y + rect.h) : toModel(space, rect.x, rect.y + rect.h / 2)
      const to = vertical ? toModel(space, rect.x + rect.w / 2, rect.y) : toModel(space, rect.x + rect.w, rect.y + rect.h / 2)
      const section = nodesToSection(barNodes(vertical ? rect.w : rect.h, range.z0 + 1, range.z1 + 3, 3))
      addProfile(part, ctx, [from, to], section, zMid, { closed: false, weld: false, material: 'interior' })
    }

    const foldStep = foldSteps.get(sash.nodeId)
    const room = { left: sash.rect.x - innerRect.x, right: innerRect.x + innerRect.w - (sash.rect.x + sash.rect.w) }
    const motion: SashMotion = foldStep ? foldStep.motion : computeSashMotion(sash, { back: range.z0, front: range.z1 }, room)
    const pivot = new Group()
    pivot.name = `sash:${sash.nodeId}`
    const content = new Group()
    if (motion.type === 'rotate' || motion.type === 'parallel') {
      const p = toModel(space, motion.pivot.x, motion.pivot.y)
      const pz = Z(motion.pivot.z)
      pivot.position.set(p.x, p.y, pz)
      content.position.set(-p.x, -p.y, -pz)
    }
    if (motion.type === 'rotate' && !ar && sash.opening.kind !== 'pivot_v' && sash.opening.kind !== 'pivot_h') {
      addHinges(frame, part, ctx, sash, motion, Boolean(foldStep?.parent))
    }
    addHandle(content, part, sash, flip ? depth - seat.z0 : seat.z1, flip ? depth - seat.z1 : seat.z0)
    part.build(content, 'sash')
    pivot.add(content)
    contentById.set(sash.nodeId, content)
    attachments.push({ pivot, parent: foldStep?.parent ?? null })
    parts.push({ id: sash.nodeId, kind: 'sash', object: pivot, motion })
    if (motion.type === 'rotate') {
      const lever = motion.axis === 'y' ? sash.rect.w : sash.rect.h
      // Pivotantes: sale la mitad más larga. Plegables: la pila crece con cada hoja.
      const reachOf = sash.opening.kind === 'folding' ? lever * Math.abs(Math.sin(OPENING_FOLD_REACH)) : lever * Math.abs(Math.sin(motion.angle))
      reach = Math.max(reach, sash.opening.kind === 'pivot_v' || sash.opening.kind === 'pivot_h' ? (lever / 2) * Math.abs(Math.sin(motion.angle)) : reachOf)
    } else if (motion.type === 'parallel') {
      reach = Math.max(reach, motion.offset + sash.face)
    }

    if (motion.type === 'rotate') {
      animators.push((_handle, move) => {
        pivot.rotation.set(0, 0, 0)
        if (motion.axis === 'x') pivot.rotation.x = motion.angle * move
        else pivot.rotation.y = motion.angle * move
      })
    } else if (motion.type === 'parallel') {
      const origin = pivot.position.clone()
      const offsetZ = motion.offset
      animators.push((_handle, move) => {
        const progress = parallelProgress(move)
        pivot.position.set(origin.x + motion.travel * progress.slide, origin.y, origin.z + offsetZ * progress.out)
        pivot.rotation.set(motion.tilt * progress.tilt, 0, 0)
      })
    }
  }
  for (const { pivot, parent } of attachments) (parent ? (contentById.get(parent) ?? root) : root).add(pivot)

  // ── Correderas ──────────────────────────────────────────────────────────
  // Guillotina: el mismo cálculo de recorridos, sobre el eje vertical del dibujo (y hacia abajo).
  const travel = computeSlidingTravel(
    sliding.map((panel, i) => ({
      kind: panel.kind,
      direction: panel.direction === 'up' ? 'left' : panel.direction === 'down' ? 'right' : panel.direction,
      track: trackInfo.tracks[i],
      x0: guillotine ? panel.rect.y : panel.rect.x,
      x1: guillotine ? panel.rect.y + panel.rect.h : panel.rect.x + panel.rect.w,
    })),
  )
  const liftSlide = layout.slidingSystem === 'lift_slide'
  sliding.forEach((panel, i) => {
    const zc = trackCenter(trackInfo.tracks[i])
    const panelDepth = Math.max(10, Math.min(trackPitch - TRACK_GAP, 44))
    const z0 = zc - panelDepth / 2
    const z1 = zc + panelDepth / 2
    const pane = layout.panes.find((item) => item.nodeId === panel.panelId)
    const fill = pane?.fill ?? 'glass'
    const glassT = Math.min(glassThickness(pane?.glassId), panelDepth - 8)
    const part = new PartBuilder()
    const bead = Math.min(SLIDING_BEAD, panel.face * 0.2)
    const glassBack = zc - glassT / 2
    const floorZ = Math.max(z0 + 2.5, glassBack - 2.2)
    addProfile(part, ctx, rectPath(space, panel.rect), nodesToSection(slidingPanelNodes({ face: panel.face, z0, z1, floorZ, bead })), zMid)
    const contour = rectPath(space, panel.glassRect)
    addGlazing(part, ctx, { contour, zCenter: zc, thickness: Math.max(4, glassT), fill, glassId: pane?.glassId, insulated: isInsulated(pane?.glassId) })
    addBeadAndGaskets(part, ctx, { contour, width: bead, zGlassBack: glassBack, zGlassFront: glassBack + glassT, zTop: z1 - 0.6, flip: false })
    addInterlocks(part, ctx, panel, sliding, trackInfo.tracks, i, { z0, z1, gap: TRACK_GAP })

    const group = new Group()
    group.name = `panel:${panel.panelId}`

    if (panel.kind === 'moving') {
      // Tirador vertical en el canto de cierre (opuesto al sentido de apertura).
      const opensRight = (panel.direction ?? (travel[i] >= 0 ? 'right' : 'left')) === 'right'
      // El mismo canto que el dibujo: dos hojas a tope llevan sus tiradores uno a cada lado de la junta.
      const pullLeft = guillotine ? opensRight : slidingPullSide(layout, panel) === 'left'
      const seen = slidingVisibleRect(layout, panel)
      const x = pullLeft ? (seen.x + panel.glassRect.x) / 2 : (seen.x + seen.w + panel.glassRect.x + panel.glassRect.w) / 2
      const at = toModel(space, x, panel.rect.y + panel.rect.h / 2)
      if (guillotine) {
        // Guillotina: tirador acostado en el travesaño de abajo de la hoja.
        const lift = pullGeometry(120)
        if (lift) {
          lift.rotateZ(Math.PI / 2)
          const low = toModel(space, panel.rect.x + panel.rect.w / 2, panel.rect.y + panel.rect.h - panel.face / 2)
          lift.translate(low.x, low.y, Z(z1))
          part.add(palette.handle, lift)
        }
      } else if (liftSlide && doorLever) {
        // Elevadora: roseta larga con palanca que levanta la hoja.
        const rosette = rosetteGeometry(false)
        rosette.scale(1.15, 1.6, 1)
        rosette.translate(at.x, at.y, Z(z1))
        part.add(palette.handle, rosette)
        addLever(group, doorLever, 'casement', opensRight ? 'left' : 'right', at, Z(z1 + 7))
      } else {
        const pull = pullGeometry(Math.min(170, panel.rect.h * 0.3))
        if (pull) {
          pull.translate(at.x, at.y, Z(z1))
          part.add(palette.handle, pull)
        }
      }
    }

    part.build(group, 'panel')
    root.add(group)
    const motion: PartMotion = { type: 'slide', travel: travel[i] }
    parts.push({ id: panel.panelId, kind: 'panel', object: group, motion })
    if (travel[i] !== 0) {
      const lifts = liftSlide && panel.kind === 'moving'
      animators.push((_handle, move) => {
        if (guillotine) {
          group.position.y = -travel[i] * move
          return
        }
        group.position.x = travel[i] * move
        // Elevadora (HST): la hoja se levanta unos milímetros de sus rodillos antes de correr.
        if (lifts) group.position.y = LIFT_SLIDE_RISE_MM * liftProgress(move)
      })
    }
  })

  addAttachments(frame, space, palette, layout, frameFace)
  frame.build(staticGroup, 'frame')

  // El alféizar queda bajo el marco: el modelo sube para seguir apoyado en y = 0.
  const extent = attachmentExtent(layout)
  root.position.y = extent.below / 1000

  const movable = parts.some((part) =>
    part.motion.type === 'rotate' ? true : part.motion.type === 'parallel' ? part.motion.travel !== 0 || part.motion.offset > 0 : part.motion.type === 'slide' ? part.motion.travel !== 0 : false,
  )

  let disposed = false
  return {
    root,
    size: { width: width / 1000, height: (height + extent.above + extent.below) / 1000, depth: depth / 1000 },
    reach: reach / 1000,
    parts,
    movable,
    setOpenAmount(amount: number) {
      const a = clamp01(amount)
      const handle = handleProgress(a)
      const move = moveProgress(a)
      for (const animate of animators) animate(handle, move)
    },
    dispose() {
      if (disposed) return
      disposed = true
      root.traverse((object) => {
        if (object instanceof Mesh && !sharedGeometries.includes(object.geometry)) object.geometry.dispose()
      })
      for (const geometry of sharedGeometries) geometry.dispose()
      if (!sharedPalette) palette.dispose()
      root.clear()
    },
  }
}

/** Traslapo de correderas: cada hoja lleva un gancho y una felpa en el montante que cruza con su vecina. */
function addInterlocks(
  part: PartBuilder,
  ctx: BuildContext,
  panel: LayoutSlidingPanel,
  panels: LayoutSlidingPanel[],
  tracks: number[],
  index: number,
  range: { z0: number; z1: number; gap: number },
) {
  const { space, palette } = ctx
  const Z = (z: number) => toModelZ(space, z)
  const hook = Math.max(2, range.gap - 1.6)
  panels.forEach((other, j) => {
    if (j === index || tracks[j] === tracks[index]) return
    const crossing = Math.min(panel.rect.x + panel.rect.w, other.rect.x + other.rect.w) - Math.max(panel.rect.x, other.rect.x)
    // Guillotina: las hojas se traslapan arriba y abajo, no a los lados.
    if (crossing > panel.rect.w * 0.9) return
    const overlap = Math.min(panel.rect.x + panel.rect.w, other.rect.x + other.rect.w) - Math.max(panel.rect.x, other.rect.x)
    if (overlap < 10 || overlap > panel.face + 30) return
    // El montante de traslapo es el del lado donde está la vecina.
    const onRight = other.rect.x + other.rect.w / 2 > panel.rect.x + panel.rect.w / 2
    const x = onRight ? panel.rect.x + panel.rect.w - 6 : panel.rect.x + 6
    const bottom = toModel(space, x, panel.rect.y + panel.rect.h - 4)
    const top = toModel(space, x, panel.rect.y + 4)
    const towardInterior = tracks[j] > tracks[index]
    const zStart = towardInterior ? range.z1 - 1 : range.z0 - hook
    const zEnd = towardInterior ? range.z1 + hook : range.z0 + 1
    const barSection = buildSection(shiftNodes(barNodes(9, zStart, zEnd, 1.2), -space.depth / 2), { arcSteps: 2 })
    addProfile(part, ctx, [bottom, top], barSection, 0, { closed: false, weld: false })
    // Felpa oscura a un costado del gancho.
    const brushX = onRight ? x - 8 : x + 8
    const felt = boxAt(toModel(space, brushX, 0).x, (bottom.y + top.y) / 2, Z(towardInterior ? range.z1 + 0.6 : range.z0 - 0.6), 4, bottom.distanceTo(top), 1.6)
    part.add(palette.gasket, felt)
  })
}

