import type { Rect } from '@dekopen/engine'
import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2, type UVGenerator } from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometría de perfiles. Todo se construye en milímetros en el espacio del modelo:
 * X = x − W/2, Y = H − y (la base de la ventana queda en Y = 0) y Z = z − D/2.
 */

export interface ModelSpace {
  width: number
  height: number
  depth: number
}

export type Band = { points: Vector2[]; alongX: boolean }

export function toModel(space: ModelSpace, x: number, y: number): Vector2 {
  return new Vector2(x - space.width / 2, space.height - y)
}

export function toModelZ(space: ModelSpace, z: number): number {
  return z - space.depth / 2
}

/**
 * UV en metros (1 unidad = 1000 mm) con la veta a lo largo de la pieza: `u` corre a lo largo y `v` a lo
 * ancho. La repetición física (escala del foliado en mm) la fija cada textura con `repeat`, así el foliado
 * exterior y el interior pueden tener escalas distintas sobre la misma geometría.
 */
const UV_UNIT = 1 / 1000

function grainUV(alongX: boolean): UVGenerator {
  return {
    generateTopUV(_geometry, vertices, a, b, c) {
      return [a, b, c].map((i) => {
        const x = vertices[i * 3]
        const y = vertices[i * 3 + 1]
        return alongX ? new Vector2(x * UV_UNIT, y * UV_UNIT) : new Vector2(y * UV_UNIT, x * UV_UNIT)
      })
    },
    generateSideWallUV(_geometry, vertices, a, b, c, d) {
      return [a, b, c, d].map((i) => {
        const x = vertices[i * 3]
        const y = vertices[i * 3 + 1]
        const z = vertices[i * 3 + 2]
        return alongX ? new Vector2(x * UV_UNIT, (y + z) * UV_UNIT) : new Vector2(y * UV_UNIT, (x + z) * UV_UNIT)
      })
    },
  }
}

/**
 * Las cuatro piezas de un anillo rectangular (marco, hoja) entre dos distancias al borde
 * exterior, con ingletes a 45°. Coordenadas del dibujo (y hacia abajo).
 */
export function ringBands(space: ModelSpace, rect: Rect, inset0: number, inset1: number): Band[] {
  const { x, y, w, h } = rect
  if (inset1 <= inset0 || w <= 2 * inset0 || h <= 2 * inset0) return []
  // Mismo inserto en ambos ejes para que el inglete quede a 45°.
  const i1 = Math.min(inset1, Math.min(w, h) / 2 - 0.25)
  const i1x = i1
  const i1y = i1
  const p = (px: number, py: number) => toModel(space, px, py)
  return [
    // arriba
    { alongX: true, points: [p(x + inset0, y + inset0), p(x + w - inset0, y + inset0), p(x + w - i1x, y + i1y), p(x + i1x, y + i1y)] },
    // derecha
    { alongX: false, points: [p(x + w - inset0, y + inset0), p(x + w - inset0, y + h - inset0), p(x + w - i1x, y + h - i1y), p(x + w - i1x, y + i1y)] },
    // abajo
    { alongX: true, points: [p(x + w - inset0, y + h - inset0), p(x + inset0, y + h - inset0), p(x + i1x, y + h - i1y), p(x + w - i1x, y + h - i1y)] },
    // izquierda
    { alongX: false, points: [p(x + inset0, y + h - inset0), p(x + inset0, y + inset0), p(x + i1x, y + i1y), p(x + i1x, y + h - i1y)] },
  ]
}

export function rectBand(space: ModelSpace, rect: Rect): Band {
  const { x, y, w, h } = rect
  const p = (px: number, py: number) => toModel(space, px, py)
  return { alongX: w >= h, points: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] }
}

export interface ExtrudeOptions {
  /** Canto redondeado en mm (0 = arista viva). */
  bevel?: number
  alongX?: boolean
  holes?: Vector2[][]
}

/** Extruye un polígono (ya en XY del modelo) entre z0 y z1 (Z del modelo). */
export function extrudePolygon(points: Vector2[], z0: number, z1: number, options: ExtrudeOptions = {}): BufferGeometry | null {
  const depth = z1 - z0
  if (points.length < 3 || !(depth > 0)) return null
  const shape = new Shape(points)
  for (const hole of options.holes ?? []) {
    if (hole.length >= 3) shape.holes.push(new Path(hole))
  }
  const bevel = Math.max(0, Math.min(options.bevel ?? 0, depth / 2 - 0.05))
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: bevel > 0 ? 2 : 0,
    UVGenerator: grainUV(options.alongX ?? false),
  })
  geometry.translate(0, 0, z0 + bevel)
  return geometry
}

/** Contorno rectangular en el espacio del modelo. */
export function rectPath(space: ModelSpace, rect: Rect): Vector2[] {
  return rectBand(space, rect).points
}

/** Crece (o encoge, con `by` negativo) un polígono por sus bisectrices. Acepta cualquier sentido de giro. */
export function offsetPolygon(points: Vector2[], by: number): Vector2[] {
  const n = points.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    area += a.x * b.y - b.x * a.y
  }
  const outward = area >= 0 ? 1 : -1
  return points.map((p, i) => {
    const a = p.clone().sub(points[(i - 1 + n) % n]).normalize()
    const b = points[(i + 1) % n].clone().sub(p).normalize()
    const na = new Vector2(a.y, -a.x)
    const nb = new Vector2(b.y, -b.x)
    const bisector = na.add(nb)
    if (bisector.lengthSq() < 1e-8) return p.clone()
    bisector.normalize()
    const scale = 1 / Math.max(0.3, bisector.dot(nb))
    return p.clone().addScaledVector(bisector, by * outward * scale)
  })
}

/** Caja alineada a los ejes del modelo (centro y tamaño en mm). */
export function boxAt(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): BufferGeometry | null {
  if (!(sx > 0 && sy > 0 && sz > 0)) return null
  const geometry = new BoxGeometry(sx, sy, sz)
  geometry.translate(cx, cy, cz)
  return geometry
}

/** Rectángulo de esquinas redondeadas como forma 2D centrada en el origen. */
export function roundedRectPoints(width: number, height: number, radius: number, segments = 6): Vector2[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const hw = width / 2
  const hh = height / 2
  const points: Vector2[] = []
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cy, start] of corners) {
    for (let s = 0; s <= segments; s++) {
      const a = start + (s / segments) * (Math.PI / 2)
      points.push(new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  }
  return points
}

/**
 * Convierte un path SVG en mm (y hacia abajo) en contornos del modelo.
 * Devuelve el contorno exterior de cada forma; null si no se puede leer.
 */
export function outlineToModel(space: ModelSpace, d: string | undefined, divisions = 32): Vector2[][] | null {
  if (!d || typeof DOMParser === 'undefined') return null
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d.replace(/"/g, '')}"/></svg>`
    const data = new SVGLoader().parse(svg)
    const contours: Vector2[][] = []
    for (const path of data.paths) {
      for (const shape of path.toShapes()) {
        const { shape: outer } = shape.extractPoints(divisions)
        const points = dedupe(outer.map((pt) => toModel(space, pt.x, pt.y)))
        if (points.length >= 3) contours.push(points)
      }
    }
    return contours.length > 0 ? contours : null
  } catch {
    return null
  }
}

function dedupe(points: Vector2[]): Vector2[] {
  const out: Vector2[] = []
  for (const pt of points) {
    const last = out[out.length - 1]
    if (!last || last.distanceToSquared(pt) > 1e-6) out.push(pt)
  }
  if (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) <= 1e-6) out.pop()
  return out
}

/** Fusiona geometrías (con o sin índice) en una sola y libera las originales. */
export function mergeAndDispose(geometries: BufferGeometry[]): BufferGeometry | null {
  if (geometries.length === 0) return null
  const prepared = geometries.map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    flat.clearGroups()
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') flat.deleteAttribute(name)
    }
    return flat
  })
  // Todas deben traer lo mismo para fusionarse; `color` (oclusión horneada) solo sobrevive si todas lo traen.
  if (prepared.some((geometry) => !geometry.getAttribute('color'))) {
    for (const geometry of prepared) geometry.deleteAttribute('color')
  }
  if (prepared.length === 1) return prepared[0]
  const merged = mergeGeometries(prepared, false)
  for (const geometry of prepared) geometry.dispose()
  if (merged) merged.computeBoundingSphere()
  return merged ?? null
}
