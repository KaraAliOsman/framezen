/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen: catálogo reescrito con las poses de Marco
 * (reposo, puntos, guiño, trabajando, aprobación).
 */
import {
  APPROVAL_AMBER,
  DOT_PEAK,
  DOT_R,
  DOT_X,
  MARCO_RINGS,
  PILL_ANGLE,
  PILL_DIST,
  PILL_MARGIN,
  PILL_POP,
  PILL_R,
  type ArcSpec,
} from './decor'
import { EXPRESSIONS, pair } from './expressions'
import type { EyeCfg, HeadGaze } from './face'
import { TAU, clamp, easings, lerp, mod } from './math'
import { blend, circle, type Silhouette } from './shape'

export interface DotSpec {
  x: number
  y: number
  r: number
  opacity: number
}

export interface PillSpec {
  x: number
  y: number
  r: number
  /** radio de la muesca restada del cuerpo */
  notch: number
  color: string
}

export interface Pose {
  /** silueta del cuerpo, en radios de la bola */
  sil: Silhouette
  gaze: HeadGaze
  split: number
  eyes: [EyeCfg, EyeCfg]
  /** opacidad de los ojos: 0 en las poses sin cara */
  eyeAlpha: number
  dots: DotSpec[]
  arcs: ArcSpec[]
  pill: PillSpec | null
}

export type PoseId = 'rest' | 'dots' | 'wink' | 'working' | 'approval'

export interface PoseDef {
  id: PoseId
  /** duración del fundido de entrada */
  morph: number
  /** true = la entrada se esconde tras un parpadeo (como en el original) */
  blinkIn: boolean
  /** true = lleva la expresión de reposo (y por eso puede seguir una mirada externa) */
  baseFace: boolean
  /** instante local más legible: se usa con movimiento reducido y en miniaturas */
  still: number
  /** `still` = true pide la versión quieta (sin pulsos ni giros) */
  pose(t: number, still: boolean): Pose
}

const attentive = EXPRESSIONS.attentive

function base(over: Partial<Pose> = {}): Pose {
  return {
    sil: circle(1),
    gaze: { ...attentive.gaze },
    split: attentive.split,
    eyes: attentive.eyes,
    eyeAlpha: 1,
    dots: [],
    arcs: [],
    pill: null,
    ...over,
  }
}

/**
 * Ola de los tres puntos: período 1,2 s, desfase 0,2 s entre puntos. Cada punto sube y
 * baja dentro de la primera mitad del ciclo (bloub volvía de golpe; aquí se suaviza).
 */
export function dotPulse(t: number, index: number): number {
  const p = mod((t - index * 0.2) / 1.2, 1)
  return p < 0.5 ? 0.5 - 0.5 * Math.cos(p * 2 * TAU) : 0
}

export const POSES: Record<PoseId, PoseDef> = {
  rest: {
    id: 'rest',
    morph: 0.45,
    blinkIn: false,
    baseFace: true,
    still: 1,
    pose: () => base(),
  },

  // pensando: la bola SE VUELVE el punto central de «• • •»; el morph es continuo
  dots: {
    id: 'dots',
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    still: 1,
    pose: (t, still) => {
      if (still) {
        const r = DOT_R * 1.08
        return base({
          sil: circle(r),
          eyeAlpha: 0,
          dots: [
            { x: DOT_X[0], y: 0, r, opacity: 1 },
            { x: DOT_X[2], y: 0, r, opacity: 1 },
          ],
        })
      }
      const mid = dotPulse(t, 1)
      // los puntos laterales salen de los flancos de la bola
      const emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3))
      return base({
        sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cy: -0.06 * mid }),
        eyeAlpha: 0,
        dots: [0, 2].map((i) => {
          const k = dotPulse(t, i)
          return { x: DOT_X[i] * emerge, y: -0.06 * k, r: DOT_R * (1 + (DOT_PEAK - 1) * k), opacity: 1 }
        }),
      })
    },
  },

  // guiño medido en bloub: el ojo cerrado es un guion MÁS ANCHO que el abierto
  wink: {
    id: 'wink',
    morph: 0.3,
    blinkIn: true,
    baseFace: false,
    still: 0.8,
    pose: () =>
      base({
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        eyes: [
          { w: 0.236, h: 0.464, open: 1 },
          { w: 0.447, h: 0.089, open: 1 },
        ],
      }),
  },

  // trabajando: la bola se concentra (0,82), mira «el trabajo» abajo a la derecha y
  // tres anillos lentos la orbitan
  working: {
    id: 'working',
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    still: 0.9,
    pose: (t, still) =>
      base({
        sil: circle(0.82),
        // la mirada recorre el trabajo, como quien lee
        gaze: { yaw: still ? 10 : 10 + 6 * Math.sin(t * 1.3), pitch: -14, roll: -4 },
        split: 15.5,
        eyes: pair(0.18, 0.34),
        arcs: MARCO_RINGS.map((seed, i) => ({
          ring: i,
          seed,
          t: still ? 0.9 : t,
          // entran escalonados
          opacity: still ? 0.9 : 0.9 * clamp((t - i * 0.12) / 0.3),
        })),
      }),
  },

  // necesita aprobación: pastilla ámbar con pop medido + latido suave cada 2,8 s
  approval: {
    id: 'approval',
    morph: 0.5,
    blinkIn: true,
    baseFace: false,
    still: 1,
    pose: (t, still) => {
      const p = clamp(t / 0.45)
      const grow = easings.easeOutCubic(clamp(t / 0.22))
      const pop = 1 + (PILL_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35)
      const beat = 1 + 0.07 * Math.max(0, Math.sin(((t - 0.45) / 2.8) * TAU)) ** 8
      const k = still ? 1 : p < 1 ? grow * pop : beat
      const r = PILL_R * k
      const a = (PILL_ANGLE * Math.PI) / 180
      return base({
        gaze: { yaw: -6, pitch: 3, roll: -5 },
        split: 17,
        eyes: pair(0.24, 0.46),
        pill: {
          x: Math.cos(a) * PILL_DIST,
          y: Math.sin(a) * PILL_DIST,
          r,
          notch: r + PILL_MARGIN * clamp(k),
          color: APPROVAL_AMBER,
        },
      })
    },
  },
}

const lerpEye = (a: EyeCfg, b: EyeCfg, t: number): EyeCfg => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
})

function blendPill(a: PillSpec | null, b: PillSpec | null, t: number): PillSpec | null {
  if (a && b) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      r: lerp(a.r, b.r, t),
      notch: lerp(a.notch, b.notch, t),
      color: t < 0.5 ? a.color : b.color,
    }
  }
  // la pastilla que aparece o se va lo hace encogiendo, no de golpe
  if (a) return { ...a, r: a.r * (1 - t), notch: a.notch * (1 - t) }
  if (b) return { ...b, r: b.r * t, notch: b.notch * t }
  return null
}

/** Interpola dos poses. La decoración se cruza en opacidad, no en geometría. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t
  return {
    sil: blend(a.sil, b.sil, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    dots: [...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })), ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))],
    arcs: [...a.arcs.map((r) => ({ ...r, opacity: r.opacity * out })), ...b.arcs.map((r) => ({ ...r, opacity: r.opacity * t }))],
    pill: blendPill(a.pill, b.pill, t),
  }
}
