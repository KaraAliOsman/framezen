/**
 * Símbolos de apertura (px, ya espejados), comunes al dibujo técnico y al realista.
 *
 * Convención DEKOPEN (DESIGN §14, investigación 25 §9): vista interior por defecto; las líneas van de
 * las esquinas del lado de cierre al punto medio del lado de bisagras (el vértice marca las bisagras);
 * continua si abre hacia quien mira, discontinua `6 4` si se aleja. Pivotantes: eje de trazo y punto
 * con flecha de giro. Corredera: flecha del 25 % al 75 % de la hoja móvil; elevadora con marca de
 * levante; osciloparalela = oscilante + flecha; plegable = zigzag del grupo con flecha hacia el apilado.
 */
import type { ReactNode } from 'react'
import type { Layout, LayoutSash, Rect } from '@dekopen/engine'
import { defaultDirection, flipSide, mapRect, openingSymbolPaths, round, slidingArrowPath, type Viewport } from './geometry'

export interface SymbolStyle {
  stroke: string
  strokeOpacity: number
  strokeWidth: number
  /** Texto «F» de los fijos de corredera. */
  textColor: string
  textOpacity: number
}

const DASH = '6 4'
const AXIS_DASH = '10 3 2 3'

function arrowHead(tx: number, ty: number, dx: number, dy: number, size: number): string {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const bx = tx - ux * size
  const by = ty - uy * size
  return `M${round(bx + px * size * 0.75)} ${round(by + py * size * 0.75)}L${round(tx)} ${round(ty)}L${round(bx - px * size * 0.75)} ${round(by - py * size * 0.75)}`
}

/** Flecha horizontal en el centro de `g` hacia `dir`. */
function horizontalArrow(g: Rect, dir: 'left' | 'right', yAt = 0.5): string {
  const head = Math.max(3, Math.min(7, g.w * 0.06))
  const a = slidingArrowPath({ ...g, y: g.y + g.h * yAt - g.h / 2 }, dir, head)
  return a.line + a.head
}

/** Flecha vertical de una hoja de guillotina, centrada en el vidrio. */
function verticalArrow(g: Rect, dir: 'up' | 'down'): string {
  const head = Math.max(3, Math.min(7, g.h * 0.06))
  const x = g.x + g.w / 2
  const span = Math.min(g.h * 0.5, 80)
  const y0 = g.y + g.h / 2 + (dir === 'up' ? span / 2 : -span / 2)
  const y1 = g.y + g.h / 2 + (dir === 'up' ? -span / 2 : span / 2)
  return `M${round(x)} ${round(y0)}V${round(y1)}` + arrowHead(x, y1, 0, y1 - y0, head)
}

/** Flecha curva de giro (pivotantes), centrada en (cx, cy). */
function rotationArrow(cx: number, cy: number, r: number, vertical: boolean): string {
  const head = Math.max(2.5, r * 0.35)
  if (vertical) {
    const x0 = cx - r
    const x1 = cx + r
    const y = cy
    return `M${round(x0)} ${round(y)}Q${round(cx)} ${round(y - r * 0.9)} ${round(x1)} ${round(y)}` + arrowHead(x1, y, r * 0.9, r * 0.9, head)
  }
  const y0 = cy - r
  const y1 = cy + r
  return `M${round(cx)} ${round(y0)}Q${round(cx + r * 0.9)} ${round(cy)} ${round(cx)} ${round(y1)}` + arrowHead(cx, y1, -r * 0.9, r * 0.9, head)
}

export interface SymbolContext {
  layout: Layout
  vp: Viewport
  /** Vista: decide continua/discontinua y el espejo. */
  view: 'interior' | 'exterior'
  style: SymbolStyle
  /** Texto de «fijo» en el idioma del dibujo. */
  fixedMark: string
}

/** Trazos de los símbolos de todas las hojas y paneles. */
export function openingSymbols(ctx: SymbolContext): ReactNode[] {
  const { layout, vp, view, style } = ctx
  const LW = layout.width
  const mirror = vp.mirror
  const R = (r: Rect) => mapRect(vp, LW, r)
  const towardViewer = (direction: 'in' | 'out') => (direction === 'in') === (view === 'interior')
  const base = {
    stroke: style.stroke,
    strokeOpacity: style.strokeOpacity,
    strokeWidth: style.strokeWidth,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  }
  const out: ReactNode[] = []
  const glassOf = (sash: LayoutSash) => {
    const pane = layout.panes.find((p) => p.nodeId === sash.nodeId)
    return R(pane && !pane.outline ? pane.glassRect : sash.glassRect)
  }

  const folding: LayoutSash[] = []
  layout.sashes.forEach((sash) => {
    const kind = sash.opening.kind
    if (kind === 'fixed') return
    const g = glassOf(sash)
    if (g.w < 2 || g.h < 2) return
    const direction = sash.opening.direction ?? defaultDirection(kind)
    const dash = towardViewer(direction) ? undefined : DASH
    const hinge = flipSide(sash.opening.hinge ?? 'left', mirror)
    const key = `sym-${sash.nodeId}`
    switch (kind) {
      case 'folding':
        folding.push(sash)
        return
      case 'pivot_v':
      case 'pivot_h': {
        const vertical = kind === 'pivot_v'
        const f = Math.min(0.95, Math.max(0.05, sash.opening.pivot ?? 0.5))
        const tick = Math.max(3, Math.min(8, Math.min(g.w, g.h) * 0.05))
        let d: string
        let arrow: string
        if (vertical) {
          const x = g.x + g.w * (mirror ? 1 - f : f)
          d = `M${round(x)} ${round(g.y)}V${round(g.y + g.h)}`
          const ticks = `M${round(x - tick)} ${round(g.y)}H${round(x + tick)}M${round(x - tick)} ${round(g.y + g.h)}H${round(x + tick)}`
          arrow = ticks + rotationArrow(x, g.y + g.h * 0.2, Math.min(g.w * 0.22, g.h * 0.12), true)
        } else {
          const y = g.y + g.h * f
          d = `M${round(g.x)} ${round(y)}H${round(g.x + g.w)}`
          const ticks = `M${round(g.x)} ${round(y - tick)}V${round(y + tick)}M${round(g.x + g.w)} ${round(y - tick)}V${round(y + tick)}`
          arrow = ticks + rotationArrow(g.x + g.w * 0.8, y, Math.min(g.h * 0.22, g.w * 0.12), false)
        }
        out.push(<path key={`${key}-axis`} d={d} {...base} strokeDasharray={AXIS_DASH} data-symbol={kind} />)
        out.push(<path key={`${key}-rot`} d={arrow} {...base} />)
        return
      }
      case 'tilt_slide': {
        const [tilt] = openingSymbolPaths('tilt', hinge, g)
        const dir = flipSide(sash.opening.slide ?? 'left', mirror)
        out.push(<path key={`${key}-t`} d={tilt} {...base} strokeDasharray={dash} data-symbol={kind} />)
        out.push(<path key={`${key}-s`} d={horizontalArrow(g, dir, 0.62)} {...base} />)
        return
      }
      case 'parallel_slide': {
        const dir = flipSide(sash.opening.slide ?? 'left', mirror)
        const inset = Math.max(2, Math.min(8, Math.min(g.w, g.h) * 0.04))
        const offset = `M${round(g.x + inset)} ${round(g.y + inset)}H${round(g.x + g.w - inset)}V${round(g.y + g.h - inset)}H${round(g.x + inset)}Z`
        out.push(<path key={`${key}-o`} d={offset} {...base} strokeOpacity={style.strokeOpacity * 0.6} strokeDasharray="3 3" data-symbol={kind} />)
        out.push(<path key={`${key}-s`} d={horizontalArrow(g, dir)} {...base} />)
        return
      }
      default: {
        openingSymbolPaths(kind, hinge, g).forEach((d, i) => {
          out.push(<path key={`${key}-${i}`} d={d} {...base} strokeDasharray={dash} data-symbol={kind} />)
        })
      }
    }
  })

  // Plegables: un zigzag por grupo (hojas contiguas que se apilan al mismo lado).
  const sorted = [...folding].sort((a, b) => a.rect.x - b.rect.x)
  const groups: LayoutSash[][] = []
  for (const sash of sorted) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.opening.hinge === sash.opening.hinge && Math.abs(prev.rect.x + prev.rect.w - sash.rect.x) < 30) last.push(sash)
    else groups.push([sash])
  }
  groups.forEach((group, gi) => {
    const rects = group.map((s) => glassOf(s)).sort((a, b) => a.x - b.x)
    const top = Math.min(...rects.map((r) => r.y))
    const bottom = Math.max(...rects.map((r) => r.y + r.h))
    const h = bottom - top
    const y0 = top + h * 0.08
    const y1 = bottom - h * 0.08
    const xs = [rects[0].x]
    for (let i = 1; i < rects.length; i++) xs.push((rects[i - 1].x + rects[i - 1].w + rects[i].x) / 2)
    xs.push(rects[rects.length - 1].x + rects[rects.length - 1].w)
    const zig = xs.map((x, i) => `${i ? 'L' : 'M'}${round(x)} ${round(i % 2 === 0 ? y0 : y1)}`).join('')
    const direction = group[0].opening.direction ?? 'in'
    const dash = towardViewer(direction) ? undefined : DASH
    const stack = flipSide(group[0].opening.hinge ?? 'left', mirror)
    const span = { x: xs[0], y: top, w: xs[xs.length - 1] - xs[0], h }
    const ay = top + h * 0.5
    const head = Math.max(3, Math.min(8, span.w * 0.03))
    const a = stack === 'left' ? span.x + span.w * 0.38 : span.x + span.w * 0.62
    const b = stack === 'left' ? span.x + span.w * 0.12 : span.x + span.w * 0.88
    const arrow = `M${round(a)} ${round(ay)}H${round(b)}` + arrowHead(b, ay, b - a, 0, head)
    out.push(<path key={`fold-${gi}`} d={zig} {...base} strokeDasharray={dash} data-symbol="folding" />)
    out.push(<path key={`fold-${gi}-a`} d={arrow} {...base} />)
  })

  // Correderas: flecha en la hoja móvil (y marca de levante en la elevadora); «F» en la fija.
  const lift = layout.slidingSystem === 'lift_slide'
  layout.sliding.forEach((panel) => {
    const g = R(panel.glassRect)
    if (g.w < 2 || g.h < 2) return
    if (panel.kind === 'moving' && (panel.direction === 'up' || panel.direction === 'down')) {
      out.push(<path key={`arr-${panel.panelId}`} d={verticalArrow(g, panel.direction)} {...base} data-symbol="vertical_slide" />)
    } else if (panel.kind === 'moving') {
      const fallback = panel.index === 0 ? 'right' : 'left'
      const dir = flipSide((panel.direction as 'left' | 'right' | undefined) ?? fallback, mirror)
      out.push(<path key={`arr-${panel.panelId}`} d={horizontalArrow(g, dir)} {...base} data-symbol={lift ? 'lift_slide' : 'sliding'} />)
      if (lift) {
        // Levante: flecha corta hacia arriba junto al canto de cierre, abajo (1 ↑, 2 →).
        const x = dir === 'right' ? g.x + g.w * 0.25 : g.x + g.w * 0.75
        const yb = g.y + g.h * 0.5
        const len = Math.max(10, Math.min(g.h * 0.12, 40))
        const head = Math.max(3, Math.min(6, len * 0.3))
        // En una miniatura la marca se saldría del vidrio: basta la flecha.
        if (yb - len >= g.y + 2) out.push(<path key={`lift-${panel.panelId}`} d={`M${round(x)} ${round(yb)}V${round(yb - len)}` + arrowHead(x, yb - len, 0, -len, head)} {...base} data-symbol="lift" />)
      }
    } else {
      const fs = Math.max(7, Math.min(14, Math.min(g.w, g.h) * 0.14))
      out.push(
        <text key={`f-${panel.panelId}`} x={round(g.x + g.w / 2)} y={round(g.y + g.h / 2 + fs * 0.36)} textAnchor="middle" fontSize={round(fs)} fontWeight={600} fill={style.textColor} fillOpacity={style.textOpacity}>
          {ctx.fixedMark}
        </text>,
      )
    }
  })
  return out
}
