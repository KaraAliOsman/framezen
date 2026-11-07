/**
 * Dónde va la cara en cada forma: escala de la esfera de los ojos y desplazamiento de su
 * centro, en radios de la bola. Tabla constante (como el calendario de parpadeos): la calcula
 * `solveFaceFit` (facefit.ts) una vez y una prueba verifica que los ojos caben en todas las
 * expresiones, estilos y derivas de la mirada. Nunca se resuelve dentro del bucle de dibujo:
 * así la cara no tiembla (lección de eyefit.ts de bloub).
 */
import type { AvatarShape } from '@dekopen/shared'

export interface FaceFit {
  /** escala de la esfera de los ojos (1 = círculo de referencia) */
  s: number
  /** desplazamiento del centro de la cara */
  ox: number
  oy: number
}

export const FACE_FITS: Record<AvatarShape, FaceFit> = {
  blob: { s: 0.94, ox: -0.06, oy: 0.06 }, // holgura 0.0021
  circle: { s: 1, ox: 0, oy: 0 }, // holgura 0.0000
  pebble: { s: 0.96, ox: -0.03, oy: 0.04 }, // holgura 0.0019
  squircle: { s: 1, ox: 0, oy: 0 }, // holgura 0.0183
  capsule: { s: 0.78, ox: 0, oy: 0.02 }, // holgura 0.0070
  egg: { s: 0.83, ox: 0, oy: 0.06 }, // holgura 0.0065
  hexagon: { s: 0.95, ox: 0, oy: 0.02 }, // holgura 0.0072
  drop: { s: 0.67, ox: 0, oy: 0.3 }, // holgura 0.0141
  cloud: { s: 0.82, ox: 0, oy: 0.12 }, // holgura 0.0007
  star: { s: 0.7, ox: 0, oy: 0.02 }, // holgura 0.0044
  triangle: { s: 0.79, ox: 0, oy: 0.12 }, // holgura 0.0047
  window: { s: 0.93, ox: 0, oy: 0.02 }, // holgura 0.0037
}
