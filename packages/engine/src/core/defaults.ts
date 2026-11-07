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

/**
 * Lo que cabe entre el descuento de una pieza y su cara vista: el vidrio entra `glassGap` + 8 mm como
 * mínimo. Fuera de ese rango el número del perfil no es la cara vista (PRO711 «70/42» es el cuerpo hasta
 * el galce, PRO04 «90» y PRO716 «105» son el ancho del perfil) y se usa el galce típico.
 */
export const SIGHTLINE_MM = { min: 13, max: 30 } as const


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

/**
 * Holgura entre dos hojas de un plegable en su encuentro (mm). Supuesto de oficio sin ficha de
 * fabricante: cada hoja termina 2 mm antes del eje y la junta cierra el encuentro. Ajustable por
 * línea con `openingPautas.folding` (el traslapo de la hoja sigue la pauta).
 */
export const FOLD_GAP_MM = 4

/**
 * Margen de barra que exige el curvado (mm): la curvadora sujeta cada extremo ~150 mm, así que un
 * tramo curvo debe caber en `barra − 300`. Supuesto de oficio; los tramos más largos se dividen en
 * piezas iguales unidas a 90°.
 */
export const BENDING_GRIP_MM = 300

/** Alto típico del cajón de persiana por tipo (mm), de dibujo y cotización indicativa. */
export const ROLLER_SHUTTER_BOX_MM = { monoblock: 165, exterior: 180, integrated: 200 } as const
/** Ancho de las guías de persiana para el dibujo (mm). */
export const ROLLER_SHUTTER_GUIDE_MM = 45
/** Alféizar de dibujo: vuelo a cada lado y alto visto (mm). */
export const SILL_DRAWING_MM = { overhang: 25, height: 30 } as const

/**
 * Rangos indicativos de hoja terminada (nominal) por apertura, en mm, para avisar antes de
 * cotizar algo que el herraje típico no cubre. Fuente: research 25 §4.1 (L1–L17) y los rangos de
 * entrada indicativos del §4.1; NO son límites de fabricación de un proveedor: el aviso pide
 * confirmar con el sistema elegido. Las puertas balconeras y de acceso usan los rangos de puerta.
 *
 * - casement (abatir interior, L1) · casement_out (abatir exterior, L2) · awning (proyectante, L3)
 * - tilt_turn (oscilobatiente ventana, L4) · tilt_turn_door (oscilobatiente puerta, L5)
 * - door (puerta de abatir, L6) · tilt (oscilante, rango indicativo de banderola)
 * - pivot_h (pivotante horizontal PVC, L10 en galce) · pivot_v (rango indicativo de pivotante)
 * - tilt_slide (PSK 160, L12 en galce) · parallel_slide (PS, L11 máximos; mínimo como PSK)
 * - folding (hoja plegable, L16) · folding_access (hoja de paso de un plegable, L16)
 * - sliding (hoja de corredera, rango indicativo) · lift_slide (hoja elevadora, L13 máximos y L14 mínimos)
 */
export const OPENING_SIZE_LIMITS = {
  casement: { minW: 400, maxW: 1000, minH: 400, maxH: 1500 },
  casement_out: { minW: 400, maxW: 1500, minH: 400, maxH: 1500 },
  awning: { minW: 400, maxW: 1000, minH: 400, maxH: 1500 },
  tilt_turn: { minW: 500, maxW: 1000, minH: 650, maxH: 1600 },
  tilt_turn_door: { minW: 750, maxW: 1200, minH: 1200, maxH: 2500 },
  door: { minW: 600, maxW: 1200, minH: 1000, maxH: 2500 },
  tilt: { minW: 400, maxW: 1200, minH: 300, maxH: 1000 },
  pivot_h: { minW: 576, maxW: 2950, minH: 700, maxH: 2200 },
  pivot_v: { minW: 600, maxW: 1500, minH: 600, maxH: 2200 },
  tilt_slide: { minW: 670, maxW: 2000, minH: 840, maxH: 2800 },
  parallel_slide: { minW: 670, maxW: 2000, minH: 840, maxH: 2700 },
  folding: { minW: 450, maxW: 900, minH: 600, maxH: 2800 },
  folding_access: { minW: 450, maxW: 1200, minH: 600, maxH: 2800 },
  sliding: { minW: 500, maxW: 1500, minH: 500, maxH: 2400 },
  lift_slide: { minW: 720, maxW: 3000, minH: 1155, maxH: 3100 },
} as const satisfies Record<string, { minW: number; maxW: number; minH: number; maxH: number }>

export type OpeningLimitClass = keyof typeof OPENING_SIZE_LIMITS

/**
 * Ancho total máximo indicativo del conjunto (mm): plegable 6.300 (L17; L16 publica 6.000 para
 * otro sistema) y elevadora 6.500 (L20/L21).
 */
export const ELEMENT_MAX_WIDTH = { folding: 6300, lift_slide: 6500 } as const

/** Soldadura con que están medidos los descuentos de refuerzo de la pauta («corte − 114» = cota − 108). */
export const REINFORCEMENT_WELD_MM = 3

/** Paneles máximos de una corredera (2 a 6, research 25 §6.1). */
export const MAX_SLIDING_PANELS = 6
