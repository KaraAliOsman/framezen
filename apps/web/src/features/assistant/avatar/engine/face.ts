/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN.
 */
import { clamp, createRng, loopNoise, mod } from './math'

/**
 * Los ojos están pintados sobre una esfera, no apoyados en plano: cada ojo toma el
 * marco tangente de la esfera proyectado en ortográfica. La compresión del ojo más
 * cercano al borde y su inclinación salen solas, y eso da volumen sin sombras.
 */

type Vec3 = [number, number, number]

export interface HeadGaze {
  /** guiñada en grados; positivo = mira a la derecha */
  yaw: number
  /** cabeceo en grados; positivo = mira hacia arriba */
  pitch: number
  /** alabeo en grados; inclina la cabeza */
  roll: number
}

export interface EyeCfg {
  /** ancho local (eje corto de la cápsula), en radios de la bola */
  w: number
  /** alto local (eje largo) */
  h: number
  /** 1 = abierto, 0 = cerrado */
  open: number
  /** inclinación propia en grados; positivo = la parte alta va a la derecha */
  tilt?: number
}

export interface EyePose {
  x: number
  y: number
  /** matriz tangente 2×2 en el sentido de SVG matrix(a,b,c,d,e,f) */
  a: number
  b: number
  c: number
  d: number
  /** componente z de la normal: > 0 = cara visible */
  depth: number
}

/**
 * Pose de referencia medida en bloub. Marco NO la usa (mira al usuario); se conserva
 * solo para las pruebas de regresión del port.
 */
export const REFERENCE_SPLIT = 15.46
export const REFERENCE_EYE_W = 0.186
export const REFERENCE_EYE_H = 0.412
export const REFERENCE_GAZE: HeadGaze = { yaw: 28.49, pitch: 28.62, roll: -13 }

const deg = (d: number) => (d * Math.PI) / 180

/** Gira dos vectores de una base ortonormal dentro de su plano común. */
function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
  ]
}

/**
 * Marco de la cabeza y luego de los dos ojos.
 * Pantalla: x a la derecha, y hacia abajo, z hacia quien mira.
 * Índice 0 = ojo izquierdo, índice 1 = ojo derecho.
 */
export function eyePoses(gaze: HeadGaze, scale: number, split: number): [EyePose, EyePose] {
  let f: Vec3 = [0, 0, 1]
  let right: Vec3 = [1, 0, 0]
  let down: Vec3 = [0, 1, 0]
  ;[f, right] = spin(f, right, deg(gaze.yaw))
  ;[down, f] = spin(down, f, deg(gaze.pitch))
  ;[right, down] = spin(right, down, deg(gaze.roll))

  const build = (side: number): EyePose => {
    const [ef, er] = spin(f, right, deg(split * side))
    return { x: ef[0] * scale, y: ef[1] * scale, a: er[0], b: er[1], c: down[0], d: down[1], depth: ef[2] }
  }
  return [build(-1), build(1)]
}

/* ------------------------------------------------------------ parpadeo */

/** El calendario cubre 900 s y se repite; así Marco nunca deja de parpadear. */
export const BLINK_SPAN = 900
/** Duración medida de un parpadeo: cierre rápido (45 %) y apertura algo más lenta. */
export const BLINK_DUR = 0.18

function buildSchedule(): { full: number[]; minimal: number[] } {
  const rng = createRng(0x5eed)
  const full: number[] = []
  const minimal: number[] = []
  let t = 1.4
  let n = 0
  while (t < BLINK_SPAN) {
    full.push(t)
    // con movimiento reducido: uno de cada tres, sin dobles
    if (n++ % 3 === 0) minimal.push(t)
    t += 1.9 + rng() * 2.7
    if (rng() < 0.18) {
      full.push(t)
      t += 0.24
    }
  }
  return { full, minimal }
}

/** Calendario pre-sorteado: determinista y sin estado. */
export const BLINKS = buildSchedule()

export type BlinkMode = 'full' | 'minimal' | 'off'

/** Apertura del párpado (1 abierto, 0 cerrado) en el instante `t`. */
export function blinkLid(t: number, mode: BlinkMode = 'full'): number {
  if (mode === 'off') return 1
  const list = mode === 'full' ? BLINKS.full : BLINKS.minimal
  const tt = mod(t, BLINK_SPAN)
  // búsqueda binaria del último inicio <= tt
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid] <= tt) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return 1
  const k = (tt - list[found]) / BLINK_DUR
  if (k > 1) return 1
  return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55
}

/**
 * El parpadeo es un aplastamiento VERTICAL en pantalla alrededor del centro del ojo
 * (el ancho del bbox se conserva), no a lo largo del eje inclinado de la cápsula.
 */
export function blinkScale(lid: number): number {
  return 0.06 + 0.94 * clamp(lid)
}

/* ----------------------------------------------------------- vida en reposo */

export interface Liveliness {
  dYaw: number
  dPitch: number
  dRoll: number
  lid: number
  driftX: number
  driftY: number
  breath: number
}

export interface LivelinessOptions {
  /** cuánta deriva automática de la mirada queda (0 a 1) */
  wander?: number
  blink?: BlinkMode
  /** micro deriva del centro y respiración de la altura */
  float?: boolean
}

/**
 * Desvíos que se suman a la pose. Función pura del tiempo; períodos primos entre sí
 * para que la deriva nunca se repita a la vista. La bola no flota: la vida está en la
 * mirada y el parpadeo.
 */
export function liveliness(t: number, opt: LivelinessOptions = {}): Liveliness {
  const { wander = 1, blink = 'full', float = true } = opt
  return {
    dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
    dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
    dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
    lid: blinkLid(t, blink),
    driftX: float ? loopNoise(t, 7.9, 1.9) * 0.006 : 0,
    driftY: float ? loopNoise(t, 5.3, 0.3) * 0.007 : 0,
    breath: float ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1,
  }
}
