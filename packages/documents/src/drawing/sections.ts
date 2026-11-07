/**
 * Secciones de los perfiles vistas de frente: de qué franjas se compone cada pieza, desde su canto
 * exterior hacia adentro. Son valores típicos de un perfil de PVC de sistema (no planos de un proveedor):
 * cara plana ancha, canto redondeado corto, chaflán hacia el rebaje.
 *
 * El nivel de detalle decide cuántas franjas se dibujan: lo que a esa escala mide menos de medio píxel
 * no aporta, y sacarlo mantiene el SVG liviano.
 */
import type { Rect } from '@dekopen/engine'
import type { Pt } from './path'
import { bandLight, type VeilBatch } from './shading'

/** 0 miniatura · 1 pequeño · 2 medio · 3 grande. */
export type DetailLevel = 0 | 1 | 2 | 3

export interface Band {
  /** Ancho en mm. */
  w: number
  /** Inclinación: positiva mira hacia afuera del anillo, negativa hacia el vidrio. */
  slope: number
  /** Oscurecimiento por oclusión (fondo de un rebaje), independiente de la luz. */
  ao?: number
}

export interface Section {
  outer: Band[]
  inner: Band[]
  /** Inclinación leve de la cara principal. */
  face?: number
}

type SectionSet = Record<1 | 2 | 3, Section>

const FRAME: SectionSet = {
  1: { outer: [{ w: 4, slope: 0.6 }], inner: [{ w: 4, slope: -0.6 }] },
  2: { outer: [{ w: 1.6, slope: 1.2 }, { w: 3.4, slope: 0.4 }], inner: [{ w: 3, slope: -0.3 }, { w: 2, slope: -0.8 }] },
  3: {
    outer: [{ w: 0.7, slope: 1.8 }, { w: 1.3, slope: 0.85 }, { w: 2.8, slope: 0.3 }],
    inner: [{ w: 2.6, slope: -0.24 }, { w: 1.6, slope: -0.72 }, { w: 0.8, slope: -1.4 }],
  },
}

const SASH: SectionSet = {
  1: { outer: [{ w: 4, slope: 0.7 }], inner: [{ w: 4, slope: -0.7 }] },
  2: { outer: [{ w: 1.6, slope: 1.3 }, { w: 3.6, slope: 0.42 }], inner: [{ w: 3.4, slope: -0.32 }, { w: 2.2, slope: -0.9 }] },
  3: {
    outer: [{ w: 0.6, slope: 2 }, { w: 1.3, slope: 0.95 }, { w: 3, slope: 0.34 }],
    inner: [{ w: 3.2, slope: -0.26 }, { w: 2, slope: -0.8 }, { w: 0.9, slope: -1.6 }],
  },
}

const BEAD: SectionSet = {
  1: { outer: [], inner: [{ w: 8, slope: -0.5 }] },
  2: { outer: [{ w: 1.6, slope: 1 }], inner: [{ w: 8, slope: -0.32 }, { w: 4, slope: -0.85 }] },
  3: {
    outer: [{ w: 0.7, slope: 1.5 }, { w: 1.2, slope: 0.5 }],
    inner: [{ w: 8.5, slope: -0.24 }, { w: 3.4, slope: -0.62 }, { w: 1.5, slope: -1.3, ao: 0.12 }],
  },
}

const PANEL_MOULD: SectionSet = {
  1: { outer: [{ w: 8, slope: -0.8 }], inner: [{ w: 8, slope: 0.8 }] },
  2: { outer: [{ w: 9, slope: -0.8 }], inner: [{ w: 9, slope: 0.7 }] },
  3: { outer: [{ w: 3, slope: -1.2 }, { w: 9, slope: -0.55 }], inner: [{ w: 9, slope: 0.5 }, { w: 3, slope: 1.1 }] },
}

export const SECTIONS = { frame: FRAME, sash: SASH, bead: BEAD, panelMould: PANEL_MOULD } as const

export type SectionName = keyof typeof SECTIONS

/** Lado de un anillo rectangular con su normal. */
const SIDES: { side: 'top' | 'right' | 'bottom' | 'left'; normal: Pt }[] = [
  { side: 'top', normal: [0, -1] },
  { side: 'right', normal: [1, 0] },
  { side: 'bottom', normal: [0, 1] },
  { side: 'left', normal: [-1, 0] },
]

/** Rect interior a una distancia `d` de cada lado (acotado para que no se invierta). */
function inset(r: Rect, d: { t: number; r: number; b: number; l: number }): Rect {
  return { x: r.x + d.l, y: r.y + d.t, w: Math.max(0, r.w - d.l - d.r), h: Math.max(0, r.h - d.t - d.b) }
}

/** Trapecio de un lado entre dos rects anidados (inglete en las esquinas). */
function sideQuad(side: 'top' | 'right' | 'bottom' | 'left', a: Rect, b: Rect): Pt[] {
  const ax1 = a.x + a.w
  const ay1 = a.y + a.h
  const bx1 = b.x + b.w
  const by1 = b.y + b.h
  if (side === 'top') return [[a.x, a.y], [ax1, a.y], [bx1, b.y], [b.x, b.y]]
  if (side === 'right') return [[ax1, a.y], [ax1, ay1], [bx1, by1], [bx1, b.y]]
  if (side === 'bottom') return [[ax1, ay1], [a.x, ay1], [b.x, by1], [bx1, by1]]
  return [[a.x, ay1], [a.x, a.y], [b.x, b.y], [b.x, by1]]
}

export interface ShadeRingOptions {
  /** Lados que no se sombrean (el inferior de un marco con umbral). */
  skip?: readonly ('top' | 'right' | 'bottom' | 'left')[]
  gain?: number
}

/** Agrega al lote las franjas de un anillo rectangular según su sección. */
export function shadeRing(batch: VeilBatch, outer: Rect, inner: Rect, section: Section, mirror: boolean, opts: ShadeRingOptions = {}): void {
  const faces = { t: inner.y - outer.y, l: inner.x - outer.x, r: outer.x + outer.w - (inner.x + inner.w), b: outer.y + outer.h - (inner.y + inner.h) }
  const min = Math.min(faces.t, faces.l, faces.r, faces.b)
  if (min <= 0.5) return
  const total = [...section.outer, ...section.inner].reduce((s, b) => s + b.w, 0)
  const k = total > min * 0.9 ? (min * 0.9) / total : 1
  const gain = opts.gain ?? 1
  const skip = opts.skip ?? []

  let d = 0
  for (const band of section.outer) {
    const w = band.w * k
    const a = inset(outer, { t: d, r: d, b: d, l: d })
    const b = inset(outer, { t: d + w, r: d + w, b: d + w, l: d + w })
    for (const { side, normal } of SIDES) {
      if (skip.includes(side)) continue
      const quad = sideQuad(side, a, b)
      batch.add(quad, bandLight(normal, band.slope, mirror), gain)
      if (band.ao) batch.add(quad, -band.ao * 2, gain)
    }
    d += w
  }

  // Las franjas interiores se miden desde el borde de adentro.
  let e = section.inner.reduce((s, b) => s + b.w * k, 0)
  for (const band of section.inner) {
    const w = band.w * k
    const a = inset(inner, { t: -e, r: -e, b: -e, l: -e })
    const b = inset(inner, { t: -(e - w), r: -(e - w), b: -(e - w), l: -(e - w) })
    for (const { side, normal } of SIDES) {
      if (skip.includes(side)) continue
      const quad = sideQuad(side, a, b)
      batch.add(quad, bandLight(normal, band.slope, mirror), gain)
      if (band.ao) batch.add(quad, -band.ao * 2, gain)
    }
    e -= w
  }

  // Cara principal: casi plana, cada lado con un matiz distinto.
  if (section.face) {
    const dO = section.outer.reduce((s, b) => s + b.w * k, 0)
    const dI = section.inner.reduce((s, b) => s + b.w * k, 0)
    const a = inset(outer, { t: dO, r: dO, b: dO, l: dO })
    const b = inset(inner, { t: -dI, r: -dI, b: -dI, l: -dI })
    for (const { side, normal } of SIDES) {
      if (skip.includes(side)) continue
      batch.add(sideQuad(side, a, b), bandLight(normal, section.face, mirror), gain)
    }
  }
}

/** Franjas a lo largo de un tramo recto (travesaños, inversores, piezas con forma). */
export function shadeEdge(batch: VeilBatch, a: Pt, b: Pt, inward: Pt, normal: Pt, bands: readonly Band[], mirror: boolean, gain = 1): void {
  let d = 0
  for (const band of bands) {
    const q: Pt[] = [
      [a[0] + inward[0] * d, a[1] + inward[1] * d],
      [b[0] + inward[0] * d, b[1] + inward[1] * d],
      [b[0] + inward[0] * (d + band.w), b[1] + inward[1] * (d + band.w)],
      [a[0] + inward[0] * (d + band.w), a[1] + inward[1] * (d + band.w)],
    ]
    batch.add(q, bandLight(normal, band.slope, mirror), gain)
    if (band.ao) batch.add(q, -band.ao * 2, gain)
    d += band.w
  }
}
