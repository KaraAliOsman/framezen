/**
 * Despiece visual de una ventana (puro, mm, vista interior): marco, hojas, junquillos y travesaños
 * como piezas separadas con ingletes reales y uniones en T. Es la misma idea que los anillos del
 * visor 3D (`ringBands`), llevada al dibujo: cada pieza recibe su propia veta y su propia luz.
 *
 * - Marco, hojas y paneles de corredera: cuatro trapecios a inglete (o a tope con umbral).
 * - Travesaños: rectángulos que terminan a tope contra el miembro que los limita (unión en T).
 * - Junquillos: anillo propio a inglete sobre el borde del vidrio; burlete fino contra el vidrio.
 * - Formas especiales: tramos rectos a inglete y arcos cortados en dovelas que siguen la curva.
 *
 * Se memoriza por objeto `Layout` (el motor devuelve uno nuevo en cada cambio).
 */
import { isFloorLeaf, type Layout, type LayoutSash, type LayoutSlidingPanel, type PaneFill, type Rect, type WindowDesign } from '@dekopen/engine'
import { shapeOutlines } from './geometry'
import { arcPoint, pathSegments, type Pt, type Segment } from './path'
import { slidingMeetings, slidingPlane, slidingVisibleRect, type SlidingMeeting } from './sliding'

export type { Pt }

export type PieceRole = 'frame' | 'sash' | 'slider' | 'interlock' | 'bead' | 'mullion' | 'transom' | 'french' | 'threshold'
export type PieceSide = 'top' | 'right' | 'bottom' | 'left' | 'run' | 'arc'
export type JointKind = 'mitre' | 'butt'

export interface ProfilePiece {
  id: string
  role: PieceRole
  /** Nodo dueño (`frame` para el marco). */
  owner: string
  side: PieceSide
  /** Contorno de la pieza (mm, vista interior, y hacia abajo). */
  polygon: Pt[]
  /** Dirección de la veta en grados (0 = horizontal, 90 = vertical, otro = pieza inclinada o dovela). */
  grain: number
  joints: [JointKind, JointKind]
  /** Canto exterior (el labio que recibe la luz) y su normal hacia afuera del anillo. */
  outer: [Pt, Pt]
  inner: [Pt, Pt]
  normal: Pt
  /** Ancho de la cara de la pieza (mm). */
  face: number
  /** Semilla estable para la fase de la textura. */
  seed: number
}

export interface Seam {
  a: Pt
  b: Pt
  kind: JointKind
}

export interface RingGeometry {
  owner: string
  role: PieceRole
  outer: Rect
  inner: Rect
  faces: { top: number; right: number; bottom: number; left: number }
  pieces: ProfilePiece[]
  seams: Seam[]
}

export interface GlazingGeometry {
  owner: string
  /** Vidrio visible (luz). */
  glass: Rect
  /** Contorno del vidrio en formas (path mm). */
  outline?: string
  fill: PaneFill
  glassId: string
  /** Junquillo a inglete y burlete (null si no hay cara donde ponerlo). */
  bead: RingGeometry | null
  gasket: { outer: Rect; inner: Rect } | null
  beadWidth: number
  gasketWidth: number
}

export interface SashGeometry {
  sash: LayoutSash
  /** Anillo estructural por dentro: termina donde empieza el junquillo. */
  ring: RingGeometry
  /** Anillo completo hasta el vidrio: por fuera no hay junquillo (va en la cara interior). */
  fullRing: RingGeometry
  glazing: GlazingGeometry
  /** Travesaño de hoja de un zócalo. */
  zocaloBar?: ProfilePiece
  /** Junquillo del panel del zócalo, por dentro. */
  zocaloBead?: RingGeometry
}

export interface SliderGeometry {
  panel: LayoutSlidingPanel
  /** Lo que la hoja ocupa a la vista (ver `slidingVisibleRect`). */
  rect: Rect
  /** Plano de exterior a interior. */
  plane: number
  ring: RingGeometry
  fullRing: RingGeometry
  glazing: GlazingGeometry
}

export interface ShapedFrameGeometry {
  outer: string
  inner: string
  /** Piezas a inglete (tramos rectos) y dovelas (arcos); vacío si el contorno no se pudo leer. */
  pieces: ProfilePiece[]
  seams: Seam[]
}

export interface WindowGeometry {
  width: number
  height: number
  frame: RingGeometry | null
  shaped: ShapedFrameGeometry | null
  mullions: ProfilePiece[]
  french: ProfilePiece[]
  /** Holguras entre hojas plegables (sin perfil fijo). */
  folds: Rect[]
  fixed: GlazingGeometry[]
  sashes: SashGeometry[]
  /** Paneles de corredera en orden de dibujo (riel exterior primero). */
  sliders: SliderGeometry[]
  /** Encuentros entre hojas: traslapos con su perfil y uniones a tope. */
  meetings: MeetingGeometry[]
  /** Umbral bajo (aluminio) en vez del perfil inferior del marco. */
  threshold: boolean
}

/** Encuentro de dos hojas. El traslapo va sobre el canto de la hoja que queda adelante, y eso cambia con la vista. */
export interface MeetingGeometry {
  meeting: SlidingMeeting
  /** Perfil de traslapo visto por dentro y por fuera (null a tope). */
  interlock: { interior: ProfilePiece; exterior: ProfilePiece } | null
}

/** Medidas de detalle (mm) que el motor no entrega: valores típicos de perfiles de PVC. */
export const DETAIL_MM = {
  bead: 20,
  gasket: 3,
  /** Holgura visible entre hoja y marco (sombra). */
  reveal: 2.5,
  /** Cara vista del perfil de traslapo sobre el montante. */
  interlock: 16,
} as const

const r1 = (n: number) => Math.round(n * 10) / 10

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function expandRect(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }
}

export function shrinkRect(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.w / 2)
  const dy = Math.min(d, r.h / 2)
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy }
}

/**
 * Las cuatro piezas de un anillo rectangular con ingletes (o el inferior a tope para un umbral).
 * Caras distintas por lado dan ingletes no simétricos, como en la realidad.
 */
export function ringPieces(
  outer: Rect,
  face: number | { top: number; right: number; bottom: number; left: number },
  opts: { role: PieceRole; owner: string; buttBottom?: boolean; seedKey?: string } = { role: 'frame', owner: 'frame' },
): RingGeometry {
  const f = typeof face === 'number' ? { top: face, right: face, bottom: face, left: face } : face
  const { x, y, w, h } = outer
  const ft = Math.max(0, Math.min(f.top, h / 2))
  const fb = Math.max(0, Math.min(f.bottom, h / 2))
  const fl = Math.max(0, Math.min(f.left, w / 2))
  const fr = Math.max(0, Math.min(f.right, w / 2))
  const inner: Rect = { x: x + fl, y: y + ft, w: Math.max(0, w - fl - fr), h: Math.max(0, h - ft - fb) }
  const TL: Pt = [x, y]
  const TR: Pt = [x + w, y]
  const BR: Pt = [x + w, y + h]
  const BL: Pt = [x, y + h]
  const tl: Pt = [x + fl, y + ft]
  const tr: Pt = [x + w - fr, y + ft]
  const br: Pt = [x + w - fr, y + h - fb]
  const bl: Pt = [x + fl, y + h - fb]
  const key = opts.seedKey ?? `${opts.owner}:${opts.role}`
  const mk = (side: PieceSide, polygon: Pt[], grain: number, o: [Pt, Pt], i: [Pt, Pt], normal: Pt, sideFace: number, joints: [JointKind, JointKind]): ProfilePiece => ({
    id: `${opts.owner}:${opts.role}:${side}`,
    role: side === 'bottom' && opts.buttBottom && opts.role === 'frame' ? 'threshold' : opts.role,
    owner: opts.owner,
    side,
    polygon: polygon.map((p) => [r1(p[0]), r1(p[1])] as Pt),
    grain,
    joints,
    outer: o,
    inner: i,
    normal,
    face: sideFace,
    seed: hash(`${key}:${side}`),
  })
  const pieces: ProfilePiece[] = []
  const seams: Seam[] = []
  if (opts.buttBottom) {
    // Jambas hasta el piso; el umbral entre ellas, a tope.
    const ibl: Pt = [x + fl, y + h]
    const ibr: Pt = [x + w - fr, y + h]
    pieces.push(mk('top', [TL, TR, tr, tl], 0, [TL, TR], [tl, tr], [0, -1], ft, ['mitre', 'mitre']))
    pieces.push(mk('right', [TR, BR, ibr, tr], 90, [TR, BR], [tr, ibr], [1, 0], fr, ['mitre', 'butt']))
    pieces.push(mk('bottom', [ibr, ibl, bl, br], 0, [ibr, ibl], [br, bl], [0, 1], fb, ['butt', 'butt']))
    pieces.push(mk('left', [BL, TL, tl, ibl], 90, [BL, TL], [ibl, tl], [-1, 0], fl, ['butt', 'mitre']))
    seams.push({ a: TL, b: tl, kind: 'mitre' }, { a: TR, b: tr, kind: 'mitre' }, { a: bl, b: ibl, kind: 'butt' }, { a: br, b: ibr, kind: 'butt' })
  } else {
    pieces.push(mk('top', [TL, TR, tr, tl], 0, [TL, TR], [tl, tr], [0, -1], ft, ['mitre', 'mitre']))
    pieces.push(mk('right', [TR, BR, br, tr], 90, [TR, BR], [tr, br], [1, 0], fr, ['mitre', 'mitre']))
    pieces.push(mk('bottom', [BR, BL, bl, br], 0, [BR, BL], [br, bl], [0, 1], fb, ['mitre', 'mitre']))
    pieces.push(mk('left', [BL, TL, tl, bl], 90, [BL, TL], [bl, tl], [-1, 0], fl, ['mitre', 'mitre']))
    seams.push({ a: TL, b: tl, kind: 'mitre' }, { a: TR, b: tr, kind: 'mitre' }, { a: BR, b: br, kind: 'mitre' }, { a: BL, b: bl, kind: 'mitre' })
  }
  return { owner: opts.owner, role: opts.role, outer, inner, faces: { top: ft, right: fr, bottom: fb, left: fl }, pieces, seams }
}

/** Ajusta una barra vertical al alto de las hojas que toca (el inversor no sobresale de la hoja). */
function clampToSashes(rect: Rect, sashes: readonly LayoutSash[]): Rect {
  if (rect.h < rect.w) return rect
  const near = sashes.filter((s) => s.rect.x < rect.x + rect.w + 3 && s.rect.x + s.rect.w > rect.x - 3 && s.rect.y < rect.y + rect.h && s.rect.y + s.rect.h > rect.y)
  if (near.length === 0) return rect
  const y0 = Math.min(...near.map((s) => s.rect.y))
  const y1 = Math.max(...near.map((s) => s.rect.y + s.rect.h))
  return y1 > y0 ? { x: rect.x, y: y0, w: rect.w, h: y1 - y0 } : rect
}

/** Pieza recta (travesaño, inversor): veta a lo largo, uniones a tope. */
function barPiece(rect: Rect, role: PieceRole, owner: string, index: number): ProfilePiece {
  const vertical = rect.h >= rect.w
  const { x, y, w, h } = rect
  const poly: Pt[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
  return {
    id: `${owner}:${role}:${index}`,
    role,
    owner,
    side: 'run',
    polygon: poly.map((p) => [r1(p[0]), r1(p[1])] as Pt),
    grain: vertical ? 90 : 0,
    joints: ['butt', 'butt'],
    outer: vertical ? [poly[3], poly[0]] : [poly[0], poly[1]],
    inner: vertical ? [poly[2], poly[1]] : [poly[3], poly[2]],
    normal: vertical ? [-1, 0] : [0, -1],
    face: vertical ? w : h,
    seed: hash(`${owner}:${role}:${index}`),
  }
}

/** Junquillo y burlete de un vidrio: crecen hacia afuera del vidrio, sobre la cara que lo sostiene. */
function glazing(owner: string, glass: Rect, fill: PaneFill, glassId: string, available: number, outline?: string): GlazingGeometry {
  const usable = Math.max(0, available)
  const gasketWidth = usable >= 40 ? DETAIL_MM.gasket : Math.max(1, Math.min(DETAIL_MM.gasket, usable * 0.06))
  const beadWidth = usable >= 40 ? DETAIL_MM.bead : Math.max(0, Math.min(DETAIL_MM.bead, usable * 0.32))
  if (outline || glass.w <= 0 || glass.h <= 0) {
    return { owner, glass, outline, fill, glassId, bead: null, gasket: null, beadWidth, gasketWidth }
  }
  const gasketOuter = expandRect(glass, gasketWidth)
  const bead = fill === 'glass' && beadWidth >= 4 ? ringPieces(expandRect(gasketOuter, beadWidth), beadWidth, { role: 'bead', owner }) : null
  return {
    owner,
    glass,
    fill,
    glassId,
    bead,
    gasket: fill === 'glass' ? { outer: gasketOuter, inner: glass } : null,
    beadWidth,
    gasketWidth,
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01
}

// ── Formas especiales ────────────────────────────────────────────────────────

function segmentAngle(seg: Segment): number {
  return (Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]) * 180) / Math.PI
}

function outwardNormal(a: Pt, b: Pt, center: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  let n: Pt = [dy / len, -dx / len]
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  if ((mid[0] - center[0]) * n[0] + (mid[1] - center[1]) * n[1] < 0) n = [-n[0], -n[1]]
  return n
}

/** Grados normalizados a (−90, 90]: la veta no tiene sentido. */
function grainOf(deg: number): number {
  let g = deg % 180
  if (g <= -90) g += 180
  if (g > 90) g -= 180
  return Math.round(g * 10) / 10
}

/**
 * Piezas de un marco con forma: empareja tramo a tramo el contorno exterior y el interior (el motor
 * los genera con la misma estructura). Rectas → trapecio a inglete; arcos → dovelas que siguen la curva.
 */
export function shapedFramePieces(outer: string, inner: string, width: number, height: number): ShapedFrameGeometry {
  const o = pathSegments(outer)
  const i = pathSegments(inner)
  const empty = { outer, inner, pieces: [], seams: [] }
  if (o.length === 0 || o.length !== i.length || o.some((s, k) => s.kind !== i[k].kind)) return empty
  const center: Pt = [width / 2, height / 2]
  const pieces: ProfilePiece[] = []
  const seams: Seam[] = []
  o.forEach((seg, k) => {
    const inn = i[k]
    seams.push({ a: seg.a, b: inn.a, kind: 'mitre' })
    if (seg.kind === 'line' && inn.kind === 'line') {
      const normal = outwardNormal(seg.a, seg.b, center)
      const face = Math.abs((inn.a[0] - seg.a[0]) * normal[0] + (inn.a[1] - seg.a[1]) * normal[1])
      pieces.push({
        id: `frame:shape:${k}`,
        role: 'frame',
        owner: 'frame',
        side: 'run',
        polygon: [seg.a, seg.b, inn.b, inn.a].map((p) => [r1(p[0]), r1(p[1])] as Pt),
        grain: grainOf(segmentAngle(seg)),
        joints: ['mitre', 'mitre'],
        outer: [seg.a, seg.b],
        inner: [inn.a, inn.b],
        normal,
        face,
        seed: hash(`frame:shape:${k}`),
      })
      return
    }
    if (seg.kind === 'arc' && inn.kind === 'arc') {
      const n = Math.max(2, Math.ceil(Math.abs(seg.dt) / (Math.PI / 36)))
      for (let s = 0; s < n; s++) {
        const ta = seg.t0 + (seg.dt * s) / n
        const tb = seg.t0 + (seg.dt * (s + 1)) / n
        const ia = inn.t0 + (inn.dt * s) / n
        const ib = inn.t0 + (inn.dt * (s + 1)) / n
        const oa = s === 0 ? seg.a : arcPoint(seg, ta)
        const ob = s === n - 1 ? seg.b : arcPoint(seg, tb)
        const pa = s === 0 ? inn.a : arcPoint(inn, ia)
        const pb = s === n - 1 ? inn.b : arcPoint(inn, ib)
        const normal = outwardNormal(oa, ob, [seg.cx, seg.cy])
        pieces.push({
          id: `frame:shape:${k}:${s}`,
          role: 'frame',
          owner: 'frame',
          side: 'arc',
          polygon: [oa, ob, pb, pa].map((p) => [r1(p[0]), r1(p[1])] as Pt),
          grain: grainOf((Math.atan2(ob[1] - oa[1], ob[0] - oa[0]) * 180) / Math.PI),
          joints: [s === 0 ? 'butt' : 'mitre', s === n - 1 ? 'butt' : 'mitre'],
          outer: [oa, ob],
          inner: [pa, pb],
          normal,
          face: Math.hypot(pa[0] - oa[0], pa[1] - oa[1]),
          seed: hash(`frame:shape:${k}`),
        })
      }
    }
  })
  return { outer, inner, pieces, seams }
}

// ── Ventana completa ─────────────────────────────────────────────────────────

const cache = new WeakMap<Layout, Map<string, WindowGeometry>>()

/** Geometría visual completa de una ventana (memorizada por layout y opciones). */
export function windowGeometry(layout: Layout, design?: Pick<WindowDesign, 'extras' | 'shape'>): WindowGeometry {
  const threshold = hasThreshold(layout, design)
  // Si el motor no entregó el contorno de la forma, se usa el de respaldo.
  const fallback = !layout.frame.outline && design?.shape && design.shape.kind !== 'rect' ? shapeOutlines(design.shape, layout.width, layout.height, layout.frame.face) : null
  const key = `${threshold ? 't' : 'n'}:${fallback ? JSON.stringify(design?.shape) : ''}`
  let byKey = cache.get(layout)
  const hit = byKey?.get(key)
  if (hit) return hit
  const geometry = buildGeometry(layout, threshold, fallback)
  if (!byKey) {
    byKey = new Map()
    cache.set(layout, byKey)
  }
  byKey.set(key, geometry)
  return geometry
}

function hasThreshold(layout: Layout, design?: Pick<WindowDesign, 'extras' | 'shape'>): boolean {
  if (layout.frame.outline) return false
  if (layout.slidingSystem === 'lift_slide') return true
  if (!design?.extras?.threshold) return false
  const bottom = layout.height
  return layout.sashes.some((s) => isFloorLeaf(s.opening) && s.rect.y + s.rect.h > bottom - layout.frame.face - 1)
}

function buildGeometry(layout: Layout, threshold: boolean, fallback: { outer: string; inner: string } | null): WindowGeometry {
  const face = layout.frame.face || 0
  const frameRect = layout.frame.rect
  const shapedOutline = layout.frame.outline && layout.frame.innerOutline ? { outer: layout.frame.outline, inner: layout.frame.innerOutline } : fallback
  const frame = !shapedOutline && face > 0 ? ringPieces(frameRect, face, { role: 'frame', owner: 'frame', buttBottom: threshold }) : null
  const shaped = shapedOutline ? shapedFramePieces(shapedOutline.outer, shapedOutline.inner, layout.width, layout.height) : null

  const mullions = layout.mullions.filter((m) => m.kind === 'mullion').map((m) => barPiece(m.rect, m.dir === 'vertical' ? 'mullion' : 'transom', m.nodeId, m.index))
  // El inversor va montado en la hoja pasiva: corre a lo largo de las hojas que une (no hasta el marco).
  const french = layout.mullions
    .filter((m) => m.kind === 'french')
    .map((m) => barPiece(clampToSashes(m.rect, layout.sashes), 'french', m.nodeId, m.index))
  const folds = layout.mullions.filter((m) => m.kind === 'fold').map((m) => m.rect)

  const slidingIds = new Set(layout.sliding.map((p) => p.panelId))
  const sashIds = new Set(layout.sashes.map((s) => s.nodeId))
  const mullionFace = layout.mullions.find((m) => m.kind === 'mullion')
  const fixedFace = Math.min(face || 60, mullionFace ? Math.min(mullionFace.rect.w, mullionFace.rect.h) / 2 + 10 : face || 60)
  const fixed = layout.panes
    .filter((p) => p.kind === 'fixed' && !slidingIds.has(p.nodeId) && !sashIds.has(p.nodeId))
    .map((p) => glazing(p.nodeId, p.glassRect, p.fill, p.glassId, fixedFace, p.outline))

  const sashes: SashGeometry[] = layout.sashes.map((sash) => {
    const pane = layout.panes.find((p) => p.nodeId === sash.nodeId)
    let glass = pane && !pane.outline ? pane.glassRect : sash.glassRect
    if (sameRect(glass, sash.rect)) glass = shrinkRect(sash.rect, Math.max(1, sash.face))
    // Con zócalo el anillo de la hoja rodea el vidrio y el panel juntos; el travesaño va por encima.
    const zone = sash.zocalo ? { ...glass, h: sash.zocalo.panel.y + sash.zocalo.panel.h - glass.y } : glass
    const faces = {
      top: zone.y - sash.rect.y,
      right: sash.rect.x + sash.rect.w - (zone.x + zone.w),
      bottom: sash.rect.y + sash.rect.h - (zone.y + zone.h),
      left: zone.x - sash.rect.x,
    }
    const minFace = Math.min(faces.top, faces.right, faces.bottom, faces.left)
    const fill = pane?.fill ?? sash.fill
    const g = glazing(sash.nodeId, glass, fill, pane?.glassId ?? '', minFace)
    // El anillo estructural de la hoja termina donde empieza el junquillo.
    const inset = fill === 'glass' && g.bead ? g.beadWidth + g.gasketWidth : 0
    const ringFaces = {
      top: Math.max(1, faces.top - inset),
      right: Math.max(1, faces.right - inset),
      bottom: Math.max(1, faces.bottom - inset),
      left: Math.max(1, faces.left - inset),
    }
    const out: SashGeometry = { sash, ring: ringPieces(sash.rect, ringFaces, { role: 'sash', owner: sash.nodeId }), fullRing: ringPieces(sash.rect, faces, { role: 'sash', owner: sash.nodeId }), glazing: g }
    if (sash.zocalo) {
      out.zocaloBar = barPiece(sash.zocalo.bar, 'mullion', sash.nodeId, 0)
      // El panel también va pisado por junquillo: sin él queda abierto el rebaje que el anillo deja libre.
      if (inset > 0) {
        const { bar, panel } = sash.zocalo
        const outer: Rect = { x: panel.x - inset, y: bar.y, w: panel.w + 2 * inset, h: panel.y + panel.h + inset - bar.y }
        out.zocaloBead = ringPieces(outer, { top: 1, right: inset, bottom: inset, left: inset }, { role: 'bead', owner: `${sash.nodeId}:zocalo` })
      }
    }
    return out
  })

  const sliders: SliderGeometry[] = [...layout.sliding]
    .sort((a, b) => slidingPlane(a) - slidingPlane(b) || a.index - b.index)
    .map((panel) => {
      const glass = panel.glassRect
      const rect = slidingVisibleRect(layout, panel)
      const facesOf = (r: Rect) => ({
        top: glass.y - r.y,
        right: r.x + r.w - (glass.x + glass.w),
        bottom: r.y + r.h - (glass.y + glass.h),
        left: glass.x - r.x,
      })
      const faces = facesOf(rect)
      const whole = facesOf(panel.rect)
      // El medio montante de un encuentro a tope no achica el junquillo, salvo que este ya no quepa.
      const narrowest = Math.min(faces.top, faces.right, faces.bottom, faces.left)
      const available = narrowest >= DETAIL_MM.bead + DETAIL_MM.gasket + 4 ? Math.min(whole.top, whole.right, whole.bottom, whole.left) : narrowest
      const g = glazing(panel.panelId, glass, 'glass', layout.panes.find((p) => p.nodeId === panel.panelId)?.glassId ?? '', available)
      const inset = g.bead ? g.beadWidth + g.gasketWidth : 0
      const ringFaces = {
        top: Math.max(1, faces.top - inset),
        right: Math.max(1, faces.right - inset),
        bottom: Math.max(1, faces.bottom - inset),
        left: Math.max(1, faces.left - inset),
      }
      return { panel, rect, plane: slidingPlane(panel), ring: ringPieces(rect, ringFaces, { role: 'slider', owner: panel.panelId }), fullRing: ringPieces(rect, faces, { role: 'slider', owner: panel.panelId }), glazing: g }
    })

  const meetings: MeetingGeometry[] = slidingMeetings(layout).map((meeting) => ({
    meeting,
    interlock: meeting.front ? { interior: interlockBar(meeting, meeting.front, 'in'), exterior: interlockBar(meeting, meeting.front === meeting.a ? meeting.b : meeting.a, 'out') } : null,
  }))

  return { width: layout.width, height: layout.height, frame, shaped, mullions, french, folds, fixed, sashes, sliders, meetings, threshold }
}

/** Perfil de traslapo: una banda angosta sobre el canto de la hoja de adelante, a todo su largo. */
function interlockBar(m: SlidingMeeting, front: LayoutSlidingPanel, view: 'in' | 'out'): ProfilePiece {
  const t = Math.min(DETAIL_MM.interlock, front.face * 0.3)
  const leading = front === m.b
  const edge = m.axis === 'x' ? (leading ? front.rect.x : front.rect.x + front.rect.w) : leading ? front.rect.y : front.rect.y + front.rect.h
  const start = leading ? edge : edge - t
  const rect: Rect = m.axis === 'x' ? { x: start, y: m.from, w: t, h: m.to - m.from } : { x: m.from, y: start, w: m.to - m.from, h: t }
  return barPiece(rect, 'interlock', `${m.a.panelId}-${m.b.panelId}`, view === 'in' ? 0 : 1)
}

/** Todas las piezas de perfil (marco, travesaños, hojas, junquillos), en orden de dibujo. */
export function profilePieces(layout: Layout, design?: Pick<WindowDesign, 'extras' | 'shape'>): ProfilePiece[] {
  const g = windowGeometry(layout, design)
  const out: ProfilePiece[] = []
  if (g.frame) out.push(...g.frame.pieces)
  if (g.shaped) out.push(...g.shaped.pieces)
  out.push(...g.mullions)
  for (const f of g.fixed) if (f.bead) out.push(...f.bead.pieces)
  for (const s of g.sashes) {
    out.push(...s.ring.pieces)
    if (s.glazing.bead) out.push(...s.glazing.bead.pieces)
  }
  out.push(...g.french)
  for (const s of g.sliders) {
    out.push(...s.ring.pieces)
    if (s.glazing.bead) out.push(...s.glazing.bead.pieces)
  }
  for (const m of g.meetings) if (m.interlock) out.push(m.interlock.interior)
  return out
}
