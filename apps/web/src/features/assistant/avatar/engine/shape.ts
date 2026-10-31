/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen.
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
