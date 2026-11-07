/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN: catálogo propio de poses (reposo, hablar, puntos, guiño,
 * trabajando, aprobación, dormir, alerta, celebración, órbita y remolino), todas sobre la
 * forma elegida del avatar y no sobre un círculo fijo.
 */
import {
  APPROVAL_AMBER,
  BAR_CY,
  BAR_DOT,
  BAR_RADII,
  DOT_PEAK,
  DOT_R,
  DOT_X,
  ORBIT_RINGS,
  ORBIT_RING_OFFSET,
  PILL_ANGLE,
  PILL_DIST,
  PILL_MARGIN,
  PILL_POP,
  PILL_R,
  SWIRL_RINGS,
  SWIRL_RING_OFFSET,
  burstParticles,
  sleepBubbles,
  type ArcSpec,
  type DotSpec,
} from './decor'
import { EXPRESSIONS, pair } from './expressions'
import type { EyeCfg, HeadGaze } from './face'
import { TAU, clamp, easings, lerp, mod } from './math'
import { nodAt, type MotionProfile } from './motion'
import { blend, circle, type Silhouette } from './shape'

export type { DotSpec } from './decor'

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
  /** tono emocional (ojos en arco) */
  valence: number
  /** opacidad de los ojos: 0 en las poses sin cara */
  eyeAlpha: number
  /** cabeceo extra (grados) sumado después de todo: asentir */
  nod: number
  /** giro de la cabeza (grados) restado a la guiñada: vuelta de saludo */
  spin: number
  /** visibilidad de lo que pertenece a la forma: paño de ventana y accesorios */
  decor: number
  dots: DotSpec[]
  arcs: ArcSpec[]
  pill: PillSpec | null
}

export type PoseId = 'rest' | 'speak' | 'dots' | 'wink' | 'working' | 'approval' | 'sleep' | 'exclaim' | 'burst' | 'orbit' | 'swirl'

/** Lo que una pose necesita saber del avatar: su forma y su perfil de movimiento. */
export interface PoseCtx {
  /** el cuerpo con la forma elegida, a una escala dada */
  body: (scale?: number, over?: Partial<Silhouette>) => Silhouette
  motion: MotionProfile
}

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
  pose(t: number, still: boolean, ctx: PoseCtx): Pose
}

const attentive = EXPRESSIONS.attentive
const laughing = EXPRESSIONS.laughing

function base(ctx: PoseCtx, over: Partial<Pose> = {}): Pose {
  return {
    sil: ctx.body(1),
    gaze: { ...attentive.gaze },
    split: attentive.split,
    eyes: attentive.eyes,
    valence: attentive.valence,
    eyeAlpha: 1,
    nod: 0,
    spin: 0,
    decor: 1,
    dots: [],
    arcs: [],
    pill: null,
    ...over,
  }
}

/**
 * Ola de los tres puntos: período 1,2 s, desfase 0,2 s entre puntos. Cada punto sube y baja
 * dentro de la primera mitad del ciclo (bloub volvía de golpe; aquí se suaviza).
 */
export function dotPulse(t: number, index: number): number {
  const p = mod((t - index * 0.2) / 1.2, 1)
  return p < 0.5 ? 0.5 - 0.5 * Math.cos(p * 2 * TAU) : 0
}

/** Ojos cerrados (dormir): el aplastamiento del parpadeo llevado al mínimo. */
const closed = pair(0.24, 0.42, 0, 0)

export const POSES: Record<PoseId, PoseDef> = {
  rest: { id: 'rest', morph: 0.45, blinkIn: false, baseFace: true, still: 1, pose: (_t, _s, ctx) => base(ctx) },

  // hablando: la cara de reposo con asentimientos suaves e irregulares mientras llega el texto
  speak: {
    id: 'speak',
    morph: 0.3,
    blinkIn: false,
    baseFace: true,
    still: 1,
    pose: (t, still, ctx) => base(ctx, { nod: still ? 0 : nodAt(t, 3 * ctx.motion.shake) }),
  },

  // pensando: la bola SE VUELVE el punto central de «• • •»; el morph es continuo
  dots: {
    id: 'dots',
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    still: 1,
    pose: (t, still, ctx) => {
      if (still) {
        const r = DOT_R * 1.08
        return base(ctx, {
          sil: circle(r),
          eyeAlpha: 0,
          decor: 0,
          dots: [
            { x: DOT_X[0], y: 0, r, opacity: 1 },
            { x: DOT_X[2], y: 0, r, opacity: 1 },
          ],
        })
      }
      const mid = dotPulse(t, 1)
      // los puntos laterales salen de los flancos de la bola
      const emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3))
      return base(ctx, {
        sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cy: -0.06 * mid }),
        eyeAlpha: 0,
        decor: 0,
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
    pose: (_t, _s, ctx) =>
      base(ctx, {
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        valence: 1,
        eyes: [
          { w: 0.236, h: 0.464, open: 1 },
          { w: 0.447, h: 0.089, open: 1 },
        ],
      }),
  },

  // trabajando: el cuerpo se concentra (0,82), mira «el trabajo» abajo a la derecha y los
  // anillos lentos lo orbitan
  working: {
    id: 'working',
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    still: 0.9,
    pose: (t, still, ctx) =>
      base(ctx, {
        sil: ctx.body(0.82),
        // la mirada recorre el trabajo, como quien lee
        gaze: { yaw: still ? 10 : 10 + 6 * Math.sin(t * 1.3), pitch: -14, roll: -4 },
        split: 15.5,
        eyes: pair(0.18, 0.34),
        arcs: Array.from({ length: ctx.motion.rings }, (_, i) => ({
          ring: i,
          speed: ctx.motion.ringSpeed,
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
    pose: (t, still, ctx) => {
      const p = clamp(t / 0.45)
      const grow = easings.easeOutCubic(clamp(t / 0.22))
      const pop = 1 + (PILL_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35)
      const beat = 1 + 0.07 * Math.max(0, Math.sin(((t - 0.45) / 2.8) * TAU)) ** 8
      const k = still ? 1 : p < 1 ? grow * pop : beat
      const r = PILL_R * k
      const a = (PILL_ANGLE * Math.PI) / 180
      return base(ctx, {
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

  // dormido: ojos cerrados, cabeza algo gacha, respiración lenta y burbujas que suben
  sleep: {
    id: 'sleep',
    morph: 0.8,
    blinkIn: false,
    baseFace: false,
    still: 1,
    pose: (t, still, ctx) => {
      const breath = still ? 0 : Math.sin((t / 4.2) * TAU)
      return base(ctx, {
        sil: ctx.body(1, { sy: 1 + 0.022 * breath, cy: 0.02 - 0.01 * breath }),
        gaze: { yaw: 3, pitch: -10, roll: -6 },
        split: 16,
        eyes: closed,
        dots: sleepBubbles(t, still),
      })
    },
  },

  // alerta: el cuerpo se vuelve un «!» vertical (bloub) con un temblor que se apaga
  exclaim: {
    id: 'exclaim',
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    still: 0.8,
    pose: (t, still, ctx) => {
      const buzz = still ? 0 : 0.03 * Math.sin(t * TAU * 6) * Math.exp(-4 * t)
      return base(ctx, {
        sil: { radii: [...BAR_RADII], rot: 0, cx: buzz, cy: BAR_CY, sx: 1, sy: 1 },
        eyeAlpha: 0,
        decor: 0,
        dots: [{ x: BAR_DOT.x + buzz * 0.6, y: BAR_DOT.y, r: BAR_DOT.r, opacity: 1 }],
      })
    },
  },

  // celebración: un pop corto (el único rebote del cuerpo), risa y chispas que salen
  burst: {
    id: 'burst',
    morph: 0.2,
    blinkIn: false,
    baseFace: false,
    still: 0.35,
    pose: (t, still, ctx) => {
      const s = still ? 1 : 1 - 0.08 * Math.exp(-6 * t) * Math.cos(10 * t)
      return base(ctx, {
        sil: ctx.body(s),
        gaze: { ...laughing.gaze },
        split: laughing.split,
        eyes: laughing.eyes,
        valence: laughing.valence,
        dots: burstParticles(still ? 0.35 : t),
      })
    },
  },

  // órbita: seis anillos en abanico y la mirada que los sigue (tareas largas)
  orbit: {
    id: 'orbit',
    morph: 0.55,
    blinkIn: false,
    baseFace: false,
    still: 1.2,
    pose: (t, still, ctx) => {
      const tt = still ? 1.2 : t
      return base(ctx, {
        sil: ctx.body(0.86),
        gaze: { yaw: 18 * Math.sin(tt * 2.1), pitch: 6 + 8 * Math.cos(tt * 1.7), roll: -6 * Math.sin(tt * 1.3) },
        split: 15.5,
        eyes: pair(0.19, 0.38),
        arcs: ORBIT_RINGS.map((_, i) => ({
          ring: ORBIT_RING_OFFSET + i,
          speed: ctx.motion.ringSpeed,
          t: tt,
          opacity: still ? 0.85 : 0.85 * clamp((t - i * 0.1) / 0.35),
        })),
      })
    },
  },

  // remolino (saludo, cambio de asistente): tres anillos barren una vez y la cabeza da una
  // vuelta completa; lleva la cara de reposo, así el seguimiento del cursor no salta al salir
  swirl: {
    id: 'swirl',
    morph: 0.3,
    blinkIn: true,
    baseFace: true,
    still: 0.5,
    pose: (t, still, ctx) => {
      const turn = clamp((t - 0.05) / 1.1)
      return base(ctx, {
        // 360° ≡ 0°: al terminar la vuelta se vuelve a 0 exacto, sin desandar
        spin: still || turn >= 1 ? 0 : 360 * easings.easeInOutCubic(turn),
        arcs: SWIRL_RINGS.map((_, i) => ({
          ring: SWIRL_RING_OFFSET + i,
          speed: ctx.motion.ringSpeed,
          t: still ? 0.5 : t,
          opacity: still ? 0.8 : clamp((t - i * 0.06) / 0.14) * clamp((1.22 - t) / 0.34),
        })),
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
    valence: lerp(a.valence, b.valence, t),
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    nod: lerp(a.nod, b.nod, t),
    spin: lerp(a.spin, b.spin, t),
    decor: lerp(a.decor, b.decor, t),
    dots: [...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })), ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))],
    arcs: [...a.arcs.map((r) => ({ ...r, opacity: r.opacity * out })), ...b.arcs.map((r) => ({ ...r, opacity: r.opacity * t }))],
    pill: blendPill(a.pill, b.pill, t),
  }
}
