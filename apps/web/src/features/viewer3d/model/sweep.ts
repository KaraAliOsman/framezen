import { BufferAttribute, BufferGeometry, Vector2 } from 'three'
import type { Section } from './section'

/**
 * Barrido de una sección por un contorno del plano XY del modelo, con ingletes reales.
 *
 * Cada vértice del contorno desplaza la sección por su bisectriz, así dos piezas se encuentran a 45° (o
 * al ángulo que toque) sin geometría adicional. Un contorno curvo (arco) se recorre como una sola pieza con
 * normales continuas; una esquina viva corta la pieza, y el foliado cambia de sentido en el inglete
 * igual que en una ventana soldada.
 *
 * Los UV van en metros: `u` a lo largo de la pieza y `v` por el contorno de la sección.
 */

const UV_UNIT = 1 / 1000
/** Giro máximo (rad) entre tramos que siguen siendo una misma pieza curva. */
const SMOOTH_TURN = 0.42
/** Ancho de la línea de soldadura en el inglete (mm). */
const WELD_BAND = 1.4
const WELD_AO = 0.62

export interface SweepOptions {
  /** Contorno cerrado (anillo) o tramo abierto (travesaño, riel). */
  closed?: boolean
  /** Oscurece unos milímetros junto al inglete: la línea de soldadura. */
  weld?: boolean
}

interface Station {
  x: number
  y: number
  /** Desplazamiento en XY por milímetro de `d` (incluye la corrección del inglete). */
  ox: number
  oy: number
  /** Normal de sombreado del plano XY. */
  nx: number
  ny: number
  /** Dirección de la pieza, para la `u` del foliado. */
  tx: number
  ty: number
  u: number
  ao: number
}

export function signedArea(points: Vector2[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function dedupe(points: Vector2[], closed: boolean): Vector2[] {
  const out: Vector2[] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (!last || last.distanceTo(point) > 0.01) out.push(point)
  }
  if (closed && out.length > 2 && out[0].distanceTo(out[out.length - 1]) <= 0.01) out.pop()
  return out
}

/** Parte el contorno en piezas: una pieza termina en cada esquina viva. */
function pieces(path: Vector2[], closed: boolean, weld: boolean): Station[][] {
  const count = path.length
  const segments = closed ? count : count - 1
  const dirs: Vector2[] = []
  for (let i = 0; i < segments; i++) dirs.push(path[(i + 1) % count].clone().sub(path[i]).normalize())
  const leftOf = (t: Vector2) => new Vector2(-t.y, t.x)
  const isOpenEnd = (i: number) => !closed && (i === 0 || i === count - 1)
  const turn = (i: number) => {
    const inDir = dirs[(i - 1 + segments) % segments]
    const outDir = dirs[i % segments]
    return Math.atan2(inDir.x * outDir.y - inDir.y * outDir.x, inDir.dot(outDir))
  }
  const isCorner = (i: number) => isOpenEnd(i) || Math.abs(turn(i)) > SMOOTH_TURN

  // Offset por milímetro de `d` en el vértice `i` para la pieza de dirección `t`.
  const miter = (i: number, t: Vector2) => {
    if (isOpenEnd(i)) return leftOf(t)
    const a = leftOf(dirs[(i - 1 + segments) % segments])
    const b = leftOf(dirs[i % segments])
    const bisector = a.clone().add(b)
    if (bisector.lengthSq() < 1e-8) return b
    bisector.normalize()
    return bisector.multiplyScalar(1 / Math.max(0.2, bisector.dot(b)))
  }

  let begin = 0
  if (closed) {
    const first = path.findIndex((_, i) => isCorner(i))
    begin = first >= 0 ? first : 0
  }
  const out: Station[][] = []
  let stations: Station[] = []
  let u = 0
  const station = (x: number, y: number, o: Vector2, n: Vector2, t: Vector2, at: number, ao: number): Station => ({
    x,
    y,
    ox: o.x,
    oy: o.y,
    nx: n.x,
    ny: n.y,
    tx: t.x,
    ty: t.y,
    u: at,
    ao,
  })

  for (let k = 0; k <= segments; k++) {
    const i = (begin + k) % count
    const atEnd = k === segments
    const corner = isCorner(i)
    const p = path[i]
    if (k > 0) {
      const previous = path[(begin + k - 1) % count]
      u += p.distanceTo(previous)
      const t = dirs[(((i - 1) % segments) + segments) % segments]
      const o = miter(i, t)
      const n = corner ? leftOf(t) : o.clone().normalize()
      const welded = corner && weld && !isOpenEnd(i)
      if (welded) stations.push(station(p.x - t.x * WELD_BAND, p.y - t.y * WELD_BAND, o, n, t, u - WELD_BAND, 1))
      stations.push(station(p.x, p.y, o, n, t, u, welded ? WELD_AO : 1))
      if (corner || atEnd) {
        out.push(stations)
        stations = []
        u = 0
      }
    }
    if (!atEnd && (corner || k === 0)) {
      const t = dirs[i % segments]
      const o = miter(i, t)
      const n = corner ? leftOf(t) : o.clone().normalize()
      const welded = corner && weld && !isOpenEnd(i)
      stations.push(station(p.x, p.y, o, n, t, 0, welded ? WELD_AO : 1))
      if (welded) stations.push(station(p.x + t.x * WELD_BAND, p.y + t.y * WELD_BAND, o, n, t, WELD_BAND, 1))
    }
  }
  return out.filter((piece) => piece.length > 1)
}

/**
 * Barre `section` por `path`. En un contorno cerrado `d` crece hacia adentro, sea cual sea el sentido del
 * polígono que llegue. En un tramo abierto crece a la izquierda del recorrido.
 */
export function sweepSection(path: Vector2[], section: Section, options: SweepOptions = {}): BufferGeometry | null {
  const closed = options.closed ?? true
  let points = dedupe(path, closed)
  if (points.length < (closed ? 3 : 2)) return null
  if (closed && signedArea(points) < 0) points = [...points].reverse()
  const runs = pieces(points, closed, options.weld ?? false)

  let vertices = 0
  let indices = 0
  for (const run of runs) {
    for (const strip of section.strips) {
      vertices += run.length * strip.length
      indices += (run.length - 1) * (strip.length - 1) * 6
    }
  }
  if (vertices === 0) return null

  const position = new Float32Array(vertices * 3)
  const normal = new Float32Array(vertices * 3)
  const uv = new Float32Array(vertices * 2)
  const color = new Float32Array(vertices * 3)
  const index = new Uint32Array(indices)

  let v = 0
  let i = 0
  for (const run of runs) {
    for (const strip of section.strips) {
      const base = v
      for (const s of run) {
        for (const point of strip) {
          position[v * 3] = s.x + s.ox * point.d
          position[v * 3 + 1] = s.y + s.oy * point.d
          position[v * 3 + 2] = point.z
          normal[v * 3] = s.nx * point.nd
          normal[v * 3 + 1] = s.ny * point.nd
          normal[v * 3 + 2] = point.nz
          uv[v * 2] = (s.u + point.d * (s.ox * s.tx + s.oy * s.ty)) * UV_UNIT
          uv[v * 2 + 1] = point.v * UV_UNIT
          const ao = s.ao * point.ao
          color[v * 3] = ao
          color[v * 3 + 1] = ao
          color[v * 3 + 2] = ao
          v++
        }
      }
      const rows = run.length
      const cols = strip.length
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = base + r * cols + c
          const b = a + cols
          const d = a + 1
          const e = b + 1
          index[i++] = a
          index[i++] = d
          index[i++] = e
          index[i++] = a
          index[i++] = e
          index[i++] = b
        }
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setAttribute('color', new BufferAttribute(color, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}
