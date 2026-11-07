/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN: ids en inglés, las 16 expresiones de bloub más «escucha»
 * y «preocupado» (propias) y una valencia por expresión para los ojos en arco.
 */
import type { EyeCfg, HeadGaze } from './face'
import { lerp } from './math'

/**
 * Expresión del rostro en reposo. Sin boca: todo sale de cuatro palancas — orientación de
 * la cabeza, separación de los ojos, sus proporciones y la inclinación propia de cada ojo
 * (inclinaciones en espejo = alegría o preocupación).
 */
export const EXPRESSION_IDS = [
  'attentive',
  'listening',
  'happy',
  'worried',
  'neutral',
  'surprised',
  'excited',
  'laughing',
  'angry',
  'sad',
  'scared',
  'suspicious',
  'confused',
  'curious',
  'proud',
  'shy',
  'bored',
  'sleepy',
] as const

export type ExpressionId = (typeof EXPRESSION_IDS)[number]

export interface Expression {
  id: ExpressionId
  gaze: HeadGaze
  /** semiseparación de los ojos sobre la esfera, en grados */
  split: number
  eyes: [EyeCfg, EyeCfg]
  /**
   * Tono emocional de −1 a 1. Solo lo usan los ojos en arco: ∩ alegre (1), arco suave (0),
   * casi rectos e inclinados si es negativo. Se interpola como cualquier otra palanca.
   */
  valence: number
}

const eye = (w: number, h: number, tilt = 0, open = 1): EyeCfg => ({ w, h, tilt, open })

/** Dos ojos iguales; si hay `tilt`, inclinados en espejo. */
export const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [eye(w, h, tilt, open), eye(w, h, -tilt, open)]

export const EXPRESSIONS: Record<ExpressionId, Expression> = {
  // reposo: casi de frente, mira a quien usa la app (el «attentif» de bloub)
  attentive: { id: 'attentive', gaze: { yaw: 4, pitch: 5, roll: -4 }, split: 16, eyes: pair(0.21, 0.44), valence: 0 },
  // escuchando: derecho y con los ojos un poco más grandes (propia)
  listening: { id: 'listening', gaze: { yaw: 0, pitch: -2, roll: 0 }, split: 16.5, eyes: pair(0.23, 0.47), valence: 0 },
  // feliz: ojos entrecerrados en arco, los altos convergen
  happy: { id: 'happy', gaze: { yaw: 5, pitch: 9, roll: 0 }, split: 17, eyes: pair(0.27, 0.17, 14), valence: 1 },
  // preocupado: los altos divergen apenas y la mirada baja (propia)
  worried: { id: 'worried', gaze: { yaw: 2, pitch: -8, roll: 0 }, split: 16, eyes: pair(0.21, 0.38, -14), valence: -1 },
  // la pose medida en el video de referencia de bloub
  neutral: { id: 'neutral', gaze: { yaw: 28.49, pitch: 28.62, roll: -13 }, split: 15.46, eyes: pair(0.186, 0.412), valence: 0 },
  surprised: { id: 'surprised', gaze: { yaw: 3, pitch: -3, roll: 0 }, split: 19, eyes: pair(0.45, 0.47), valence: 0 },
  excited: { id: 'excited', gaze: { yaw: 6, pitch: -14, roll: 0 }, split: 19.5, eyes: pair(0.4, 0.56, -10), valence: 1 },
  laughing: { id: 'laughing', gaze: { yaw: 4, pitch: 14, roll: 0 }, split: 18, eyes: pair(0.34, 0.13, 20), valence: 1 },
  // los altos convergen fuerte hacia el centro y los ojos se estrechan
  angry: { id: 'angry', gaze: { yaw: 3, pitch: 7, roll: 0 }, split: 17, eyes: pair(0.34, 0.15, 30), valence: -1 },
  // al revés: los altos divergen y la mirada cae
  sad: { id: 'sad', gaze: { yaw: 3, pitch: -13, roll: 0 }, split: 16, eyes: pair(0.22, 0.4, -28), valence: -1 },
  scared: { id: 'scared', gaze: { yaw: 2, pitch: -20, roll: 0 }, split: 20.5, eyes: pair(0.4, 0.6), valence: -1 },
  // un ojo bastante más cerrado que el otro
  suspicious: { id: 'suspicious', gaze: { yaw: 12, pitch: 6, roll: -6 }, split: 16, eyes: [eye(0.21, 0.4), eye(0.22, 0.15)], valence: 0 },
  // asimétrico en tamaño e inclinación
  confused: { id: 'confused', gaze: { yaw: -14, pitch: 3, roll: 8 }, split: 16.5, eyes: [eye(0.2, 0.44, -18), eye(0.28, 0.17, 14)], valence: 0 },
  // la cabeza se ladea: el alabeo lleva la curiosidad
  curious: { id: 'curious', gaze: { yaw: 16, pitch: -9, roll: -15 }, split: 16.5, eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)], valence: 0 },
  proud: { id: 'proud', gaze: { yaw: 5, pitch: 17, roll: 0 }, split: 17, eyes: pair(0.3, 0.15, 18), valence: 1 },
  shy: { id: 'shy', gaze: { yaw: -19, pitch: -14, roll: -7 }, split: 14, eyes: pair(0.17, 0.3), valence: 0 },
  // rendijas horizontales y la mirada se va de lado
  bored: { id: 'bored', gaze: { yaw: -22, pitch: 2, roll: 0 }, split: 16, eyes: pair(0.3, 0.12), valence: -1 },
  // párpados a media altura: pasa por `open`, el mismo aplastamiento del parpadeo
  sleepy: { id: 'sleepy', gaze: { yaw: 6, pitch: -9, roll: -3 }, split: 16, eyes: pair(0.2, 0.42, 0, 0.42), valence: 0 },
}

export function isExpressionId(value: unknown): value is ExpressionId {
  return typeof value === 'string' && (EXPRESSION_IDS as readonly string[]).includes(value)
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
    valence: lerp(a.valence, b.valence, t),
  }
}
