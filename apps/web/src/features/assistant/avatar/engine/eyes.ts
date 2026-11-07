/*
 * Estilos de ojo de DEKOPEN. Diseño propio sobre el modelo de ojos en esfera de bloub
 * (MIT, ver THIRD_PARTY_NOTICES.md).
 *
 * Las expresiones están escritas para la cápsula de bloub (0,21 × 0,44 en reposo). Un estilo
 * no reescribe las 18 expresiones: traduce cada ojo a su propio lenguaje conservando lo que
 * la expresión significa.
 * - Un ojo ABIERTO (alto ≥ ancho) conserva su tamaño relativo y solo la mitad de su cambio de
 *   proporción: «sorprendido» agranda un ojo redondo en vez de aplanarlo.
 * - Una RENDIJA (alto < ancho: feliz, enojado, aburrido) sigue siendo rendija en cualquier
 *   estilo, con el ancho del estilo.
 * Entre ambos casos se mezcla con una rampa suave, así interpolar dos expresiones nunca salta.
 */
import type { AvatarEyes } from '@dekopen/shared'
import type { EyeCfg } from './face'
import { clamp, lerp } from './math'
import { capsulePath, crescentPath, ellipsePath } from './shape'

export type EyeKind = 'capsule' | 'ellipse' | 'arc'

export interface EyeStyleDef {
  id: AvatarEyes
  kind: EyeKind
  /** ancho y alto en reposo, en radios de la bola */
  w: number
  h: number
  /** ancho relativo de las rendijas respecto de la cápsula */
  slit: number
  /** grosor de la banda (solo arco) */
  thickness: number
}

/** Ojo de referencia: la cápsula «attentive». */
export const REST_EYE_W = 0.21
export const REST_EYE_H = 0.44
const REST_AREA = REST_EYE_W * REST_EYE_H
const REST_ASPECT = REST_EYE_H / REST_EYE_W

export const EYE_STYLES: Record<AvatarEyes, EyeStyleDef> = {
  capsule: { id: 'capsule', kind: 'capsule', w: REST_EYE_W, h: REST_EYE_H, slit: 1, thickness: 0 },
  round: { id: 'round', kind: 'ellipse', w: 0.28, h: 0.28, slit: 1.15, thickness: 0 },
  oval: { id: 'oval', kind: 'ellipse', w: 0.235, h: 0.335, slit: 1.05, thickness: 0 },
  dot: { id: 'dot', kind: 'ellipse', w: 0.16, h: 0.16, slit: 0.8, thickness: 0 },
  arc: { id: 'arc', kind: 'arc', w: 0.3, h: 0.15, slit: 1.05, thickness: 0.085 },
  wide: { id: 'wide', kind: 'capsule', w: 0.37, h: 0.2, slit: 1.25, thickness: 0 },
}

/** Geometría final de un ojo (en radios de la bola, antes de la escala de cara). */
export interface StyledEye {
  kind: EyeKind
  w: number
  h: number
  tilt: number
  open: number
  /** curvatura del arco: 1 ∩, 0 recto, −1 ∪ */
  curve: number
  thickness: number
}

const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Traduce un ojo de expresión (escrito para la cápsula) al estilo elegido. */
export function styleEye(style: EyeStyleDef, cfg: EyeCfg, valence = 0): StyledEye {
  const tilt = cfg.tilt ?? 0
  if (style.id === 'capsule') {
    // una rendija inclinada se lee como enojo: la alegría va en arco ∩, como los ojos en arco
    const smiling = valence > 0.5 && cfg.h < cfg.w * 0.8
    if (smiling) return { kind: 'arc', w: cfg.w * 1.1, h: 0.17, tilt: 0, open: cfg.open, curve: 1, thickness: 0.13 }
    return { kind: 'capsule', w: cfg.w, h: cfg.h, tilt, open: cfg.open, curve: 0, thickness: 0 }
  }
  const aspect = cfg.h / Math.max(cfg.w, 1e-4)
  // 0 = rendija pura, 1 = ojo abierto
  const openness = smooth(0.8, 1.25, aspect)
  const f = Math.sqrt((cfg.w * cfg.h) / REST_AREA)

  if (style.kind === 'arc') {
    const width = lerp(cfg.w * style.slit, style.w * f ** 0.8, openness)
    const rise = style.h * clamp((cfg.h / REST_EYE_H) ** 0.35, 0.7, 1.35)
    const curve = valence >= 0 ? 0.72 + 0.28 * valence : 0.72 + 0.85 * valence
    const thickness = style.thickness * clamp(f ** 0.5, 0.8, 1.3)
    return { kind: 'arc', w: width, h: lerp(rise * 0.85, rise, openness), tilt, open: cfg.open, curve: lerp(1, curve, openness), thickness }
  }

  const r = clamp((aspect / REST_ASPECT) ** 0.5, 0.75, 1.25)
  let ow = (style.w * f) / Math.sqrt(r)
  let oh = style.h * f * Math.sqrt(r)
  // en un ojo casi redondo la inclinación no se vería: se alarga un poco para que se lea
  if (style.kind === 'ellipse' && Math.abs(tilt) > 4) {
    const k = 1 + 0.22 * clamp(Math.abs(tilt) / 28)
    ow /= k
    oh *= k
  }
  const sw = cfg.w * style.slit
  const sh = cfg.h * (style.id === 'dot' ? 0.85 : 1)
  return {
    kind: style.kind,
    w: lerp(sw, ow, openness),
    h: lerp(sh, oh, openness),
    tilt,
    open: cfg.open,
    curve: 0,
    thickness: 0,
  }
}

/** Interpola dos ojos ya estilizados (cambio de estilo en el diseñador). */
export function blendStyled(a: StyledEye, b: StyledEye, t: number): StyledEye {
  return {
    kind: t < 0.5 ? a.kind : b.kind,
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    tilt: lerp(a.tilt, b.tilt, t),
    open: lerp(a.open, b.open, t),
    curve: lerp(a.kind === 'arc' ? a.curve : 1, b.kind === 'arc' ? b.curve : 1, t),
    thickness: lerp(a.thickness || b.thickness, b.thickness || a.thickness, t),
  }
}

/** Path del ojo en unidades de viewBox (`scale` = radio de la bola × escala de cara). */
export function eyeShapePath(eye: StyledEye, scale: number): string {
  const w = eye.w * scale
  const h = eye.h * scale
  if (eye.kind === 'ellipse') return ellipsePath(w, h)
  if (eye.kind === 'arc') return crescentPath(w, h, Math.max(eye.thickness * scale, 0.6), eye.curve)
  return capsulePath(w, h)
}
