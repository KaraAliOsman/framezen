import type { Catalog, Layout, LayoutSash, Rect, WindowDesign } from '@framezen/engine'
import { type BufferGeometry, CapsuleGeometry, CylinderGeometry, Group, type Material, Mesh, type Object3D } from 'three'
import {
  boxAt,
  extrudePolygon,
  mergeAndDispose,
  type ModelSpace,
  outlineToModel,
  rectBand,
  ringBands,
  roundedRectPoints,
  toModel,
  toModelZ,
} from './geometry'
import {
  clamp01,
  computeSashMotion,
  computeSlidingTravel,
  defaultHandleSide,
  type HandleSide,
  handleLever,
  handleProgress,
  moveProgress,
  openingDirection,
  resolveSlidingTracks,
  type SashMotion,
} from './kinematics'
import { createMaterialPalette, type MaterialPalette } from './materials'

/** Medidas de detalle (mm). Lo que no viene en el Layout se modela con valores típicos de PVC. */
const DEFAULT_DEPTH = 60
const DEFAULT_FRAME_FACE = 64
const BEVEL = 2.2
const SASH_PROTRUDE = 10
const SASH_EXTRA_DEPTH = 6
const GASKET_WIDTH = 2.5
const GASKET_DEPTH = 3
const GASKET_EMBED = 0.8
const DOOR_HANDLE_HEIGHT = 1050
const GLASS_TUCK = 6

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
}

/** Acumula geometrías por material y las fusiona en una malla por material. */
class PartBuilder {
  private readonly buckets = new Map<Material, BufferGeometry[]>()

  add(material: Material, geometry: BufferGeometry | null | undefined) {
    if (!geometry) return
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
      target.add(mesh)
    }
    this.buckets.clear()
  }
}

interface BuildContext {
  space: ModelSpace
  palette: MaterialPalette
}

interface ProfileRingSpec {
  rect: Rect
  face: number
  /** Profundidad que ocupa el perfil: z0 lado exterior, z1 lado interior (mm desde la cara exterior del marco). */
  z0: number
  z1: number
  /** Ancho del junquillo (0 = sin junquillo). */
  bead: number
  beadDepth: number
  beadRecess: number
  /** Caras del vidrio, para los burletes. */
  glass?: { back: number; front: number }
}

/** Anillo de perfil: cuerpo, escalón interior con junquillo y burletes negros contra el vidrio. */
function addProfileRing(part: PartBuilder, ctx: BuildContext, spec: ProfileRingSpec) {
  const { space, palette } = ctx
  const { rect, face, z0, z1 } = spec
  if (!(face > 0) || !(z1 > z0)) return
  const Z = (z: number) => toModelZ(space, z)
  const bead = spec.bead > 0 && spec.bead < face - 6 ? spec.bead : 0
  const beadDepth = bead ? Math.min(spec.beadDepth, (z1 - z0) * 0.6) : 0
  const zStep = z1 - beadDepth

  const full = ringBands(space, rect, 0, face)
  if (palette.bicolor) {
    const zMid = Math.min((z0 + z1) / 2, zStep)
    for (const band of full) {
      part.add(palette.exterior, extrudePolygon(band.points, Z(z0), Z(zMid), { bevel: BEVEL, alongX: band.alongX }))
      if (zStep > zMid) part.add(palette.interior, extrudePolygon(band.points, Z(zMid), Z(zStep), { bevel: BEVEL, alongX: band.alongX }))
    }
  } else {
    for (const band of full) part.add(palette.exterior, extrudePolygon(band.points, Z(z0), Z(zStep), { bevel: BEVEL, alongX: band.alongX }))
  }

  if (bead) {
    for (const band of ringBands(space, rect, 0, face - bead)) {
      part.add(palette.interior, extrudePolygon(band.points, Z(zStep), Z(z1), { bevel: BEVEL, alongX: band.alongX }))
    }
    for (const band of ringBands(space, rect, face - bead, face)) {
      part.add(palette.interior, extrudePolygon(band.points, Z(zStep), Z(z1 - spec.beadRecess), { bevel: 1.8, alongX: band.alongX }))
    }
  }

  if (spec.glass) {
    // El burlete se mete un poco en el perfil y se separa del vidrio para no compartir caras.
    const gaskets = ringBands(space, rect, face - GASKET_EMBED, face + GASKET_WIDTH)
    for (const band of gaskets) {
      part.add(palette.gasket, extrudePolygon(band.points, Z(spec.glass.front + 0.3), Z(spec.glass.front + GASKET_DEPTH)))
      part.add(palette.gasket, extrudePolygon(band.points, Z(spec.glass.back - GASKET_DEPTH), Z(spec.glass.back - 0.3)))
    }
  }
}

/** Losa de vidrio (o panel ciego) centrada en zCenter. */
function addInfill(part: PartBuilder, ctx: BuildContext, rect: Rect, zCenter: number, thickness: number, fill: 'glass' | 'panel', glassId: string | undefined, outline?: string) {
  const { space, palette } = ctx
  if (!(rect.w > 0 && rect.h > 0)) return
  const Z = (z: number) => toModelZ(space, z)
  const z0 = zCenter - thickness / 2
  const z1 = zCenter + thickness / 2
  const contour = outline ? outlineToModel(space, outline)?.[0] : undefined
  if (fill === 'panel') {
    const points = contour ?? rectBand(space, rect).points
    if (palette.bicolor) {
      part.add(palette.exterior, extrudePolygon(points, Z(z0), Z(zCenter), { bevel: 0.8, alongX: false }))
      part.add(palette.interior, extrudePolygon(points, Z(zCenter), Z(z1), { bevel: 0.8, alongX: false }))
    } else {
      part.add(palette.exterior, extrudePolygon(points, Z(z0), Z(z1), { bevel: 0.8, alongX: false }))
    }
    return
  }
  const material = palette.glass(glassId)
  if (contour) {
    part.add(material, extrudePolygon(contour, Z(z0), Z(z1)))
    return
  }
  // El vidrio entra unos milímetros bajo el perfil (el motor entrega la luz visible).
  const center = toModel(space, rect.x + rect.w / 2, rect.y + rect.h / 2)
  part.add(material, boxAt(center.x, center.y, Z(zCenter), rect.w + 2 * GLASS_TUCK, rect.h + 2 * GLASS_TUCK, thickness))
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

/** Palanca de manilla: cuello + empuñadura que apunta hacia −Y desde el pivote. */
function createLeverGeometry(length: number): BufferGeometry | null {
  const neck = new CylinderGeometry(6.5, 7.5, 16, 20)
  neck.rotateX(Math.PI / 2)
  neck.translate(0, 0, 8)
  const grip = new CapsuleGeometry(7.5, length, 6, 16)
  grip.scale(1, 1, 0.8)
  grip.translate(0, -length / 2 + 4, 20)
  return mergeAndDispose([neck, grip])
}

function emptyModel(): WindowModel {
  const root = new Group()
  return { root, size: { width: 0, height: 0, depth: 0 }, reach: 0, parts: [], movable: false, setOpenAmount() {}, dispose() {} }
}

/**
 * Construye la ventana en three.js desde la geometría del motor.
 * Puro respecto de React: se puede probar sin WebGL. Llama a `dispose()` al desmontar.
 */
export function buildWindowModel({ layout, design, catalog }: BuildWindowModelInput): WindowModel {
  const frameRect = layout.frame?.rect ?? { x: 0, y: 0, w: layout.width, h: layout.height }
  const width = layout.width > 0 ? layout.width : frameRect.w
  const height = layout.height > 0 ? layout.height : frameRect.h
  if (!(width > 0 && height > 0)) return emptyModel()

  const line = catalog.lines.find((item) => item.id === design.lineId)
  const sliding = layout.sliding ?? []
  const trackInfo = resolveSlidingTracks(
    sliding.map((panel) => ({ kind: panel.kind, rail: panel.rail })),
    layout.rails ?? 1,
  )
  let depth = line?.depth && line.depth > 0 ? line.depth : DEFAULT_DEPTH
  if (sliding.length > 0) depth = Math.max(depth, trackInfo.count * 22 + 8)

  const space: ModelSpace = { width, height, depth }
  const palette = createMaterialPalette(design, catalog)
  const ctx: BuildContext = { space, palette }
  const Z = (z: number) => toModelZ(space, z)

  const root = new Group()
  root.name = 'window3d'
  root.scale.setScalar(0.001)

  const sharedGeometries: BufferGeometry[] = []
  const parts: WindowModelPart[] = []
  const animators: ((handle: number, move: number) => void)[] = []
  let reach = 0

  const glassOf = (glassId: string | undefined) => catalog.glass.find((glass) => glass.id === (glassId ?? design.glassId))
  const glassThickness = (glassId: string | undefined, max = 24) => Math.min(Math.max(glassOf(glassId)?.thickness ?? 20, 4), max)

  // ── Marco ────────────────────────────────────────────────────────────────
  const frame = new PartBuilder()
  const frameFace = (layout.frame?.face ?? 0) > 0 ? layout.frame.face : DEFAULT_FRAME_FACE
  const frameGlassT = glassThickness(design.glassId)
  const frameGlass = { back: depth / 2 - frameGlassT / 2, front: depth / 2 + frameGlassT / 2 }
  const outer = outlineToModel(space, layout.frame?.outline)?.[0]
  const inner = outlineToModel(space, layout.frame?.innerOutline)?.[0]

  if (outer && inner) {
    // Formas especiales (arco, trapecio, triángulo): perfil continuo sin ingletes.
    if (palette.bicolor) {
      frame.add(palette.exterior, extrudePolygon(outer, Z(0), Z(depth / 2), { bevel: BEVEL, holes: [inner] }))
      frame.add(palette.interior, extrudePolygon(outer, Z(depth / 2), Z(depth), { bevel: BEVEL, holes: [inner] }))
    } else {
      frame.add(palette.exterior, extrudePolygon(outer, Z(0), Z(depth), { bevel: BEVEL, holes: [inner] }))
    }
  } else {
    addProfileRing(frame, ctx, {
      rect: frameRect,
      face: frameFace,
      z0: 0,
      z1: depth,
      bead: sliding.length > 0 ? 0 : 20,
      beadDepth: 22,
      beadRecess: 4,
      glass: sliding.length > 0 ? undefined : frameGlass,
    })
  }

  // ── Travesaños (los de unión francesa viajan con su hoja pasiva) ─────────
  const innerRect = insetRect(frameRect, frameFace)
  layout.mullions
    .filter((mullion) => mullion.kind !== 'french')
    .forEach((mullion, index) => {
      const rect = intersectRect(mullion.rect, innerRect)
      if (!rect) return
      const band = rectBand(space, rect)
      band.alongX = mullion.dir === 'horizontal'
      const inset = 1 + (index % 6) * 0.3 // evita caras coplanares entre travesaños que se cruzan
      if (palette.bicolor) {
        frame.add(palette.exterior, extrudePolygon(band.points, Z(inset), Z(depth / 2), { bevel: BEVEL, alongX: band.alongX }))
        frame.add(palette.interior, extrudePolygon(band.points, Z(depth / 2), Z(depth - inset), { bevel: BEVEL, alongX: band.alongX }))
      } else {
        frame.add(palette.exterior, extrudePolygon(band.points, Z(inset), Z(depth - inset), { bevel: BEVEL, alongX: band.alongX }))
      }
      if (sliding.length === 0) {
        const strips: Rect[] =
          mullion.dir === 'vertical'
            ? [
                { x: rect.x - GASKET_WIDTH, y: rect.y, w: GASKET_WIDTH + GASKET_EMBED, h: rect.h },
                { x: rect.x + rect.w - GASKET_EMBED, y: rect.y, w: GASKET_WIDTH + GASKET_EMBED, h: rect.h },
              ]
            : [
                { x: rect.x, y: rect.y - GASKET_WIDTH, w: rect.w, h: GASKET_WIDTH + GASKET_EMBED },
                { x: rect.x, y: rect.y + rect.h - GASKET_EMBED, w: rect.w, h: GASKET_WIDTH + GASKET_EMBED },
              ]
        for (const strip of strips) {
          const points = rectBand(space, strip).points
          frame.add(palette.gasket, extrudePolygon(points, Z(frameGlass.front + 0.3), Z(frameGlass.front + GASKET_DEPTH)))
          frame.add(palette.gasket, extrudePolygon(points, Z(frameGlass.back - GASKET_DEPTH), Z(frameGlass.back - 0.3)))
        }
      }
    })

  // ── Paños fijos en el marco ──────────────────────────────────────────────
  for (const pane of layout.panes) {
    if (pane.kind !== 'fixed') continue
    addInfill(frame, ctx, pane.glassRect, depth / 2, glassThickness(pane.glassId), pane.fill, pane.glassId, pane.outline)
  }

  // ── Rieles de corredera ─────────────────────────────────────────────────
  const trackPitch = depth / trackInfo.count
  const trackCenter = (track: number) => trackPitch * (track + 0.5)
  if (sliding.length > 0) {
    const usedTracks = [...new Set(trackInfo.tracks)]
    const railLength = innerRect.w
    const bottom = frameRect.y + frameRect.h - frameFace
    const top = frameRect.y + frameFace
    for (const track of usedTracks) {
      // Riel abajo y guía arriba; entran 1 mm en el marco para no compartir caras con él.
      const c = toModel(space, innerRect.x + railLength / 2, bottom - 5)
      frame.add(palette.exterior, boxAt(c.x, c.y, Z(trackCenter(track)), railLength + 2, 12, 4))
      const t = toModel(space, innerRect.x + railLength / 2, top + 4)
      frame.add(palette.exterior, boxAt(t.x, t.y, Z(trackCenter(track)), railLength + 2, 10, 3))
    }
  }

  const staticGroup = new Group()
  staticGroup.name = 'frame'
  frame.build(staticGroup, 'frame')
  root.add(staticGroup)

  // ── Hojas practicables ──────────────────────────────────────────────────
  const windowLever = createLeverGeometry(88)
  const doorLever = createLeverGeometry(118)
  if (windowLever) sharedGeometries.push(windowLever)
  if (doorLever) sharedGeometries.push(doorLever)

  // Inversor de unión francesa: va en la hoja pasiva (la que no lleva manilla).
  const frenchBySash = new Map<string, Rect[]>()
  for (const mullion of layout.mullions) {
    if (mullion.kind !== 'french') continue
    const neighbours = layout.sashes.filter((sash) => touches(sash.rect, mullion.rect))
    const passive = neighbours.find((sash) => !sash.handle) ?? neighbours[0]
    if (!passive) continue
    frenchBySash.set(passive.nodeId, [...(frenchBySash.get(passive.nodeId) ?? []), mullion.rect])
  }

  const addHandle = (content: Group, part: PartBuilder, sash: LayoutSash, zFront: number) => {
    // La hoja pasiva de una unión francesa solo lleva manilla si el motor la pide.
    const side = sash.handle ?? (frenchBySash.has(sash.nodeId) ? undefined : defaultHandleSide(sash.opening))
    if (!side || sash.opening.kind === 'fixed') return
    const isDoor = sash.opening.kind === 'door'
    const anchor = handleAnchor(sash.rect, sash.face, side, isDoor, height)
    const at = toModel(space, anchor.x, anchor.y)
    const lying = side === 'top' || side === 'bottom'
    const rosetteW = isDoor ? 34 : lying ? 66 : 26
    const rosetteH = isDoor ? 210 : lying ? 26 : 66
    const rosette = roundedRectPoints(rosetteW, rosetteH, isDoor ? 9 : 7).map((p) => p.add(at))
    part.add(palette.handle, extrudePolygon(rosette, Z(zFront), Z(zFront + 9), { bevel: 2 }))
    const leverGeometry = isDoor ? doorLever : windowLever
    if (!leverGeometry) return
    const lever = new Group()
    lever.name = 'handle'
    lever.position.set(at.x, at.y, Z(zFront + 9))
    const { rest, turn } = handleLever(sash.opening.kind, side)
    lever.rotation.z = rest
    const mesh = new Mesh(leverGeometry, palette.handle)
    mesh.name = 'handle'
    lever.add(mesh)
    content.add(lever)
    animators.push((handle) => {
      lever.rotation.z = rest + turn * handle
    })
  }

  for (const sash of layout.sashes) {
    const direction = openingDirection(sash.opening)
    const sashDepth = depth + SASH_EXTRA_DEPTH
    const z1 = direction === 'out' && sash.opening.kind !== 'fixed' ? depth - 4 : depth + SASH_PROTRUDE
    const z0 = z1 - sashDepth
    const pane = layout.panes.find((item) => item.nodeId === sash.nodeId)
    const glassT = glassThickness(pane?.glassId, 24)
    const zGlass = (z0 + z1) / 2

    const part = new PartBuilder()
    addProfileRing(part, ctx, {
      rect: sash.rect,
      face: sash.face,
      z0,
      z1,
      bead: 20,
      beadDepth: 24,
      beadRecess: 3,
      glass: sash.fill === 'glass' ? { back: zGlass - glassT / 2, front: zGlass + glassT / 2 } : undefined,
    })
    addInfill(part, ctx, sash.glassRect, zGlass, sash.fill === 'panel' ? 24 : glassT, sash.fill, pane?.glassId)

    for (const rect of frenchBySash.get(sash.nodeId) ?? []) {
      const band = rectBand(space, rect)
      band.alongX = rect.w > rect.h
      part.add(palette.interior, extrudePolygon(band.points, Z(z0 + 1), Z(z1 + 3), { bevel: BEVEL, alongX: band.alongX }))
    }

    const motion = computeSashMotion(sash, { back: z0, front: z1 })
    const pivot = new Group()
    pivot.name = `sash:${sash.nodeId}`
    const content = new Group()
    if (motion.type === 'rotate') {
      const p = toModel(space, motion.pivot.x, motion.pivot.y)
      const pz = Z(motion.pivot.z)
      pivot.position.set(p.x, p.y, pz)
      content.position.set(-p.x, -p.y, -pz)
    }
    addHandle(content, part, sash, z1)
    part.build(content, 'sash')
    pivot.add(content)
    root.add(pivot)
    parts.push({ id: sash.nodeId, kind: 'sash', object: pivot, motion })
    if (motion.type === 'rotate') {
      const lever = motion.axis === 'y' ? sash.rect.w : sash.rect.h
      reach = Math.max(reach, lever * Math.abs(Math.sin(motion.angle)))
    }

    if (motion.type === 'rotate') {
      animators.push((_handle, move) => {
        pivot.rotation.set(0, 0, 0)
        if (motion.axis === 'x') pivot.rotation.x = motion.angle * move
        else pivot.rotation.y = motion.angle * move
      })
    }
  }

  // ── Correderas ──────────────────────────────────────────────────────────
  const travel = computeSlidingTravel(
    sliding.map((panel, i) => ({ kind: panel.kind, direction: panel.direction, track: trackInfo.tracks[i], x0: panel.rect.x, x1: panel.rect.x + panel.rect.w })),
  )
  sliding.forEach((panel, i) => {
    const zc = trackCenter(trackInfo.tracks[i])
    const panelDepth = Math.max(10, Math.min(trackPitch - 4, 44))
    const z0 = zc - panelDepth / 2
    const z1 = zc + panelDepth / 2
    const pane = layout.panes.find((item) => item.nodeId === panel.panelId)
    const glassT = Math.min(glassThickness(pane?.glassId), panelDepth - 6)
    const part = new PartBuilder()
    addProfileRing(part, ctx, {
      rect: panel.rect,
      face: panel.face,
      z0,
      z1,
      bead: 14,
      beadDepth: Math.min(12, panelDepth * 0.45),
      beadRecess: 2,
      glass: { back: zc - glassT / 2, front: zc + glassT / 2 },
    })
    addInfill(part, ctx, panel.glassRect, zc, Math.max(4, glassT), pane?.fill ?? 'glass', pane?.glassId)

    if (panel.kind === 'moving') {
      // Tirador vertical en el canto de cierre (opuesto al sentido de apertura).
      const opensRight = (panel.direction ?? (travel[i] >= 0 ? 'right' : 'left')) === 'right'
      const x = opensRight ? panel.rect.x + panel.face / 2 : panel.rect.x + panel.rect.w - panel.face / 2
      const at = toModel(space, x, panel.rect.y + panel.rect.h / 2)
      const pull = roundedRectPoints(18, Math.min(160, panel.rect.h * 0.3), 7).map((p) => p.add(at))
      part.add(palette.handle, extrudePolygon(pull, Z(z1), Z(z1 + 12), { bevel: 2.5 }))
    }

    const group = new Group()
    group.name = `panel:${panel.panelId}`
    part.build(group, 'panel')
    root.add(group)
    const motion: PartMotion = { type: 'slide', travel: travel[i] }
    parts.push({ id: panel.panelId, kind: 'panel', object: group, motion })
    if (travel[i] !== 0) {
      animators.push((_handle, move) => {
        group.position.x = travel[i] * move
      })
    }
  })

  const movable = parts.some((part) => (part.motion.type === 'rotate' ? true : part.motion.type === 'slide' ? part.motion.travel !== 0 : false))

  let disposed = false
  return {
    root,
    size: { width: width / 1000, height: height / 1000, depth: depth / 1000 },
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
      palette.dispose()
      root.clear()
    },
  }
}
