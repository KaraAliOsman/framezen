import type { Rect, Shape, Side } from '../types'
import { clamp, mm1, round, svgNum } from './format'

/** Formas especiales (arco, trapecio, triángulo): contornos SVG en mm y aristas para el despiece. */

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
}

export interface ShapeGeometry {
  kind: 'arch' | 'trapezoid' | 'triangle'
  outer: ShapeOutline
  perimeter: number
  /** Contorno desplazado `d` mm hacia adentro (luz, vidrio, cara vista…). */
  inset: (d: number) => ShapeOutline
  /** Radio exterior del arco (mm). */
  radius?: number
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: Pt): number => Math.hypot(a.x, a.y)
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x
const deg = (rad: number): number => (rad * 180) / Math.PI

export function shapeGeometry(shape: Shape | undefined, W: number, H: number): ShapeGeometry | undefined {
  if (!shape || shape.kind === 'rect' || !(W > 0) || !(H > 0)) return undefined
  if (shape.kind === 'arch') return archGeometry(shape.rise, W, H)
  const poly = polygonFor(shape, W, H)
  if (!poly) return undefined
  const outer = polygonOutline(poly)
  return {
    kind: shape.kind,
    outer,
    perimeter: outer.edges.reduce((a, e) => a + e.length, 0),
    inset: (d) => polygonOutline(insetPolygon(poly, d)),
  }
}

function polygonFor(shape: Shape, W: number, H: number): Pt[] | undefined {
  if (shape.kind === 'trapezoid') {
    const lh = Number.isFinite(shape.leftHeight) ? clamp(shape.leftHeight, 1, H) : H
    const rh = Number.isFinite(shape.rightHeight) ? clamp(shape.rightHeight, 1, H) : H
    return [
      { x: 0, y: H },
      { x: W, y: H },
      { x: W, y: H - rh },
      { x: 0, y: H - lh },
    ]
  }
  if (shape.kind === 'triangle') {
    const apex = shape.apex === 'left' ? 0 : shape.apex === 'right' ? W : W / 2
    const top: Pt = { x: apex, y: 0 }
    return [{ x: 0, y: H }, { x: W, y: H }, top]
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

function polygonOutline(poly: Pt[]): ShapeOutline {
  const n = poly.length
  const c = centroid(poly)
  const angles = poly.map((p, i) => interiorAngle(poly[(i - 1 + n) % n], p, poly[(i + 1) % n]))
  const edges: ShapeEdge[] = poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    const v = sub(b, a)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    let label = 'incl.'
    let side: Side = 'other'
    if (Math.abs(v.y) < 0.5) {
      label = mid.y > c.y ? 'aba' : 'arr'
      side = mid.y > c.y ? 'bottom' : 'top'
    } else if (Math.abs(v.x) < 0.5) {
      label = mid.x < c.x ? 'izq' : 'der'
      side = mid.x < c.x ? 'left' : 'right'
    }
    return {
      length: len(v),
      label,
      side,
      angleStart: round(angles[i] / 2, 2),
      angleEnd: round(angles[(i + 1) % n] / 2, 2),
    }
  })
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    path: 'M ' + poly.map((p) => `${svgNum(p.x)} ${svgNum(p.y)}`).join(' L ') + ' Z',
    edges,
    bbox: { x: mm1(x), y: mm1(y), w: mm1(Math.max(...xs) - x), h: mm1(Math.max(...ys) - y) },
  }
}

function archGeometry(riseIn: number, W: number, H: number): ShapeGeometry {
  const rise = Number.isFinite(riseIn) && riseIn > 0 ? clamp(riseIn, 1, H) : Math.min(W / 2, H)
  const R = (W * W) / 4 / (2 * rise) + rise / 2
  const cy = R // la clave del arco toca y = 0
  const beyondHalf = rise > R + 1e-9

  const outline = (d: number): ShapeOutline & { arc: number; jamb: number; phi: number } => {
    const r = Math.max(R - d, W / 2 - d, 0.001)
    const half = Math.max(0, W / 2 - d)
    const root = Math.sqrt(Math.max(0, r * r - half * half))
    let ys = beyondHalf ? cy + root : cy - root
    const bottom = H - d
    ys = Math.min(ys, bottom)
    let phi = Math.asin(clamp(half / r, 0, 1))
    if (beyondHalf) phi = Math.PI - phi
    const arc = 2 * phi * r
    const jamb = Math.max(0, bottom - ys)
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
    edges.push({ length: arc, label: 'arco', side: 'top', angleStart: top, angleEnd: top, curved: true })
    return {
      path,
      edges,
      bbox: { x: mm1(d), y: mm1(d), w: mm1(W - 2 * d), h: mm1(H - 2 * d) },
      arc,
      jamb,
      phi,
    }
  }

  const outer = outline(0)
  return {
    kind: 'arch',
    outer,
    perimeter: outer.edges.reduce((a, e) => a + e.length, 0),
    inset: (d) => outline(d),
    radius: mm1(R),
  }
}
