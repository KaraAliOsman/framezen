/**
 * Cotas editables: de una cota del dibujo (LayoutDimension) a la operación del motor.
 *   total ancho/alto       → setSize
 *   parcial { nodeId, i }  → setNodeSize
 *   flecha del arco / alturas del trapecio (informativas en el motor) → setShape
 */
import { setNodeSize, setShape, setSize, type Layout, type LayoutDimension, type Rect, type WindowDesign } from '@framezen/engine'
import { placeDimensions, visibleDimensions, type Viewport } from '@framezen/documents'
import { formatNumber } from '../../../lib/format'

export type DimensionTarget =
  | { kind: 'width' }
  | { kind: 'height' }
  | { kind: 'partial'; nodeId: string; index: number }
  | { kind: 'arch-rise' }
  | { kind: 'trapezoid'; side: 'leftHeight' | 'rightHeight' }

const near = (a: number, b: number) => Math.abs(a - b) < 0.6

/** ¿Qué modifica esta cota? null = informativa (no editable). */
export function dimensionTarget(design: WindowDesign, dim: LayoutDimension): DimensionTarget | null {
  const t = dim.target
  if (t && 'kind' in t) return { kind: t.kind }
  if (t && 'nodeId' in t) return { kind: 'partial', nodeId: t.nodeId, index: t.index }
  const shape = design.shape
  if (dim.axis === 'y' && shape?.kind === 'arch' && near(dim.from, 0) && near(dim.value, Math.min(shape.rise, design.height))) {
    return { kind: 'arch-rise' }
  }
  if (dim.axis === 'y' && shape?.kind === 'trapezoid' && near(dim.to, design.height)) {
    if (near(dim.value, shape.leftHeight)) return { kind: 'trapezoid', side: 'leftHeight' }
    if (near(dim.value, shape.rightHeight)) return { kind: 'trapezoid', side: 'rightHeight' }
  }
  return null
}

export function isEditableDimension(design: WindowDesign, dim: LayoutDimension): boolean {
  return dimensionTarget(design, dim) !== null
}

export interface DimensionChange {
  design: WindowDesign
  /** Texto para el historial («Cambiar ancho»). */
  label: string
}

const fmt = (mm: number) => `${formatNumber(mm, 1)} mm`

/**
 * Aplica `value` (mm) a la cota. Devuelve null si no corresponde o si no cambia nada
 * (el motor devuelve la misma referencia cuando la operación no aplica).
 */
export function applyDimension(design: WindowDesign, dim: LayoutDimension, value: number): DimensionChange | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const target = dimensionTarget(design, dim)
  if (!target) return null
  let next: WindowDesign
  let label: string
  switch (target.kind) {
    case 'width':
      next = setSize(design, { width: value })
      label = `Ancho ${fmt(next.width)}`
      break
    case 'height':
      next = setSize(design, { height: value })
      label = `Alto ${fmt(next.height)}`
      break
    case 'partial':
      next = setNodeSize(design, target.nodeId, target.index, value)
      label = 'Medida del paño'
      break
    case 'arch-rise': {
      const rise = Math.min(value, design.height)
      next = setShape(design, { kind: 'arch', rise })
      label = `Flecha del arco ${fmt(rise)}`
      break
    }
    case 'trapezoid': {
      const shape = design.shape
      if (shape?.kind !== 'trapezoid') return null
      next = setShape(design, { ...shape, [target.side]: Math.min(value, design.height) })
      label = target.side === 'leftHeight' ? 'Altura izquierda' : 'Altura derecha'
      break
    }
  }
  if (next === design) return null
  return { design: next, label }
}

/** Ancho y alto juntos desde una cota total («1500x1200» escrito en el ancho). */
export function applySizePair(design: WindowDesign, size: { width: number; height: number }): DimensionChange | null {
  const next = setSize(design, size)
  if (next === design) return null
  return { design: next, label: `Medidas ${fmt(next.width)} × ${fmt(next.height)}` }
}

export function isTotalDimension(dim: LayoutDimension): boolean {
  return dim.level === 0
}

const sameDim = (a: LayoutDimension, b: LayoutDimension) =>
  a.axis === b.axis && a.level === b.level && near(a.from, b.from) && near(a.to, b.to)

/**
 * Dónde dibuja WindowDrawing el texto de una cota (px del escenario). Replica sus fórmulas
 * para abrir el editor exactamente sobre la cifra.
 */
export function dimensionAnchor(layout: Layout, vp: Viewport, dim: LayoutDimension): { x: number; y: number; vertical: boolean } | null {
  const dims = visibleDimensions(layout, 'all')
  const placed = placeDimensions(dims, dim.axis).placed.find((p) => sameDim(p.dim, dim))
  if (!placed) return null
  const row = placed.row
  if (dim.axis === 'x') {
    const a = vp.ox + (vp.mirror ? layout.width - dim.from : dim.from) * vp.scale
    const b = vp.ox + (vp.mirror ? layout.width - dim.to : dim.to) * vp.scale
    const bottom = vp.oy + layout.height * vp.scale
    const y = bottom + 6 + row * vp.rowGap + vp.rowGap - 3
    return { x: (a + b) / 2, y: y - 3 - vp.font * 0.35, vertical: false }
  }
  const y1 = vp.oy + dim.from * vp.scale
  const y2 = vp.oy + dim.to * vp.scale
  const x = vp.ox - 6 - row * vp.rowGap - vp.rowGap + 3
  return { x: x - 3 - vp.font * 0.35, y: (y1 + y2) / 2, vertical: true }
}

/** Rectángulo (px del escenario) de la cifra de una cota, para resaltarla mientras se edita. */
export function dimensionTextBox(layout: Layout, vp: Viewport, dim: LayoutDimension): Rect | null {
  const anchor = dimensionAnchor(layout, vp, dim)
  if (!anchor) return null
  const text = formatNumber(dim.value, 1)
  const tw = text.length * vp.font * 0.55 + 8
  const th = vp.font + 6
  return anchor.vertical
    ? { x: anchor.x - th / 2, y: anchor.y - tw / 2, w: th, h: tw }
    : { x: anchor.x - tw / 2, y: anchor.y - th / 2, w: tw, h: th }
}
