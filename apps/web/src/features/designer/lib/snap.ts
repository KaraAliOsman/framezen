/**
 * Imán de travesaños: mientras arrastras, la medida del paño se ajusta a múltiplos de 50 mm
 * si estás a ±12 px de uno; si no, a 10 mm. La mitad exacta del tramo tiene prioridad (repartir
 * en partes iguales es lo más común). Con Alt se desactiva (1 mm).
 */
export const SNAP_PX = 12
export const SNAP_COARSE_MM = 50
export const SNAP_FINE_MM = 10

export type SnapKind = 'center' | 'coarse' | 'fine' | 'free' | 'limit'

export interface SnapInput {
  /** Eje propuesto (mm desde el origen del marco, vista interior). */
  raw: number
  /** Inicio del tramo: eje anterior o borde del marco (mm). */
  segStart: number
  /** Fin del tramo: eje siguiente o borde del marco (mm). */
  segEnd: number
  /** Límites del eje (paño mínimo), de `layout.mullions[i].min/max`. */
  min: number
  max: number
  /** px por mm en pantalla (para la tolerancia de 12 px). */
  pxPerMm: number
  /** Sin imán (Alt). */
  free?: boolean
}

export interface SnapResult {
  axis: number
  kind: SnapKind
  /** Medida del paño anterior al travesaño (mm). */
  before: number
  /** Medida del paño siguiente (mm). */
  after: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function snapMullion({ raw, segStart, segEnd, min, max, pxPerMm, free }: SnapInput): SnapResult {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const tolerance = SNAP_PX / Math.max(pxPerMm, 1e-6)
  let axis: number
  let kind: SnapKind
  const size = raw - segStart
  const center = (segStart + segEnd) / 2
  if (free) {
    axis = Math.round(raw)
    kind = 'free'
  } else if (Math.abs(raw - center) <= tolerance) {
    axis = round1(center)
    kind = 'center'
  } else {
    const coarse = Math.round(size / SNAP_COARSE_MM) * SNAP_COARSE_MM
    if (Math.abs(size - coarse) <= tolerance) {
      axis = segStart + coarse
      kind = 'coarse'
    } else {
      axis = segStart + Math.round(size / SNAP_FINE_MM) * SNAP_FINE_MM
      kind = 'fine'
    }
  }
  if (axis < lo) {
    axis = lo
    kind = 'limit'
  } else if (axis > hi) {
    axis = hi
    kind = 'limit'
  }
  axis = round1(axis)
  return { axis, kind, before: round1(axis - segStart), after: round1(segEnd - axis) }
}

/** Paso de teclado para un travesaño enfocado: 10 mm, 50 mm con Shift, 1 mm con Alt. */
export function keyboardStep(event: { shiftKey: boolean; altKey: boolean }): number {
  if (event.altKey) return 1
  return event.shiftKey ? SNAP_COARSE_MM : SNAP_FINE_MM
}
