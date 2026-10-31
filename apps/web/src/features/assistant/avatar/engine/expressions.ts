/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen: solo las expresiones de Marco, más «escucha» y
 * «preocupado», propias.
 */
import type { EyeCfg, HeadGaze } from './face'
import { lerp } from './math'

/**
 * Expresión del rostro en reposo. Sin boca: todo sale de cuatro palancas — orientación
 * de la cabeza, separación de los ojos, sus proporciones y la inclinación propia de
 * cada ojo (inclinaciones en espejo = alegría o preocupación).
 */
export type ExpressionId = 'attentive' | 'listening' | 'happy' | 'worried'

export interface Expression {
  id: ExpressionId
  gaze: HeadGaze
  /** semiseparación de los ojos sobre la esfera, en grados */
  split: number
  eyes: [EyeCfg, EyeCfg]
}

const eye = (w: number, h: number, tilt = 0, open = 1): EyeCfg => ({ w, h, tilt, open })

/** Dos ojos iguales; si hay `tilt`, inclinados en espejo. */
export const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [
  eye(w, h, tilt, open),
  eye(w, h, -tilt, open),
]

export const EXPRESSIONS: Record<ExpressionId, Expression> = {
  // reposo de Marco: casi de frente, mira al usuario (el «attentif» de bloub)
  attentive: { id: 'attentive', gaze: { yaw: 4, pitch: 5, roll: -4 }, split: 16, eyes: pair(0.21, 0.44) },
  // escuchando: derecho y con los ojos un poco más grandes
  listening: { id: 'listening', gaze: { yaw: 0, pitch: -2, roll: 0 }, split: 16.5, eyes: pair(0.23, 0.47) },
  // feliz: ojos entrecerrados en arco, los altos convergen
  happy: { id: 'happy', gaze: { yaw: 5, pitch: 9, roll: 0 }, split: 17, eyes: pair(0.27, 0.17, 14) },
  // preocupado: los altos divergen apenas y la mirada baja
  worried: { id: 'worried', gaze: { yaw: 2, pitch: -8, roll: 0 }, split: 16, eyes: pair(0.21, 0.38, -14) },
}

const lerpEye = (a: EyeCfg, b: EyeCfg, t: number): EyeCfg => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
  open: lerp(a.open, b.open, t),
})

/** Interpola dos expresiones: el cambio de cara se desliza, no salta. */
export function blendExpression(a: Expression, b: Expression, t: number): Expression {
  return {
    id: b.id,
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
  }
}
