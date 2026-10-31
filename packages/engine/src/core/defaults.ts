import type { Pauta } from '../types'

/**
 * Pauta típica de PVC practicable (valores PRO6004 del taller del dueño). Se usa cuando falta
 * la línea o algún valor de su pauta, siempre acompañada de un aviso.
 */
export const DEFAULT_PAUTA: Pauta = {
  weld: 3,
  frameDeduction: 44,
  sashWidth: 80,
  sashDeduction: 60,
  sashOverlap: 8,
  glassGap: 5,
  mullionDeduction: 20,
}

/** Paño mínimo (medida a ejes) al mover un travesaño. */
export const MIN_PANE_MM = 200

/** Galce: diferencia entre la cara vista y el descuento (PRO6004: 64 − 44 = 20). */
export const REBATE_MM = 20

export const DEFAULT_BAR_LENGTH = 5800

/** Límites de vidrio (reglas de taller R04 de la versión anterior, como aviso). */
export const GLASS_LIMITS = {
  dvhMaxArea: 2.6,
  mono4MaxArea: 1.8,
  /** Lado de vidrio bajo el cual el paño se considera muy chico. */
  minSide: 150,
} as const

/** Pesos auxiliares para el peso estimado (plantilla de oficio, no ficha de fabricante). */
export const DEFAULT_WEIGHTS = {
  pvcKgM: 1.2,
  beadKgM: 0.2,
  steelKgM: 1.7,
  aluminumKgM: 0.4,
  glassKgM2PerMm: 2.5,
} as const
