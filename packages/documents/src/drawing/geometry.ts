import type { Layout, LayoutDimension, Opening, OpeningKind, Rect, Shape } from '@framezen/engine'

export type DrawingView = 'interior' | 'exterior'
export type DimensionMode = 'none' | 'total' | 'all'

export interface Viewport {
  /** Tamaño del SVG en px. */
  width: number
  height: number
  /** px por mm. */
  scale: number
  /** Esquina superior izquierda del marco en px. */
  ox: number
  oy: number
  mirror: boolean
  pad: { top: number; right: number; bottom: number; left: number }
  rowsX: number
  rowsY: number
  font: number
  rowGap: number
}

/** Fila asignada a cada cota (0 = la más cercana al dibujo). */
export interface PlacedDimension {
  dim: LayoutDimension
  row: number
}

/** Cotas visibles según el modo, con totales sintetizados si el motor no los trae. */
export function visibleDimensions(layout: Layout, mode: DimensionMode): LayoutDimension[] {
  if (mode === 'none') return []
  const dims = layout.dimensions ?? []
  const out: LayoutDimension[] = []
  for (const axis of ['x', 'y'] as const) {
    const total = dims.find((d) => d.axis === axis && d.level === 0)
    const size = axis === 'x' ? layout.width : layout.height
    out.push(total ?? { axis, from: 0, to: size, value: size, level: 0, target: { kind: axis === 'x' ? 'width' : 'height' } })
    if (mode === 'all') {
      const partials = dims.filter((d) => d.axis === axis && d.level === 1 && d.to > d.from)
      // Una sola parcial que cubre todo repite el total: no aporta.
      const useful = partials.filter((d) => !(Math.abs(d.from) < 0.5 && Math.abs(d.to - size) < 0.5))
      if (useful.length > 0) out.push(...useful)
    }
  }
  return out
}

/** Reparte las cotas parciales en filas sin solaparse; el total va siempre en la fila más externa. */
export function placeDimensions(dims: LayoutDimension[], axis: 'x' | 'y'): { placed: PlacedDimension[]; rows: number } {
  const partials = dims.filter((d) => d.axis === axis && d.level === 1).sort((a, b) => a.from - b.from || a.to - b.to)
  const rowEnds: number[] = []
  const placed: PlacedDimension[] = []
  for (const dim of partials) {
    let row = rowEnds.findIndex((end) => dim.from >= end - 0.5)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(dim.to)
    } else rowEnds[row] = dim.to
    placed.push({ dim, row })
  }
  const totalRow = rowEnds.length
  const totals = dims.filter((d) => d.axis === axis && d.level === 0)
  for (const dim of totals) placed.push({ dim, row: totalRow })
  return { placed, rows: totals.length ? totalRow + 1 : totalRow }
}

export interface ViewportOptions {
  width?: number
  height?: number
  dimensions: LayoutDimension[]
  view: DrawingView
  caption?: boolean
}

/** Escala automática: el dibujo cabe en width × height dejando espacio para las cotas. */
export function computeViewport(layout: Layout, opts: ViewportOptions): Viewport {
  const lw = Math.max(1, layout.width)
  const lh = Math.max(1, layout.height)
  const guessW = opts.width ?? (opts.height ? undefined : 320)
  const font = (guessW ?? opts.height ?? 320) >= 300 ? 11 : (guessW ?? opts.height ?? 320) >= 180 ? 10 : 9
  const rowGap = Math.round(font * 1.55)
  const rowsX = placeDimensions(opts.dimensions, 'x').rows
  const rowsY = placeDimensions(opts.dimensions, 'y').rows
  const base = opts.dimensions.length ? 6 : 2
  const pad = {
    top: base,
    right: base + (rowsY ? 4 : 0),
    bottom: base + (rowsX ? 6 + rowsX * rowGap : 0) + (opts.caption ? font + 8 : 0),
    left: base + (rowsY ? 10 + rowsY * rowGap : 0),
  }
  const padX = pad.left + pad.right
  const padY = pad.top + pad.bottom
  let width: number
  let height: number
  if (opts.width !== undefined && opts.height !== undefined) {
    width = opts.width
    height = opts.height
  } else if (opts.height !== undefined) {
    height = opts.height
    width = padX + ((height - padY) * lw) / lh
  } else {
    width = guessW ?? 320
    height = padY + ((width - padX) * lh) / lw
  }
  const scale = Math.max(0.0001, Math.min((width - padX) / lw, (height - padY) / lh))
  const ox = pad.left + (width - padX - lw * scale) / 2
  const oy = pad.top + (height - padY - lh * scale) / 2
  return {
    width: round(width),
    height: round(height),
    scale,
    ox,
    oy,
    mirror: opts.view === 'exterior',
    pad,
    rowsX,
    rowsY,
    font,
    rowGap,
  }
}

export function round(n: number, d = 2): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

/** mm (vista interior) → px, espejando una sola vez para la vista exterior. */
export function mapX(vp: Viewport, layoutWidth: number, x: number): number {
  return vp.ox + (vp.mirror ? layoutWidth - x : x) * vp.scale
}

export function mapY(vp: Viewport, y: number): number {
  return vp.oy + y * vp.scale
}

export function mapRect(vp: Viewport, layoutWidth: number, r: Rect): Rect {
  const x = vp.mirror ? layoutWidth - (r.x + r.w) : r.x
  return { x: vp.ox + x * vp.scale, y: vp.oy + r.y * vp.scale, w: r.w * vp.scale, h: r.h * vp.scale }
}

export function insetRect(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.w / 2)
  const dy = Math.min(d, r.h / 2)
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy }
}

export function rectPath(r: Rect): string {
  return `M${round(r.x)} ${round(r.y)}H${round(r.x + r.w)}V${round(r.y + r.h)}H${round(r.x)}Z`
}

/** Banda (marco u hoja): contorno exterior menos el interior, para fill-rule evenodd. */
export function bandPath(outer: Rect, inner: Rect): string {
  return `${rectPath(outer)}${rectPath(inner)}`
}

/** Líneas de inglete a 45° entre esquinas exteriores e interiores. */
export function miterLines(outer: Rect, inner: Rect): string {
  const o = [
    [outer.x, outer.y],
    [outer.x + outer.w, outer.y],
    [outer.x + outer.w, outer.y + outer.h],
    [outer.x, outer.y + outer.h],
  ]
  const i = [
    [inner.x, inner.y],
    [inner.x + inner.w, inner.y],
    [inner.x + inner.w, inner.y + inner.h],
    [inner.x, inner.y + inner.h],
  ]
  return o.map((p, k) => `M${round(p[0])} ${round(p[1])}L${round(i[k][0])} ${round(i[k][1])}`).join('')
}

// ── Formas no rectangulares (respaldo si el motor no entrega el contorno) ─────

type Pt = [number, number]

function polygonPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${round(p[0], 1)} ${round(p[1], 1)}`).join('') + 'Z'
}

/** Desplaza hacia adentro un polígono convexo en sentido horario (y hacia abajo). */
function insetPolygon(pts: Pt[], d: number): Pt[] {
  const n = pts.length
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    // Normal interior para polígonos horarios en pantalla (y hacia abajo).
    const nx = -dy / len
    const ny = dx / len
    return { p: [p[0] + nx * d, p[1] + ny * d] as Pt, dir: [dx, dy] as Pt }
  })
  return lines.map((l, i) => {
    const prev = lines[(i - 1 + n) % n]
    const cross = prev.dir[0] * l.dir[1] - prev.dir[1] * l.dir[0]
    if (Math.abs(cross) < 1e-9) return l.p
    const t = ((l.p[0] - prev.p[0]) * l.dir[1] - (l.p[1] - prev.p[1]) * l.dir[0]) / cross
    return [prev.p[0] + prev.dir[0] * t, prev.p[1] + prev.dir[1] * t] as Pt
  })
}

function shapePolygon(shape: Shape, w: number, h: number): Pt[] | null {
  if (shape.kind === 'trapezoid') {
    const lh = Math.min(h, Math.max(0, shape.leftHeight))
    const rh = Math.min(h, Math.max(0, shape.rightHeight))
    return [
      [0, h - lh],
      [w, h - rh],
      [w, h],
      [0, h],
    ]
  }
  if (shape.kind === 'triangle') {
    const ax = shape.apex === 'left' ? 0 : shape.apex === 'right' ? w : w / 2
    return [
      [ax, 0],
      [w, h],
      [0, h],
    ]
  }
  return null
}

/** Contorno exterior e interior (en mm) para arcos, trapecios y triángulos. */
export function shapeOutlines(shape: Shape | undefined, w: number, h: number, face: number): { outer: string; inner: string } | null {
  if (!shape || shape.kind === 'rect') return null
  if (shape.kind === 'arch') {
    const rise = Math.min(h, Math.max(1, shape.rise))
    const rx = w / 2
    const outer = `M0 ${h}L0 ${round(rise, 1)}A${round(rx, 1)} ${round(rise, 1)} 0 0 1 ${w} ${round(rise, 1)}L${w} ${h}Z`
    const irx = Math.max(1, rx - face)
    const iry = Math.max(1, rise - face)
    const inner = `M${face} ${h - face}L${face} ${round(rise, 1)}A${round(irx, 1)} ${round(iry, 1)} 0 0 1 ${w - face} ${round(rise, 1)}L${w - face} ${h - face}Z`
    return { outer, inner }
  }
  const poly = shapePolygon(shape, w, h)
  if (!poly) return null
  // Orden horario en pantalla: el triángulo y el trapecio ya están así.
  return { outer: polygonPath(poly), inner: polygonPath(insetPolygon(poly, face)) }
}

// ── Aperturas ─────────────────────────────────────────────────────────────────

export function defaultDirection(kind: OpeningKind): 'in' | 'out' {
  return kind === 'awning' ? 'out' : 'in'
}

export function defaultHandle(opening: Opening): 'left' | 'right' | 'top' | 'bottom' | undefined {
  switch (opening.kind) {
    case 'casement':
    case 'tilt_turn':
    case 'door':
      return opening.hinge === 'right' ? 'left' : 'right'
    case 'tilt':
      return 'top'
    case 'awning':
      return 'bottom'
    default:
      return undefined
  }
}

export function flipSide<T extends string>(side: T, mirror: boolean): T {
  if (!mirror) return side
  if (side === 'left') return 'right' as T
  if (side === 'right') return 'left' as T
  return side
}

/**
 * Trazos del símbolo de apertura dentro del rectángulo del vidrio (px, ya espejado).
 * Convención: líneas desde las esquinas del lado de cierre hacia el punto medio del
 * lado de bisagras. Proyectante = vértice arriba; oscilante = vértice abajo.
 */
export function openingSymbolPaths(kind: OpeningKind, hinge: 'left' | 'right', g: Rect): string[] {
  const x0 = round(g.x)
  const x1 = round(g.x + g.w)
  const y0 = round(g.y)
  const y1 = round(g.y + g.h)
  const xm = round(g.x + g.w / 2)
  const ym = round(g.y + g.h / 2)
  const turn = hinge === 'left' ? `M${x1} ${y0}L${x0} ${ym}L${x1} ${y1}` : `M${x0} ${y0}L${x1} ${ym}L${x0} ${y1}`
  const tilt = `M${x0} ${y0}L${xm} ${y1}L${x1} ${y0}`
  const awning = `M${x0} ${y1}L${xm} ${y0}L${x1} ${y1}`
  switch (kind) {
    case 'casement':
    case 'door':
      return [turn]
    case 'tilt_turn':
      return [turn, tilt]
    case 'tilt':
      return [tilt]
    case 'awning':
      return [awning]
    default:
      return []
  }
}

/** Flecha de corredera del 25 % al 75 % del paño, en el sentido de apertura. */
export function slidingArrowPath(g: Rect, direction: 'left' | 'right', head: number): { line: string; head: string } {
  const y = round(g.y + g.h / 2)
  const a = g.x + g.w * 0.25
  const b = g.x + g.w * 0.75
  const [from, to] = direction === 'right' ? [a, b] : [b, a]
  const s = direction === 'right' ? -1 : 1
  return {
    line: `M${round(from)} ${y}L${round(to)} ${y}`,
    head: `M${round(to + s * head)} ${round(y - head * 0.75)}L${round(to)} ${y}L${round(to + s * head)} ${round(y + head * 0.75)}`,
  }
}
