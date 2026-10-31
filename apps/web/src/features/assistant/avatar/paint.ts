/*
 * Pintado imperativo de un frame de Marco sobre nodos SVG fijos (pool). Adaptado de la
 * plantilla de BloubBot.vue de bloub (MIT, ver THIRD_PARTY_NOTICES.md): en React no se
 * hace setState por frame, se escriben atributos directamente.
 */
import { HALF_VIEWBOX, type MarcoFrame } from './engine/engine'

export const DOT_POOL = 4
/** 3 anillos del estado actual + 3 del que se va durante un fundido. */
export const ARC_POOL = 6
/** Grosor mínimo visible de un anillo, en píxeles de pantalla. */
const MIN_STROKE_PX = 1.25
/** Bajo este tamaño tres anillos se vuelven un garabato: queda uno solo. */
const SMALL_SIZE = 32

export interface MarcoNodes {
  body: SVGPathElement
  clip: SVGPathElement
  bodyGroup: SVGGElement
  notch: SVGCircleElement
  eyes: SVGPathElement[]
  dots: SVGCircleElement[]
  pill: SVGCircleElement
  arcsBack: SVGPathElement[]
  arcsFront: SVGPathElement[]
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export function collectNodes(svg: SVGSVGElement): MarcoNodes | null {
  const q = <T extends Element>(name: string) => svg.querySelector<T>(`[data-marco="${name}"]`)
  const body = q<SVGPathElement>('body')
  const clip = q<SVGPathElement>('clip')
  const bodyGroup = q<SVGGElement>('body-group')
  const notch = q<SVGCircleElement>('notch')
  const pill = q<SVGCircleElement>('pill')
  const eyes = range(2).map((i) => q<SVGPathElement>(`eye-${i}`))
  const dots = range(DOT_POOL).map((i) => q<SVGCircleElement>(`dot-${i}`))
  const arcsBack = range(ARC_POOL).map((i) => q<SVGPathElement>(`arc-back-${i}`))
  const arcsFront = range(ARC_POOL).map((i) => q<SVGPathElement>(`arc-front-${i}`))
  if (!body || !clip || !bodyGroup || !notch || !pill) return null
  if (eyes.some((n) => !n) || dots.some((n) => !n) || arcsBack.some((n) => !n) || arcsFront.some((n) => !n)) return null
  return {
    body,
    clip,
    bodyGroup,
    notch,
    pill,
    eyes: eyes as SVGPathElement[],
    dots: dots as SVGCircleElement[],
    arcsBack: arcsBack as SVGPathElement[],
    arcsFront: arcsFront as SVGPathElement[],
  }
}

/** Escribe solo si cambió: leer un atributo no fuerza layout y ahorra trabajo al navegador. */
function set(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

function show(el: Element, visible: boolean): void {
  set(el, 'display', visible ? 'inline' : 'none')
}

export function paintFrame(nodes: MarcoNodes, frame: MarcoFrame, uid: string, size: number): void {
  set(nodes.body, 'd', frame.body)
  set(nodes.clip, 'd', frame.body)

  for (let i = 0; i < nodes.eyes.length; i++) {
    const node = nodes.eyes[i]
    const eye = frame.eyes[i]
    if (!eye || eye.alpha <= 0.01) {
      show(node, false)
      continue
    }
    set(node, 'd', eye.d)
    set(node, 'transform', eye.transform)
    set(node, 'opacity', String(eye.alpha))
    show(node, true)
  }

  // la muesca solo existe con pastilla; sin ella no se paga el costo de la máscara
  if (frame.notch) {
    set(nodes.notch, 'cx', String(frame.notch.x))
    set(nodes.notch, 'cy', String(frame.notch.y))
    set(nodes.notch, 'r', String(frame.notch.r))
    set(nodes.bodyGroup, 'mask', `url(#${uid}-notch)`)
  } else if (nodes.bodyGroup.hasAttribute('mask')) {
    nodes.bodyGroup.removeAttribute('mask')
  }

  if (frame.pill) {
    set(nodes.pill, 'cx', String(frame.pill.x))
    set(nodes.pill, 'cy', String(frame.pill.y))
    set(nodes.pill, 'r', String(frame.pill.r))
    set(nodes.pill, 'fill', frame.pill.color)
    show(nodes.pill, true)
  } else {
    show(nodes.pill, false)
  }

  // si un fundido encadenado trae más de los que caben, ganan los más nuevos (al final)
  const dots = frame.dots.length > DOT_POOL ? frame.dots.slice(-DOT_POOL) : frame.dots
  for (let i = 0; i < DOT_POOL; i++) {
    const node = nodes.dots[i]
    const dot = dots[i]
    if (!dot) {
      show(node, false)
      continue
    }
    set(node, 'cx', String(dot.x))
    set(node, 'cy', String(dot.y))
    set(node, 'r', String(dot.r))
    set(node, 'opacity', String(dot.opacity))
    show(node, true)
  }

  const floor = (MIN_STROKE_PX * 2 * HALF_VIEWBOX) / Math.max(size, 1)
  const visible = size < SMALL_SIZE ? frame.arcs.filter((a) => a.ring === 0) : frame.arcs
  const arcs = visible.length > ARC_POOL ? visible.slice(-ARC_POOL) : visible
  for (let i = 0; i < ARC_POOL; i++) {
    const back = nodes.arcsBack[i]
    const front = nodes.arcsFront[i]
    const arc = arcs[i]
    if (!arc) {
      show(back, false)
      show(front, false)
      continue
    }
    const stroke = `url(#${uid}-ring-${arc.ring})`
    const width = String(Math.round(Math.max(arc.width, floor) * 100) / 100)
    const opacity = String(arc.opacity)
    for (const [node, d] of [
      [back, arc.back],
      [front, arc.front],
    ] as const) {
      if (!d) {
        show(node, false)
        continue
      }
      set(node, 'd', d)
      set(node, 'stroke', stroke)
      set(node, 'stroke-width', width)
      set(node, 'opacity', opacity)
      show(node, true)
    }
  }
}
