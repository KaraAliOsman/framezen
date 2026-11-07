/*
 * Pintado imperativo de un frame sobre nodos SVG fijos (pool). Adaptado de la plantilla de
 * BloubBot.vue de bloub (MIT, ver THIRD_PARTY_NOTICES.md): en React no se hace setState por
 * frame, se escriben atributos directamente.
 */
import { HALF_VIEWBOX, type AvatarFrame, type BodyTransform, type FaceAnchor } from './engine/engine'
import { r2 } from './engine/math'

/** Chispas de celebración + burbujas de sueño + puntos de «pensando». */
export const DOT_POOL = 8
/** 6 anillos del estado actual + 6 del que se va durante un fundido. */
export const ARC_POOL = 12
/** Piezas de accesorio (el audífono usa 3). */
export const PART_POOL = 3
/** Grosor mínimo visible de un anillo, en píxeles de pantalla. */
const MIN_STROKE_PX = 1.25
/** Bajo este tamaño tres anillos se vuelven un garabato: queda uno solo. */
const SMALL_SIZE = 32

export interface AvatarNodes {
  body: SVGPathElement
  clip: SVGPathElement
  bodyGroup: SVGGElement
  notch: SVGCircleElement
  locals: SVGGElement[]
  eyes: SVGPathElement[]
  face: SVGGElement | null
  rims: (SVGCircleElement | null)[]
  faceLines: SVGPathElement | null
  visor: SVGPathElement | null
  dots: SVGCircleElement[]
  pill: SVGCircleElement
  parts: (SVGGElement | null)[]
  arcsBack: SVGPathElement[]
  arcsFront: SVGPathElement[]
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export function collectNodes(svg: SVGSVGElement): AvatarNodes | null {
  const q = <T extends Element>(name: string) => svg.querySelector<T>(`[data-av="${name}"]`)
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
    locals: Array.from(svg.querySelectorAll<SVGGElement>('[data-av="local"]')),
    eyes: eyes as SVGPathElement[],
    face: q<SVGGElement>('face'),
    rims: range(2).map((i) => q<SVGCircleElement>(`rim-${i}`)),
    faceLines: q<SVGPathElement>('face-lines'),
    visor: q<SVGPathElement>('visor'),
    dots: dots as SVGCircleElement[],
    parts: range(PART_POOL).map((i) => q<SVGGElement>(`part-${i}`)),
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

function transformOf(t: BodyTransform): string {
  return `translate(${t.x} ${t.y}) rotate(${t.rot}) scale(${t.sx} ${t.sy})`
}

/** Punto local (lx, ly) del ojo `e` en coordenadas de pantalla. */
function onEye(e: FaceAnchor, lx: number, ly: number): [number, number] {
  return [e.x + e.a * lx + e.c * ly, e.y + e.b * lx + e.d * ly]
}

const P = (x: number, y: number) => `${r2(x)} ${r2(y)}`

/** Puente entre los aros y patillas hacia los costados (las corta el recorte del cuerpo). */
function glassesLines(f: NonNullable<AvatarFrame['face']>): string {
  const [l, r] = f.eyes
  const rim = f.rim
  const [ax, ay] = onEye(l, rim, 0)
  const [bx, by] = onEye(r, -rim, 0)
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2 - rim * 0.28
  const [lx, ly] = onEye(l, -rim, 0)
  const [rx, ry] = onEye(r, rim, 0)
  return `M${P(ax, ay)}Q${P(mx, my)} ${P(bx, by)}M${P(lx, ly)}L${P(lx - HALF_VIEWBOX, ly - 4)}M${P(rx, ry)}L${P(rx + HALF_VIEWBOX, ry - 4)}`
}

/** Visera de seguridad: una banda que abraza los dos ojos, más la correa. */
function visorPath(f: NonNullable<AvatarFrame['face']>): { band: string; strap: string } {
  const [l, r] = f.eyes
  const dx = r.x - l.x
  const dy = r.y - l.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const h = f.rim * 1.02
  const ext = f.rim * 1.2
  const x0 = l.x - ux * ext
  const y0 = l.y - uy * ext
  const x1 = r.x + ux * ext
  const y1 = r.y + uy * ext
  const band =
    `M${P(x0 + nx * h * 0.55, y0 + ny * h * 0.55)}` +
    `L${P(x0 - nx * h, y0 - ny * h)}` +
    `L${P(x1 - nx * h, y1 - ny * h)}` +
    `L${P(x1 + nx * h * 0.55, y1 + ny * h * 0.55)}` +
    `Q${P((x0 + x1) / 2 + nx * h * 1.25, (y0 + y1) / 2 + ny * h * 1.25)} ${P(x0 + nx * h * 0.55, y0 + ny * h * 0.55)}Z`
  const strap = `M${P(x0, y0 - h * 0.2)}L${P(x0 - HALF_VIEWBOX, y0 - h * 0.25)}M${P(x1, y1 - h * 0.2)}L${P(x1 + HALF_VIEWBOX, y1 - h * 0.25)}`
  return { band, strap }
}

export function paintFrame(nodes: AvatarNodes, frame: AvatarFrame, uid: string, size: number): void {
  set(nodes.body, 'd', frame.body)
  set(nodes.clip, 'd', frame.body)

  // alféizar de la ventana: sigue al cuerpo
  const localTransform = transformOf(frame.local)
  for (const g of nodes.locals) {
    const visible = frame.sillOpacity > 0.01
    show(g, visible)
    if (visible) {
      set(g, 'transform', localTransform)
      set(g, 'opacity', String(frame.sillOpacity))
    }
  }

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

  // lentes: aros que siguen a los ojos sobre la esfera
  if (nodes.face) {
    const f = frame.face
    if (f) {
      set(nodes.face, 'opacity', String(f.opacity))
      show(nodes.face, true)
      for (let i = 0; i < nodes.rims.length; i++) {
        const e = f.eyes[i]
        const rim = nodes.rims[i]
        if (!rim) continue
        set(rim, 'r', String(f.rim))
        set(rim, 'transform', `matrix(${e.a},${e.b},${e.c},${e.d},${e.x},${e.y})`)
        set(rim, 'opacity', String(e.alpha))
      }
      if (nodes.faceLines) set(nodes.faceLines, 'd', nodes.visor ? visorPath(f).strap : glassesLines(f))
      if (nodes.visor) set(nodes.visor, 'd', visorPath(f).band)
    } else {
      show(nodes.face, false)
    }
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
    const fill = dot.tone === 'accent' ? 'var(--av-accent)' : 'var(--av-fill)'
    if (node.style.fill !== fill) node.style.fill = fill
    show(node, true)
  }

  for (let i = 0; i < nodes.parts.length; i++) {
    const node = nodes.parts[i]
    const part = frame.parts[i]
    if (!node) continue
    if (!part || part.opacity <= 0.01) {
      show(node, false)
      continue
    }
    set(node, 'transform', transformOf(part))
    set(node, 'opacity', String(part.opacity))
    show(node, true)
  }

  const floor = (MIN_STROKE_PX * 2 * HALF_VIEWBOX) / Math.max(size, 1)
  const visible = size < SMALL_SIZE ? frame.arcs.filter((a) => a.ring % 3 === 0) : frame.arcs
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
