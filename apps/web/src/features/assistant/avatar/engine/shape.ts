/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN.
 */
import { TAU, lerp, r2 } from './math'

export interface Point {
  x: number
  y: number
}

/** Ángulos del perfil radial (θ = 0 a la derecha, sentido horario en pantalla). */
export const PROFILE_SAMPLES = 64

/**
 * Silueta = perfil radial r(θ) + pose. Todas las formas comparten los mismos 64
 * ángulos, así que el morph es una interpolación lineal de radios, sin librerías.
 */
export interface Silhouette {
  radii: number[]
  /** rotación del perfil, en radianes */
  rot: number
  /** desplazamiento del centro, en radios de la bola */
  cx: number
  cy: number
  /** estirar/aplastar en pantalla (después de rotar) */
  sx: number
  sy: number
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU)
const COS = ANGLES.map(Math.cos)
const SIN = ANGLES.map(Math.sin)

export function circle(radius: number, pose: Partial<Silhouette> = {}): Silhouette {
  return { radii: new Array<number>(PROFILE_SAMPLES).fill(radius), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose }
}

/** Interpola dos siluetas; la rotación va por el camino más corto. */
export function blend(a: Silhouette, b: Silhouette, t: number): Silhouette {
  const radii = new Array<number>(PROFILE_SAMPLES)
  for (let i = 0; i < PROFILE_SAMPLES; i++) radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t)
  let dRot = b.rot - a.rot
  while (dRot > Math.PI) dRot -= TAU
  while (dRot < -Math.PI) dRot += TAU
  return {
    radii,
    rot: a.rot + dRot * t,
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
  }
}

/** Proyecta la silueta a puntos de pantalla. `scale` = radio de la bola en unidades de viewBox. */
export function toPoints(s: Silhouette, scale: number, out: Point[] = []): Point[] {
  const cr = Math.cos(s.rot)
  const sr = Math.sin(s.rot)
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const r = s.radii[i] ?? 1
    const x = r * COS[i]
    const y = r * SIN[i]
    const rx = x * cr - y * sr
    const ry = x * sr + y * cr
    const p = out[i] ?? { x: 0, y: 0 }
    p.x = (rx * s.sx + s.cx) * scale
    p.y = (ry * s.sy + s.cy) * scale
    out[i] = p
  }
  out.length = PROFILE_SAMPLES
  return out
}

/** Polilínea cerrada → cúbicas Catmull-Rom (tensión 1/6). Liso al píxel aun a 600 px. */
export function closedPath(pts: Point[], tension = 1 / 6): string {
  const n = pts.length
  if (n < 3) return ''
  let d = `M${r2(pts[0].x)} ${r2(pts[0].y)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1x = p1.x + (p2.x - p0.x) * tension
    const c1y = p1.y + (p2.y - p0.y) * tension
    const c2x = p2.x - (p3.x - p1.x) * tension
    const c2y = p2.y - (p3.y - p1.y) * tension
    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`
  }
  return `${d}Z`
}

/** Radio del perfil en una dirección cualquiera (interpolando entre muestras vecinas). */
export function radiusAtAngle(radii: number[], angle: number): number {
  const n = radii.length
  const t = ((((angle / TAU) % 1) + 1) % 1) * n
  const i = Math.floor(t)
  return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i)
}

/** Cápsula (estadio) centrada en el origen: la forma exacta de los ojos. */
export function capsulePath(w: number, h: number): string {
  const hw = Math.max(w, 0.01) / 2
  const hh = Math.max(h, 0.01) / 2
  const r = Math.min(hw, hh)
  return (
    `M${r2(-hw)} ${r2(-hh + r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  )
}

/* ------------------------------------------------- constructores de perfiles */
/*
 * Portados de bloub (src/bot/shape.ts, MIT). Se calculan una sola vez al importar, nunca en el
 * bucle de dibujo: convierten formas que no se escriben naturalmente como r(θ) en perfiles de
 * 64 radios, y así cualquier forma se interpola con cualquier otra.
 */

/** Polígono cualquiera → perfil radial, lanzando rayos desde (cx, cy). */
export function profileFromPolygon(poly: Point[], cx = 0, cy = 0): number[] {
  const radii = new Array<number>(PROFILE_SAMPLES).fill(0)
  const n = poly.length
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    const dx = COS[k]
    const dy = SIN[k]
    let best = 0
    for (let i = 0; i < n; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % n]
      const ex = b.x - a.x
      const ey = b.y - a.y
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-9) continue
      const px = a.x - cx
      const py = a.y - cy
      const t = (px * ey - py * ex) / den
      const u = (px * dy - py * dx) / den
      if (t > best && u >= 0 && u <= 1) best = t
    }
    radii[k] = best
  }
  return radii
}

/** Envolvente convexa de dos círculos (cápsula cónica). */
export function hullOfCircles(x1: number, y1: number, r1: number, x2: number, y2: number, rr2: number, steps = 96): Point[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1e-6
  const base = Math.atan2(dy, dx)
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - rr2) / dist)))
  const pts: Point[] = []
  for (let i = 0; i <= steps / 2; i++) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2)
    pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 })
  }
  for (let i = 0; i <= steps / 2; i++) {
    const a = base - spread + (2 * spread * i) / (steps / 2)
    pts.push({ x: x2 + Math.cos(a) * rr2, y: y2 + Math.sin(a) * rr2 })
  }
  return pts
}

/** Superelipse |x/sx|^n + |y/sy|^n = 1 (n = 2 elipse, n ≈ 4 squircle). */
export function superellipseProfile(n: number, sx = 1, sy = 1): number[] {
  return ANGLES.map((_, i) => {
    const c = Math.abs(COS[i] / sx) ** n
    const s = Math.abs(SIN[i] / sy) ** n
    return (c + s) ** (-1 / n)
  })
}

/** Perfil de la UNIÓN de discos (exacto mientras el origen quede dentro). */
export function unionOfCirclesProfile(circles: ReadonlyArray<{ x: number; y: number; r: number }>): number[] {
  const out = new Array<number>(PROFILE_SAMPLES).fill(0)
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const dx = COS[i]
    const dy = SIN[i]
    let best = 0
    for (const c of circles) {
      const b = dx * c.x + dy * c.y
      const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r)
      if (disc < 0) continue
      const t = b + Math.sqrt(disc)
      if (t > best) best = t
    }
    out[i] = best
  }
  return out
}

/**
 * Polígono con esquinas redondeadas (suma de Minkowski con un disco): cada arista se empuja
 * `rc` hacia afuera y cada vértice se vuelve un arco de radio `rc`. Polígono en sentido horario.
 */
export function roundedPolygon(verts: Point[], rc: number, arcSteps = 10): Point[] {
  const n = verts.length
  const out: Point[] = []
  const normal = (a: Point, b: Point) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    return Math.atan2(-dx / len, dy / len)
  }
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]
    const cur = verts[i]
    const next = verts[(i + 1) % n]
    const a0 = normal(prev, cur)
    const a1 = normal(cur, next)
    let d = a1 - a0
    while (d > Math.PI) d -= TAU
    while (d < -Math.PI) d += TAU
    for (let k = 0; k <= arcSteps; k++) {
      const a = a0 + (d * k) / arcSteps
      out.push({ x: cur.x + Math.cos(a) * rc, y: cur.y + Math.sin(a) * rc })
    }
  }
  return out
}

/** Polígono regular de esquinas redondeadas inscrito en `radius`. */
export function regularPolygonProfile(sides: number, radius: number, rc: number, rotationDeg = 0): number[] {
  const rot = (rotationDeg * Math.PI) / 180
  const verts = Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * TAU
    return { x: Math.cos(a) * (radius - rc), y: Math.sin(a) * (radius - rc) }
  })
  return profileFromPolygon(roundedPolygon(verts, rc), 0, 0)
}

/** Rectángulo de esquinas redondeadas centrado (semiancho, semialto, radio de esquina). */
export function roundedRectProfile(hw: number, hh: number, rc: number): number[] {
  const verts = [
    { x: hw - rc, y: -(hh - rc) },
    { x: hw - rc, y: hh - rc },
    { x: -(hw - rc), y: hh - rc },
    { x: -(hw - rc), y: -(hh - rc) },
  ]
  return profileFromPolygon(roundedPolygon(verts, rc, 12), 0, 0)
}

/** Lleva el radio máximo a `max`: todas las formas pesan lo mismo a la vista. */
export function normalizeProfile(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii)
  if (!(peak > 0)) return radii
  const k = max / peak
  return radii.map((r) => r * k)
}

/** Ángulo (rad) de la muestra i del perfil. */
export function sampleAngle(i: number): number {
  return ANGLES[i]
}

/** Polilínea cerrada exacta (segmentos rectos), en unidades × `scale`. */
export function polyPath(pts: Point[], scale = 1): string {
  if (pts.length < 3) return ''
  let d = ''
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    d += `${i === 0 ? 'M' : 'L'}${r2(p.x * scale)} ${r2(p.y * scale)}`
  }
  return `${d}Z`
}

/** Elipse centrada en el origen (ojos redondos u ovalados). */
export function ellipsePath(w: number, h: number): string {
  const rx = Math.max(w, 0.01) / 2
  const ry = Math.max(h, 0.01) / 2
  return `M${r2(-rx)} 0A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(rx)} 0A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(-rx)} 0Z`
}

/**
 * Medialuna (ojo en arco): una banda curva de ancho `w`, flecha `h` y grosor `th`, con
 * extremos redondos. `curve` = 1 arco hacia arriba (∩, ojos sonrientes), 0 recta, −1 (∪).
 * El cuadro queda centrado en el origen.
 */
export function crescentPath(w: number, h: number, th: number, curve: number): string {
  const hw = Math.max(w, 0.02) / 2
  const t = Math.max(Math.min(th, w * 0.6), 0.01)
  const k = Math.max(h - t, 0) * curve
  const y0 = k / 2
  const top = y0 - t / 2
  const bottom = y0 + t / 2
  const cap = t / 2
  return (
    `M${r2(-hw)} ${r2(top)}` +
    `Q0 ${r2(top - 2 * k)} ${r2(hw)} ${r2(top)}` +
    `A${r2(cap)} ${r2(cap)} 0 0 1 ${r2(hw)} ${r2(bottom)}` +
    `Q0 ${r2(bottom - 2 * k)} ${r2(-hw)} ${r2(bottom)}` +
    `A${r2(cap)} ${r2(cap)} 0 0 1 ${r2(-hw)} ${r2(top)}Z`
  )
}
