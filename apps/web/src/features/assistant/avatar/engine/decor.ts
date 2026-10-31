/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen: anillos propios de Marco (lentos, en tonos del
 * cuerpo), puntos simétricos y pastilla de aprobación ámbar.
 */
import { TAU, r2 } from './math'

/* --------------------------------------------------------- arco elíptico 3D */

export interface ArcSeed {
  /** semieje mayor, en radios de la bola */
  a: number
  /** aplastamiento b/a (≤ 0,45: las órbitas se ven casi de canto) */
  k: number
  /** inclinación del eje mayor en pantalla, radianes */
  tilt: number
  /** vueltas por segundo */
  speed: number
  phase: number
  /** fracción de la vuelta que se traza */
  sweep: number
  width: number
  cx: number
  cy: number
}

/** Lo que declara una pose: la geometría queda en radios de bola; el motor la traza. */
export interface ArcSpec {
  /** índice del anillo (define su degradado) */
  ring: number
  seed: ArcSeed
  t: number
  opacity: number
}

export interface ArcRender {
  ring: number
  /** tramo delante del cuerpo */
  front: string
  /** tramo detrás del cuerpo (se pinta antes, el cuerpo lo tapa) */
  back: string
  width: number
  opacity: number
}

/**
 * Proyecta en ortográfica un círculo 3D inclinado. La componente z corta el arco en
 * dos: la mitad trasera se dibuja antes del cuerpo. Ese orden de profundidad es lo
 * que hace leer los anillos como órbitas y no como un dibujo plano.
 */
export function arcRender(seed: ArcSeed, t: number, scale: number, ring: number, opacity = 1): ArcRender {
  const spin = seed.phase + t * seed.speed * TAU
  const cu = Math.cos(seed.tilt)
  const su = Math.sin(seed.tilt)
  const kz = Math.sqrt(Math.max(0, 1 - seed.k * seed.k))
  const N = 64
  const span = seed.sweep * TAU
  let front = ''
  let back = ''
  let prev: boolean | null = null
  for (let i = 0; i <= N; i++) {
    const th = spin + (i / N) * span
    const ct = Math.cos(th)
    const st = Math.sin(th)
    const x = seed.a * (ct * cu + st * -su * seed.k) + seed.cx
    const y = seed.a * (ct * su + st * cu * seed.k) + seed.cy
    const z = seed.a * st * kz
    const behind = z < 0
    const cmd = behind !== prev ? 'M' : 'L'
    const seg = `${cmd}${r2(x * scale)} ${r2(y * scale)}`
    if (behind) back += seg
    else front += seg
    prev = behind
  }
  return { ring, front, back, width: seed.width * scale, opacity }
}

/** Degradado fijo de cada anillo, a lo largo de su eje mayor (no depende del tiempo). */
export function ringGradient(seed: ArcSeed, scale: number): { x1: number; y1: number; x2: number; y2: number } {
  const gx = Math.cos(seed.tilt) * seed.a * scale
  const gy = Math.sin(seed.tilt) * seed.a * scale
  return {
    x1: r2(seed.cx * scale - gx),
    y1: r2(seed.cy * scale - gy),
    x2: r2(seed.cx * scale + gx),
    y2: r2(seed.cy * scale + gy),
  }
}

/**
 * Tres anillos de Marco. Más pegados al cuerpo que los de bloub (el cuerpo se encoge a
 * 0,82 mientras trabaja) para caber en la caja, y unas siete veces más lentos: calma,
 * no frenesí. Valores elegidos, no medidos.
 */
export const MARCO_RINGS: readonly ArcSeed[] = [
  { a: 1.0, k: 0.32, tilt: -0.45, speed: 0.42, phase: 0.4, sweep: 0.46, width: 0.064, cx: 0, cy: 0 },
  { a: 1.05, k: 0.42, tilt: 0.2, speed: 0.34, phase: 2.6, sweep: 0.4, width: 0.058, cx: 0, cy: 0 },
  { a: 1.08, k: 0.26, tilt: 0.85, speed: 0.5, phase: 4.7, sweep: 0.5, width: 0.052, cx: 0, cy: 0 },
]

/* ----------------------------------------------------------------- 3 puntos */

/** Puntos simétricos (bloub medía −0,557 / −0,013 / +0,532); algo más grandes para leerse a 20 px. */
export const DOT_X = [-0.6, 0, 0.6] as const
export const DOT_R = 0.18
export const DOT_PEAK = 1.25

/* ---------------------------------------------------- pastilla de aprobación */

export const APPROVAL_AMBER = '#F0B429'
/** Sobre la circunferencia, arriba a la derecha. */
export const PILL_ANGLE = -42
export const PILL_DIST = 1.003
export const PILL_R = 0.16
/** El pop culmina 14 % sobre el reposo (único rebote, medido en bloub). */
export const PILL_POP = 1.14
/** La muesca es un disco concéntrico restado del cuerpo, con margen constante. */
export const PILL_MARGIN = 0.054
