/**
 * Lectura de los contornos que entrega el motor para formas especiales (`frame.outline`,
 * `frame.innerOutline`, `pane.outline`): paths SVG en mm con M, L, H, V, A y Z absolutos.
 * Se convierten en tramos rectos y arcos (forma centro) para cortar piezas con ingletes y curvas.
 */

export type Pt = [number, number]

export interface LineSegment {
  kind: 'line'
  a: Pt
  b: Pt
}

export interface ArcSegment {
  kind: 'arc'
  a: Pt
  b: Pt
  cx: number
  cy: number
  rx: number
  ry: number
  /** Ángulo inicial y barrido (rad, con signo) sobre la elipse sin rotar. */
  t0: number
  dt: number
}

export type Segment = LineSegment | ArcSegment

const TOKEN = /[MLHVAZmlhvaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g

/** Tramos de un path absoluto del motor. Devuelve [] si hay comandos que no conoce. */
export function pathSegments(d: string | undefined): Segment[] {
  if (!d) return []
  const tokens = d.match(TOKEN)
  if (!tokens) return []
  const out: Segment[] = []
  let i = 0
  let cmd = ''
  let cur: Pt = [0, 0]
  let start: Pt = [0, 0]
  const num = () => {
    const value = Number(tokens[i++])
    if (!Number.isFinite(value)) throw new Error('path')
    return value
  }
  try {
    while (i < tokens.length) {
      const t = tokens[i]
      if (/^[A-Za-z]$/.test(t)) {
        cmd = t
        i++
        if (cmd === 'Z' || cmd === 'z') {
          if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-6) out.push({ kind: 'line', a: cur, b: start })
          cur = start
          continue
        }
      }
      if (/[a-z]/.test(cmd)) return []
      switch (cmd) {
        case 'M': {
          cur = [num(), num()]
          start = cur
          cmd = 'L'
          break
        }
        case 'L': {
          const b: Pt = [num(), num()]
          out.push({ kind: 'line', a: cur, b })
          cur = b
          break
        }
        case 'H': {
          const b: Pt = [num(), cur[1]]
          out.push({ kind: 'line', a: cur, b })
          cur = b
          break
        }
        case 'V': {
          const b: Pt = [cur[0], num()]
          out.push({ kind: 'line', a: cur, b })
          cur = b
          break
        }
        case 'A': {
          const rx = num()
          const ry = num()
          num() // rotación (el motor no rota sus elipses)
          const large = num() !== 0
          const sweep = num() !== 0
          const b: Pt = [num(), num()]
          const arc = arcFromEndpoints(cur, b, rx, ry, large, sweep)
          out.push(arc ?? { kind: 'line', a: cur, b })
          cur = b
          break
        }
        default:
          return []
      }
    }
  } catch {
    return []
  }
  return out
}

/** Conversión estándar de arco SVG (extremos) a forma centro, sin rotación. */
function arcFromEndpoints(a: Pt, b: Pt, rx0: number, ry0: number, large: boolean, sweep: boolean): ArcSegment | null {
  let rx = Math.abs(rx0)
  let ry = Math.abs(ry0)
  if (rx < 1e-9 || ry < 1e-9) return null
  const dx = (a[0] - b[0]) / 2
  const dy = (a[1] - b[1]) / 2
  const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
  const den = rx * rx * dy * dy + ry * ry * dx * dx
  let coef = den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0
  if (large === sweep) coef = -coef
  const cxp = (coef * (rx * dy)) / ry
  const cyp = (coef * -(ry * dx)) / rx
  const cx = cxp + (a[0] + b[0]) / 2
  const cy = cyp + (a[1] + b[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)))
    if (ux * vy - uy * vx < 0) ang = -ang
    return ang
  }
  const t0 = angle(1, 0, (dx - cxp) / rx, (dy - cyp) / ry)
  let dt = angle((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  else if (sweep && dt < 0) dt += 2 * Math.PI
  return { kind: 'arc', a, b, cx, cy, rx, ry, t0, dt }
}

export function arcPoint(arc: ArcSegment, t: number): Pt {
  return [arc.cx + arc.rx * Math.cos(t), arc.cy + arc.ry * Math.sin(t)]
}

/** Puntos de un tramo (arcos muestreados con paso máximo `step` rad). Incluye ambos extremos. */
export function samplePoints(seg: Segment, step = Math.PI / 36): Pt[] {
  if (seg.kind === 'line') return [seg.a, seg.b]
  const n = Math.max(2, Math.ceil(Math.abs(seg.dt) / step))
  const pts: Pt[] = []
  for (let k = 0; k <= n; k++) pts.push(arcPoint(seg, seg.t0 + (seg.dt * k) / n))
  pts[0] = seg.a
  pts[n] = seg.b
  return pts
}

/** Polígono denso de un contorno cerrado (para áreas, recortes y pruebas). */
export function outlinePolygon(d: string | undefined, step?: number): Pt[] {
  const segs = pathSegments(d)
  const pts: Pt[] = []
  for (const s of segs) {
    const sp = samplePoints(s, step)
    for (let k = pts.length ? 1 : 0; k < sp.length; k++) pts.push(sp[k])
  }
  if (pts.length > 2) {
    const [x0, y0] = pts[0]
    const [x1, y1] = pts[pts.length - 1]
    if (Math.hypot(x1 - x0, y1 - y0) < 1e-6) pts.pop()
  }
  return pts
}

export function polygonArea(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

export function pointsPath(pts: Pt[], close = true, digits = 1): string {
  const f = 10 ** digits
  const r = (n: number) => Math.round(n * f) / f
  return pts.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])} ${r(p[1])}`).join('') + (close ? 'Z' : '')
}
