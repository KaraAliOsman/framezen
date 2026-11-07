import type { Rect, Shape, ShapeKind, Side } from '../types'
import { clamp, mm1, round, svgNum } from './format'

/**
 * Formas especiales del marco: contornos SVG en mm, aristas para el despiece (con ingletes
 * reales), áreas reales y recortes por paño.
 *
 * - Polígonos convexos (trapecio, triángulo, pentágono, octógono, frontón): exactos.
 * - Arco (medio punto o rebajado) y círculo: arcos de circunferencia exactos.
 * - Óvalo: elipse inscrita; perímetro de Ramanujan. El contorno desplazado `d` mm hacia adentro se
 *   aproxima por la elipse de semiejes (a − d, b − d): el desplazamiento real de una elipse no es
 *   una elipse, pero la diferencia es menor a 0,1 mm mientras d sea chico frente al radio mínimo.
 * - Los tramos curvos más largos que la barra (menos el agarre de la curvadora) se dividen en
 *   piezas iguales unidas a 90°.
 */

export interface Pt {
  x: number
  y: number
}

export interface ShapeEdge {
  length: number
  label: string
  side: Side
  /** Ingletes: mitad del ángulo interior de cada vértice (°, 0,01). */
  angleStart: number
  angleEnd: number
  curved?: boolean
}

export interface ShapeOutline {
  path: string
  edges: ShapeEdge[]
  bbox: Rect
  /** Área real encerrada (mm²). */
  area: number
}

/** Contorno como polígono denso: los arcos se muestrean; `tags[i]` = arista de origen del tramo i. */
export interface Ring {
  pts: Pt[]
  tags: number[]
  /** Datos de cada arista de origen (por índice de tag). */
  sources: { label: string; side: Side; curved: boolean }[]
}

export interface ShapeGeometry {
  kind: Exclude<ShapeKind, 'rect'>
  outer: ShapeOutline
  perimeter: number
  /**
   * Contorno desplazado `d` mm hacia adentro (luz, vidrio, cara vista…). Los tramos curvos se parten
   * según el largo máximo de la forma (el marco); `opts.maxArc` lo cambia para otra pieza con su
   * propia barra (el junquillo).
   */
  inset: (d: number, opts?: InsetOptions) => ShapeOutline
  /** El mismo contorno como polígono denso (recortes por paño y pertenencia). */
  ring: (d: number) => Ring
  /** Radio exterior mínimo de curvado (mm) si la forma tiene tramos curvos. */
  radius?: number
  /** Tiene tramos curvos (se encargan curvados). */
  curved: boolean
  /**
   * Alto desde arriba de la cabeza no rectangular (arranque del arco, hombros del frontón, lado
   * más bajo del trapecio). Bajo esa cota los lados son verticales: ahí caben hojas rectangulares.
   */
  head?: number
}

export interface ShapeOptions {
  /** Largo máximo de un tramo curvo (mm, sin soldadura). Sin dato: no se divide. */
  maxArc?: number
}

/** Opciones de `ShapeGeometry.inset`. */
export interface InsetOptions {
  /** Largo máximo de un tramo curvo de esta pieza (mm): su barra menos el agarre de la curvadora. */
  maxArc?: number
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: Pt): number => Math.hypot(a.x, a.y)
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x
const deg = (rad: number): number => (rad * 180) / Math.PI
/** Paso máximo de muestreo de arcos (rad): con 1° el error de cuerda queda bajo 0,1 mm en arcos de hasta 7 m. */
const ARC_STEP = Math.PI / 180

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
/** Compilación: la unión `Shape` y `SHAPE_KINDS` describen las mismas formas. */
const SHAPE_KINDS_MATCH: AssertEqual<Shape['kind'], ShapeKind> = true
void SHAPE_KINDS_MATCH

export function shapeGeometry(shape: Shape | undefined, W: number, H: number, opts: ShapeOptions = {}): ShapeGeometry | undefined {
  if (!shape || shape.kind === 'rect' || !(W > 0) || !(H > 0)) return undefined
  const maxArc = opts.maxArc && opts.maxArc > 0 ? opts.maxArc : Infinity
  if (shape.kind === 'arch') return archGeometry(shape.rise, W, H, maxArc)
  if (shape.kind === 'round' || shape.kind === 'oval') return ellipseGeometry(shape.kind, W, H, maxArc)
  const poly = polygonFor(shape, W, H)
  if (!poly) return undefined
  const outer = polygonOutline(poly)
  return {
    kind: shape.kind,
    outer,
    perimeter: outer.edges.reduce((a, e) => a + e.length, 0),
    inset: (d) => polygonOutline(insetPolygon(poly, d)),
    ring: (d) => polygonRing(insetPolygon(poly, d)),
    curved: false,
    head: polygonHead(shape, W, H),
  }
}

/** Ochavo regular de un octógono inscrito en el menor lado: c = lado / (2 + √2). */
export function regularChamfer(W: number, H: number): number {
  return Math.min(W, H) / (2 + Math.SQRT2)
}

function polygonFor(shape: Shape, W: number, H: number): Pt[] | undefined {
  switch (shape.kind) {
    case 'trapezoid': {
      const lh = Number.isFinite(shape.leftHeight) ? clamp(shape.leftHeight, 1, H) : H
      const rh = Number.isFinite(shape.rightHeight) ? clamp(shape.rightHeight, 1, H) : H
      return [
        { x: 0, y: H },
        { x: W, y: H },
        { x: W, y: H - rh },
        { x: 0, y: H - lh },
      ]
    }
    case 'triangle': {
      const apex = shape.apex === 'left' ? 0 : shape.apex === 'right' ? W : W / 2
      const top: Pt = { x: apex, y: 0 }
      return [{ x: 0, y: H }, { x: W, y: H }, top]
    }
    case 'pentagon': {
      // Pentágono regular escalado al rectángulo: hombros a H/φ² del vértice y base de ancho W/φ.
      const shoulder = H * (1 - Math.cos((72 * Math.PI) / 180)) / (1 + Math.cos((36 * Math.PI) / 180))
      const foot = (W / 2) * (1 - Math.sin((36 * Math.PI) / 180) / Math.sin((72 * Math.PI) / 180))
      return [
        { x: foot, y: H },
        { x: W - foot, y: H },
        { x: W, y: shoulder },
        { x: W / 2, y: 0 },
        { x: 0, y: shoulder },
      ]
    }
    case 'octagon': {
      const max = Math.min(W, H) / 2 - 1
      const c = typeof shape.chamfer === 'number' && Number.isFinite(shape.chamfer) && shape.chamfer > 0 ? clamp(shape.chamfer, 1, max) : regularChamfer(W, H)
      return [
        { x: c, y: H },
        { x: W - c, y: H },
        { x: W, y: H - c },
        { x: W, y: c },
        { x: W - c, y: 0 },
        { x: c, y: 0 },
        { x: 0, y: c },
        { x: 0, y: H - c },
      ]
    }
    case 'gable': {
      const s = Number.isFinite(shape.shoulderHeight) ? clamp(shape.shoulderHeight, 1, H - 1) : H / 2
      return [
        { x: 0, y: H },
        { x: W, y: H },
        { x: W, y: H - s },
        { x: W / 2, y: 0 },
        { x: 0, y: H - s },
      ]
    }
    default:
      return undefined
  }
}

function polygonHead(shape: Shape, W: number, H: number): number | undefined {
  if (shape.kind === 'trapezoid') {
    const lh = Number.isFinite(shape.leftHeight) ? clamp(shape.leftHeight, 1, H) : H
    const rh = Number.isFinite(shape.rightHeight) ? clamp(shape.rightHeight, 1, H) : H
    return H - Math.min(lh, rh)
  }
  if (shape.kind === 'gable') {
    const s = Number.isFinite(shape.shoulderHeight) ? clamp(shape.shoulderHeight, 1, H - 1) : H / 2
    return H - s
  }
  return undefined
}

function centroid(poly: Pt[]): Pt {
  const s = poly.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
  return { x: s.x / poly.length, y: s.y / poly.length }
}

/** Desplaza un polígono convexo `d` mm hacia su interior. */
export function insetPolygon(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  const c = centroid(poly)
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]
    const v = sub(q, p)
    const l = len(v) || 1
    const u = { x: v.x / l, y: v.y / l }
    let nrm = { x: -u.y, y: u.x }
    if (dot(nrm, sub(c, p)) < 0) nrm = { x: -nrm.x, y: -nrm.y }
    return { p: { x: p.x + nrm.x * d, y: p.y + nrm.y * d }, u }
  })
  return poly.map((_, i) => {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    const den = cross(a.u, b.u)
    if (Math.abs(den) < 1e-12) return b.p
    const t = cross(sub(b.p, a.p), b.u) / den
    return { x: a.p.x + a.u.x * t, y: a.p.y + a.u.y * t }
  })
}

function interiorAngle(prev: Pt, p: Pt, next: Pt): number {
  const a = sub(prev, p)
  const b = sub(next, p)
  const cos = dot(a, b) / ((len(a) || 1) * (len(b) || 1))
  return deg(Math.acos(clamp(cos, -1, 1)))
}

/** Etiqueta de taller de un tramo recto según su orientación respecto del centro. */
function straightLabel(a: Pt, b: Pt, c: Pt): { label: string; side: Side } {
  const v = sub(b, a)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (Math.abs(v.y) < 0.5) return mid.y > c.y ? { label: 'aba', side: 'bottom' } : { label: 'arr', side: 'top' }
  if (Math.abs(v.x) < 0.5) return mid.x < c.x ? { label: 'izq', side: 'left' } : { label: 'der', side: 'right' }
  return { label: 'incl.', side: 'other' }
}

function shoelace(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function bboxOf(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x: mm1(x), y: mm1(y), w: mm1(Math.max(...xs) - x), h: mm1(Math.max(...ys) - y) }
}

function polygonOutline(poly: Pt[]): ShapeOutline {
  const n = poly.length
  const c = centroid(poly)
  const angles = poly.map((p, i) => interiorAngle(poly[(i - 1 + n) % n], p, poly[(i + 1) % n]))
  const edges: ShapeEdge[] = poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    const { label, side } = straightLabel(a, b, c)
    return {
      length: len(sub(b, a)),
      label,
      side,
      angleStart: round(angles[i] / 2, 2),
      angleEnd: round(angles[(i + 1) % n] / 2, 2),
    }
  })
  return {
    path: 'M ' + poly.map((p) => `${svgNum(p.x)} ${svgNum(p.y)}`).join(' L ') + ' Z',
    edges,
    bbox: bboxOf(poly),
    area: shoelace(poly),
  }
}

function polygonRing(poly: Pt[]): Ring {
  const c = centroid(poly)
  return {
    pts: poly.map((p) => ({ ...p })),
    tags: poly.map((_, i) => i),
    sources: poly.map((a, i) => ({ ...straightLabel(a, poly[(i + 1) % poly.length], c), curved: false })),
  }
}

/** Divide un tramo curvo en `n` piezas iguales unidas a 90° (la primera y la última conservan su inglete). */
function splitCurved<T extends ShapeEdge>(edge: T, maxArc: number): T[] {
  if (!edge.curved || !(edge.length > maxArc)) return [edge]
  const n = Math.ceil(edge.length / maxArc - 1e-9)
  const piece = edge.length / n
  return Array.from({ length: n }, (_, i) => ({
    ...edge,
    length: piece,
    angleStart: i === 0 ? edge.angleStart : 90,
    angleEnd: i === n - 1 ? edge.angleEnd : 90,
  }))
}

/**
 * Parte los tramos curvos más largos que `maxArc` en piezas iguales unidas a 90° (los rectos y los
 * que caben quedan tal cual). Sirve para el junquillo de un paño recortado, que arma sus aristas
 * a partir del contorno ya cortado por los travesaños.
 */
export function splitCurvedEdges<T extends ShapeEdge>(edges: readonly T[], maxArc: number): T[] {
  return edges.flatMap((edge) => splitCurved(edge, maxArc))
}

// ─── Arco (medio punto, rebajado o de herradura) ────────────────────────────

function archGeometry(riseIn: number, W: number, H: number, maxArc: number): ShapeGeometry {
  const rise = Number.isFinite(riseIn) && riseIn > 0 ? clamp(riseIn, 1, H) : Math.min(W / 2, H)
  const R = (W * W) / 4 / (2 * rise) + rise / 2
  const cy = R // la clave del arco toca y = 0
  const beyondHalf = rise > R + 1e-9

  interface ArchParts {
    r: number
    half: number
    ys: number
    bottom: number
    phi: number
    arc: number
    jamb: number
  }
  const parts = (d: number): ArchParts => {
    const r = Math.max(R - d, W / 2 - d, 0.001)
    const half = Math.max(0, W / 2 - d)
    const root = Math.sqrt(Math.max(0, r * r - half * half))
    let ys = beyondHalf ? cy + root : cy - root
    const bottom = H - d
    ys = Math.min(ys, bottom)
    let phi = Math.asin(clamp(half / r, 0, 1))
    if (beyondHalf) phi = Math.PI - phi
    return { r, half, ys, bottom, phi, arc: 2 * phi * r, jamb: Math.max(0, bottom - ys) }
  }

  const outline = (d: number, arcMax: number = maxArc): ShapeOutline => {
    const { r, ys, bottom, phi, arc, jamb, half } = parts(d)
    const large = beyondHalf ? 1 : 0
    const path =
      `M ${svgNum(d)} ${svgNum(bottom)} L ${svgNum(W - d)} ${svgNum(bottom)} L ${svgNum(W - d)} ${svgNum(ys)} ` +
      `A ${svgNum(r)} ${svgNum(r)} 0 ${large} 0 ${svgNum(d)} ${svgNum(ys)} Z`
    const phiDeg = deg(phi)
    const top = jamb >= 1 ? round((90 + phiDeg) / 2, 2) : round(phiDeg / 2, 2)
    const edges: ShapeEdge[] = [{ length: W - 2 * d, label: 'aba', side: 'bottom', angleStart: 45, angleEnd: 45 }]
    if (jamb >= 1) {
      edges.push({ length: jamb, label: 'der', side: 'right', angleStart: 45, angleEnd: top })
      edges.push({ length: jamb, label: 'izq', side: 'left', angleStart: top, angleEnd: 45 })
    }
    edges.push(...splitCurved({ length: arc, label: 'arco', side: 'top', angleStart: top, angleEnd: top, curved: true }, arcMax))
    // Segmento circular sobre la cuerda + rectángulo de las jambas.
    const segment = (r * r * (2 * phi - Math.sin(2 * phi))) / 2
    return {
      path,
      edges,
      bbox: { x: mm1(d), y: mm1(d), w: mm1(W - 2 * d), h: mm1(H - 2 * d) },
      area: segment + 2 * half * jamb,
    }
  }

  const ring = (d: number): Ring => {
    const { r, ys, bottom, phi, jamb } = parts(d)
    const pts: Pt[] = [
      { x: d, y: bottom },
      { x: W - d, y: bottom },
    ]
    const tags: number[] = [0]
    if (jamb >= 1e-6) {
      pts.push({ x: W - d, y: ys })
      tags.push(1)
    }
    // Arco desde el arranque derecho (θ = −π/2 + φ) por la clave hasta el izquierdo (−π/2 − φ).
    const steps = Math.max(2, Math.ceil((2 * phi) / ARC_STEP))
    for (let i = 1; i <= steps; i++) {
      const t = -Math.PI / 2 + phi - (2 * phi * i) / steps
      pts.push({ x: W / 2 + r * Math.cos(t), y: Math.min(bottom, cy + r * Math.sin(t)) })
      tags.push(2)
    }
    // Cierre por la jamba izquierda (tramo nulo si no hay jambas).
    tags.push(3)
    return {
      pts,
      tags,
      sources: [
        { label: 'aba', side: 'bottom', curved: false },
        { label: 'der', side: 'right', curved: false },
        { label: 'arco', side: 'top', curved: true },
        { label: 'izq', side: 'left', curved: false },
      ],
    }
  }

  const outer = outline(0)
  const outerParts = parts(0)
  return {
    kind: 'arch',
    outer,
    perimeter: outer.edges.reduce((a, e) => a + e.length, 0),
    inset: (d, opts) => outline(d, opts?.maxArc && opts.maxArc > 0 ? opts.maxArc : maxArc),
    ring,
    radius: mm1(R),
    curved: true,
    head: outerParts.jamb >= 1 ? outerParts.ys : undefined,
  }
}

/** Arco de medio punto (no rebajado) si la flecha llega a la mitad del ancho (tolerancia 1 % del ancho). */
export function isSemicircularArch(rise: number, W: number): boolean {
  return Number.isFinite(rise) && rise >= W / 2 - Math.max(0.15, W * 0.01)
}

// ─── Círculo y elipse ──────────────────────────────────────────────────────

/** Perímetro de una elipse de semiejes a y b (fórmula de Ramanujan; exacta para el círculo). */
export function ellipsePerimeter(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return 0
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

/** Largo de arco de una elipse entre los parámetros t0 y t1 (Simpson, 64 tramos). */
function ellipseArc(a: number, b: number, t0: number, t1: number): number {
  const n = 64
  const h = (t1 - t0) / n
  const f = (t: number) => Math.sqrt(a * a * Math.sin(t) ** 2 + b * b * Math.cos(t) ** 2)
  let s = f(t0) + f(t1)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(t0 + i * h)
  return Math.abs((s * h) / 3)
}

function ellipseGeometry(kind: 'round' | 'oval', W: number, H: number, maxArc: number): ShapeGeometry {
  const cx = W / 2
  const cy = H / 2
  /**
   * Piezas del aro: 2 mitades (uniones a las 3 y a las 9), o 4, 8, 16… si una mitad no cabe en la
   * barra. Por simetría, mitades y cuartos de elipse miden exactamente P/2 y P/4.
   */
  const pieceCount = (perimeter: number, arcMax: number = maxArc): number => {
    let n = 2
    while (perimeter / n > arcMax && n < 64) n *= 2
    return n
  }
  const outerPerimeter = ellipsePerimeter(W / 2, H / 2)
  const outerPieces = pieceCount(outerPerimeter)

  const pieceLengths = (a: number, b: number, P: number, pieces: number): number[] => {
    if (pieces <= 4) return Array.from({ length: pieces }, () => P / pieces)
    // 8 o más: largos por integración, escalados para sumar exactamente el perímetro de Ramanujan.
    const raw = Array.from({ length: pieces }, (_, i) => ellipseArc(a, b, (2 * Math.PI * i) / pieces, (2 * Math.PI * (i + 1)) / pieces))
    const sum = raw.reduce((x, y) => x + y, 0) || 1
    return raw.map((l) => (l * P) / sum)
  }

  const outline = (d: number, opts?: InsetOptions): ShapeOutline => {
    const a = Math.max(0.001, W / 2 - d)
    const b = Math.max(0.001, H / 2 - d)
    const P = ellipsePerimeter(a, b)
    // Con barra propia (junquillo) las piezas salen de su perímetro; si no, las del marco.
    const pieces = opts?.maxArc && opts.maxArc > 0 ? pieceCount(P, opts.maxArc) : outerPieces
    const path =
      `M ${svgNum(cx + a)} ${svgNum(cy)} A ${svgNum(a)} ${svgNum(b)} 0 1 1 ${svgNum(cx - a)} ${svgNum(cy)} ` +
      `A ${svgNum(a)} ${svgNum(b)} 0 1 1 ${svgNum(cx + a)} ${svgNum(cy)} Z`
    const edges: ShapeEdge[] = pieceLengths(a, b, P, pieces).map((length, i) => ({
      length,
      label: 'arco',
      side: i < pieces / 2 ? 'bottom' : 'top',
      angleStart: 90,
      angleEnd: 90,
      curved: true,
    }))
    return { path, edges, bbox: { x: mm1(d), y: mm1(d), w: mm1(W - 2 * d), h: mm1(H - 2 * d) }, area: Math.PI * a * b }
  }

  const ring = (d: number): Ring => {
    const a = Math.max(0.001, W / 2 - d)
    const b = Math.max(0.001, H / 2 - d)
    const steps = Math.max(8, Math.ceil((2 * Math.PI) / ARC_STEP))
    const pts: Pt[] = []
    const tags: number[] = []
    for (let i = 0; i < steps; i++) {
      const t = (2 * Math.PI * i) / steps
      pts.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) })
      tags.push(0)
    }
    return { pts, tags, sources: [{ label: 'arco', side: 'other', curved: true }] }
  }

  const outer = outline(0)
  const a0 = W / 2
  const b0 = H / 2
  return {
    kind,
    outer,
    perimeter: outerPerimeter,
    inset: outline,
    ring,
    // Radio de curvatura mínimo de la elipse: b²/a en los extremos del eje mayor.
    radius: mm1(Math.min(a0, b0) ** 2 / Math.max(a0, b0)),
    curved: true,
  }
}

// ─── Recortes por paño (formas con travesaños u hojas) ──────────────────────

/** Arista de una región recortada: de la forma (tag ≥ 0) o del rectángulo del paño (lado). */
export interface ClipEdge extends ShapeEdge {
  /** Lado del rectángulo del paño si la arista sale del recorte (travesaño, junta). */
  cut?: 'left' | 'right' | 'top' | 'bottom'
}

export interface ClipRegion {
  path: string
  edges: ClipEdge[]
  bbox: Rect
  area: number
  /** La región toca algún tramo de la forma (si no, es el rectángulo del paño tal cual). */
  touchesShape: boolean
}

const CUT_TAGS = { left: -1, right: -2, top: -3, bottom: -4 } as const
const CUT_INFO: Record<number, { cut: ClipEdge['cut']; label: string; side: Side }> = {
  [-1]: { cut: 'left', label: 'izq', side: 'left' },
  [-2]: { cut: 'right', label: 'der', side: 'right' },
  [-3]: { cut: 'top', label: 'arr', side: 'top' },
  [-4]: { cut: 'bottom', label: 'aba', side: 'bottom' },
}

/**
 * Intersección de un contorno convexo (anillo) con un rectángulo alineado a los ejes
 * (Sutherland–Hodgman). Cada tramo resultante conserva su arista de origen; los tramos nuevos
 * salen del lado del rectángulo que los cortó.
 */
export function clipRing(ring: Ring, r: Rect): ClipRegion | undefined {
  type V = { p: Pt; tag: number } // tag del tramo que sale de este vértice
  let poly: V[] = ring.pts.map((p, i) => ({ p, tag: ring.tags[i] ?? 0 }))
  const planes: { tag: number; inside: (p: Pt) => boolean; hit: (a: Pt, b: Pt) => Pt }[] = [
    { tag: CUT_TAGS.left, inside: (p) => p.x >= r.x - 1e-9, hit: (a, b) => lerpX(a, b, r.x) },
    { tag: CUT_TAGS.right, inside: (p) => p.x <= r.x + r.w + 1e-9, hit: (a, b) => lerpX(a, b, r.x + r.w) },
    { tag: CUT_TAGS.top, inside: (p) => p.y >= r.y - 1e-9, hit: (a, b) => lerpY(a, b, r.y) },
    { tag: CUT_TAGS.bottom, inside: (p) => p.y <= r.y + r.h + 1e-9, hit: (a, b) => lerpY(a, b, r.y + r.h) },
  ]
  for (const plane of planes) {
    if (poly.length === 0) break
    const out: V[] = []
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i]
      const next = poly[(i + 1) % poly.length]
      const curIn = plane.inside(cur.p)
      const nextIn = plane.inside(next.p)
      if (curIn && nextIn) out.push(cur)
      else if (curIn && !nextIn) {
        out.push(cur)
        out.push({ p: plane.hit(cur.p, next.p), tag: plane.tag })
      } else if (!curIn && nextIn) {
        out.push({ p: plane.hit(cur.p, next.p), tag: cur.tag })
      }
    }
    poly = dedupe(out)
  }
  if (poly.length < 3) return undefined
  const pts = poly.map((v) => v.p)
  const area = shoelace(pts)
  if (!(area > 1)) return undefined

  // Rota para empezar en un cambio de arista y agrupa tramos seguidos de la misma arista.
  let start = poly.findIndex((v, i) => v.tag !== poly[(i - 1 + poly.length) % poly.length].tag)
  if (start < 0) start = 0
  const rotated = [...poly.slice(start), ...poly.slice(0, start)]
  const groups: { tag: number; pts: Pt[] }[] = []
  rotated.forEach((v, i) => {
    const next = rotated[(i + 1) % rotated.length].p
    const last = groups[groups.length - 1]
    if (last && last.tag === v.tag) last.pts.push(next)
    else groups.push({ tag: v.tag, pts: [v.p, next] })
  })
  const dirStart = (g: { pts: Pt[] }) => sub(g.pts[1], g.pts[0])
  const dirEnd = (g: { pts: Pt[] }) => sub(g.pts[g.pts.length - 1], g.pts[g.pts.length - 2])
  const corner = (inDir: Pt, outDir: Pt) => {
    // Ángulo interior entre el tramo que llega y el que sale.
    const a = { x: -inDir.x, y: -inDir.y }
    const cos = dot(a, outDir) / ((len(a) || 1) * (len(outDir) || 1))
    return deg(Math.acos(clamp(cos, -1, 1)))
  }
  let touchesShape = false
  const edges: ClipEdge[] = groups.map((g, i) => {
    const prev = groups[(i - 1 + groups.length) % groups.length]
    const next = groups[(i + 1) % groups.length]
    let length = 0
    for (let k = 1; k < g.pts.length; k++) length += len(sub(g.pts[k], g.pts[k - 1]))
    const angleStart = round(corner(dirEnd(prev), dirStart(g)) / 2, 2)
    const angleEnd = round(corner(dirEnd(g), dirStart(next)) / 2, 2)
    if (g.tag < 0) {
      const info = CUT_INFO[g.tag]
      return { length, label: info.label, side: info.side, angleStart, angleEnd, cut: info.cut }
    }
    touchesShape = true
    const src = ring.sources[g.tag] ?? { label: 'incl.', side: 'other' as Side, curved: false }
    const edge: ClipEdge = { length, label: src.label, side: src.side, angleStart, angleEnd }
    if (src.curved) edge.curved = true
    return edge
  })
  return {
    path: 'M ' + pts.map((p) => `${svgNum(p.x)} ${svgNum(p.y)}`).join(' L ') + ' Z',
    edges,
    bbox: bboxOf(pts),
    area,
    touchesShape,
  }
}

function lerpX(a: Pt, b: Pt, x: number): Pt {
  const t = (x - a.x) / (b.x - a.x || 1e-12)
  return { x, y: a.y + (b.y - a.y) * t }
}
function lerpY(a: Pt, b: Pt, y: number): Pt {
  const t = (y - a.y) / (b.y - a.y || 1e-12)
  return { x: a.x + (b.x - a.x) * t, y }
}
function dedupe<T extends { p: Pt }>(list: T[]): T[] {
  const out: T[] = []
  for (const v of list) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.p.x - v.p.x) < 1e-6 && Math.abs(last.p.y - v.p.y) < 1e-6) continue
    out.push(v)
  }
  while (out.length > 1 && Math.abs(out[0].p.x - out[out.length - 1].p.x) < 1e-6 && Math.abs(out[0].p.y - out[out.length - 1].p.y) < 1e-6) out.pop()
  return out
}

/** ¿El rectángulo cabe entero dentro del contorno (convexo), con tolerancia `tol` mm? */
export function rectInsideRing(ring: Ring, r: Rect, tol = 1): boolean {
  const corners: Pt[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
  return corners.every((p) => pointInConvex(ring.pts, p, tol))
}

function pointInConvex(pts: Pt[], p: Pt, tol: number): boolean {
  const n = pts.length
  // Orientación del anillo por su área con signo.
  let signed = 0
  for (let i = 0; i < n; i++) signed += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y
  const orient = signed >= 0 ? 1 : -1
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const e = sub(b, a)
    const l = len(e)
    if (l < 1e-9) continue
    // Distancia con signo de p a la arista (positiva hacia adentro).
    if ((orient * cross(e, sub(p, a))) / l < -tol) return false
  }
  return true
}

/**
 * Tramo de una recta de eje (travesaño) dentro del contorno: x = valor (vertical) o y = valor
 * (horizontal). Devuelve los extremos y el ángulo de corte en cada uno contra el contorno
 * (90 = a escuadra).
 */
export function chordAlong(ring: Ring, dir: 'vertical' | 'horizontal', value: number): { from: number; to: number; angleFrom: number; angleTo: number } | undefined {
  const hits: { t: number; angle: number }[] = []
  const n = ring.pts.length
  for (let i = 0; i < n; i++) {
    const a = ring.pts[i]
    const b = ring.pts[(i + 1) % n]
    const [ua, ub] = dir === 'vertical' ? [a.x, b.x] : [a.y, b.y]
    if ((ua - value) * (ub - value) > 0 || ua === ub) continue
    const f = (value - ua) / (ub - ua)
    const t = dir === 'vertical' ? a.y + (b.y - a.y) * f : a.x + (b.x - a.x) * f
    const e = sub(b, a)
    const axis = dir === 'vertical' ? { x: 0, y: 1 } : { x: 1, y: 0 }
    const cos = Math.abs(dot(e, axis)) / (len(e) || 1)
    hits.push({ t, angle: round(deg(Math.acos(clamp(cos, 0, 1))), 2) })
  }
  if (hits.length < 2) return undefined
  hits.sort((x, y) => x.t - y.t)
  const first = hits[0]
  const last = hits[hits.length - 1]
  return { from: first.t, to: last.t, angleFrom: first.angle, angleTo: last.angle }
}
