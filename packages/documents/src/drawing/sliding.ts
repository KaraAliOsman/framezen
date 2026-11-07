/**
 * Cómo se encuentran las hojas de una corredera (puro, mm, vista interior).
 *
 * El motor reparte las hojas con la cuenta de la pauta: toda hoja se monta `sashWidth` sobre su vecina.
 * Eso es físico solo si van en planos distintos (traslapo). Dos hojas del mismo riel no pueden ocupar el
 * mismo lugar: se encuentran a tope en la mitad del cruce, cada una con su medio montante. Aquí se decide
 * qué ve quien mira, sin tocar las medidas del despiece: las hojas siguen midiendo lo que dice la pauta.
 */
import type { Layout, LayoutSlidingPanel, Rect } from '@dekopen/engine'

/** Holgura visible entre dos hojas a tope (mm). */
export const BUTT_GAP_MM = 3

export interface SlidingMeeting {
  a: LayoutSlidingPanel
  b: LayoutSlidingPanel
  /** `lap`: planos distintos, se traslapan. `butt`: mismo plano, a tope. */
  kind: 'lap' | 'butt'
  /** Eje del encuentro: `x` en correderas, `y` en guillotinas. */
  axis: 'x' | 'y'
  /** Línea del encuentro: mitad del cruce (`butt`) o canto de la hoja de adelante (`lap`). */
  at: number
  /** Tramo común sobre el otro eje. */
  from: number
  to: number
  /** Hoja de adelante en vista interior (null a tope). */
  front: LayoutSlidingPanel | null
}

/**
 * Plano de una hoja, de exterior a interior. Una móvil y una fija en el mismo riel (monorriel) no van en
 * el mismo plano: el fijo queda atrás y la hoja corre por delante de él.
 */
export function slidingPlane(panel: LayoutSlidingPanel): number {
  return panel.rail * 2 + (panel.kind === 'moving' ? 1 : 0)
}

const byIndex = (layout: Layout) => [...layout.sliding].sort((a, b) => a.index - b.index)

const axisOf = (layout: Layout): 'x' | 'y' => (layout.slidingSystem === 'vertical' ? 'y' : 'x')

const cache = new WeakMap<Layout, SlidingMeeting[]>()

/** Encuentros entre hojas vecinas, en orden. Memorizado por `Layout`. */
export function slidingMeetings(layout: Layout): SlidingMeeting[] {
  const hit = cache.get(layout)
  if (hit) return hit
  const axis = axisOf(layout)
  const panels = byIndex(layout)
  const out: SlidingMeeting[] = []
  for (let i = 1; i < panels.length; i++) {
    const a = panels[i - 1]
    const b = panels[i]
    const start = axis === 'x' ? b.rect.x : b.rect.y
    const end = axis === 'x' ? a.rect.x + a.rect.w : a.rect.y + a.rect.h
    if (end - start < 1) continue
    const from = axis === 'x' ? Math.max(a.rect.y, b.rect.y) : Math.max(a.rect.x, b.rect.x)
    const to = axis === 'x' ? Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) : Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w)
    if (slidingPlane(a) === slidingPlane(b)) {
      out.push({ a, b, kind: 'butt', axis, at: (start + end) / 2, from, to, front: null })
    } else {
      const front = slidingPlane(b) > slidingPlane(a) ? b : a
      out.push({ a, b, kind: 'lap', axis, at: front === b ? start : end, from, to, front })
    }
  }
  cache.set(layout, out)
  return out
}

/** Lo que ocupa una hoja a la vista: su rectángulo, recortado en los encuentros a tope. */
export function slidingVisibleRect(layout: Layout, panel: LayoutSlidingPanel): Rect {
  let { x, y, w, h } = panel.rect
  for (const m of slidingMeetings(layout)) {
    if (m.kind !== 'butt') continue
    const edge = BUTT_GAP_MM / 2
    if (m.a.panelId === panel.panelId) {
      if (m.axis === 'x') w = m.at - edge - x
      else h = m.at - edge - y
    } else if (m.b.panelId === panel.panelId) {
      if (m.axis === 'x') {
        w = x + w - (m.at + edge)
        x = m.at + edge
      } else {
        h = y + h - (m.at + edge)
        y = m.at + edge
      }
    }
  }
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) }
}

export type PullSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Dónde va el tirador de una hoja móvil. Es el canto opuesto al sentido en que abre: el que queda libre
 * al correrla. Si ese canto queda detrás de la vecina, no se alcanza: va al canto que sí está a la vista
 * (hojas intermedias de una telescópica). En guillotina va en el travesaño que se toma para mover la hoja.
 */
export function slidingPullSide(layout: Layout, panel: LayoutSlidingPanel): PullSide | null {
  if (panel.kind !== 'moving') return null
  if (axisOf(layout) === 'y') return panel.direction === 'down' ? 'top' : 'bottom'
  const opens = panel.direction ?? (panel.index === 0 ? 'right' : 'left')
  const wanted: PullSide = opens === 'right' ? 'left' : 'right'
  const other: PullSide = wanted === 'left' ? 'right' : 'left'
  const covered = (side: PullSide): boolean =>
    slidingMeetings(layout).some((m) => {
      if (m.kind !== 'lap' || !m.front || m.front.panelId === panel.panelId) return false
      return side === 'left' ? m.b.panelId === panel.panelId : m.a.panelId === panel.panelId
    })
  if (!covered(wanted)) return wanted
  return covered(other) ? null : other
}
