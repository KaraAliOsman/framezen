/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN: anillos propios (lentos, en tonos del cuerpo y del acento
 * de la paleta), órbita y remolino con semillas propias, puntos simétricos, pastilla de
 * aprobación ámbar, «!» vertical y partículas de celebración que salen (no que entran).
 */
import { TAU, clamp, createRng, easings, r2 } from './math'
import { hullOfCircles, profileFromPolygon } from './shape'

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
  /** índice global del anillo en `RINGS` (define su degradado) */
  ring: number
  /** multiplica la velocidad (perfil de movimiento) */
  speed?: number
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
 * Proyecta en ortográfica un círculo 3D inclinado. La componente z corta el arco en dos: la
 * mitad trasera se dibuja antes del cuerpo. Ese orden de profundidad es lo que hace leer los
 * anillos como órbitas y no como un dibujo plano.
 */
export function arcRender(seed: ArcSeed, t: number, scale: number, ring: number, opacity = 1, speed = 1): ArcRender {
  const spin = seed.phase + t * seed.speed * speed * TAU
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
 * Tres anillos de trabajo. Más pegados al cuerpo que los de bloub (el cuerpo se encoge a 0,82
 * mientras trabaja) para caber en la caja, y unas siete veces más lentos: calma, no frenesí.
 */
export const MARCO_RINGS: readonly ArcSeed[] = [
  { a: 1.0, k: 0.32, tilt: -0.45, speed: 0.42, phase: 0.4, sweep: 0.46, width: 0.064, cx: 0, cy: 0 },
  { a: 1.05, k: 0.42, tilt: 0.2, speed: 0.34, phase: 2.6, sweep: 0.4, width: 0.058, cx: 0, cy: 0 },
  { a: 1.08, k: 0.26, tilt: 0.85, speed: 0.5, phase: 4.7, sweep: 0.5, width: 0.052, cx: 0, cy: 0 },
]

/**
 * Órbita: seis anillos repartidos en abanico (la idea de `orbit` de bloub) pero contenidos
 * (a ≤ 1,18 para no salirse de la caja) y a un tercio de su velocidad.
 */
const ORBIT_RNG = createRng(0xa11ce)
export const ORBIT_RINGS: readonly ArcSeed[] = Array.from({ length: 6 }, (_, i) => ({
  a: 1.1 + ORBIT_RNG() * 0.08,
  k: 0.08 + ORBIT_RNG() * 0.34,
  tilt: (i / 6) * Math.PI + ORBIT_RNG() * 0.5,
  speed: 0.9 + ORBIT_RNG() * 0.3,
  phase: ORBIT_RNG() * TAU,
  sweep: 0.55 + ORBIT_RNG() * 0.2,
  width: 0.046 + ORBIT_RNG() * 0.01,
  cx: 0,
  cy: 0.02,
}))

/** Remolino de saludo: tres anillos que barren una vez y se van. */
export const SWIRL_RINGS: readonly ArcSeed[] = [
  { a: 1.06, k: 0.22, tilt: -0.3, speed: 1.05, phase: 1.2, sweep: 0.62, width: 0.058, cx: 0, cy: 0 },
  { a: 1.12, k: 0.36, tilt: 0.55, speed: 0.95, phase: 3.4, sweep: 0.55, width: 0.052, cx: 0, cy: 0 },
  { a: 1.0, k: 0.3, tilt: 1.4, speed: 1.15, phase: 5.1, sweep: 0.5, width: 0.048, cx: 0, cy: 0 },
]

/** Todos los anillos con índice global: cada uno tiene su degradado en el SVG. */
export const RINGS: readonly ArcSeed[] = [...MARCO_RINGS, ...ORBIT_RINGS, ...SWIRL_RINGS]
export const ORBIT_RING_OFFSET = MARCO_RINGS.length
export const SWIRL_RING_OFFSET = MARCO_RINGS.length + ORBIT_RINGS.length

/**
 * Tono de cada anillo: `body` = color del cuerpo aclarado, `accent` = acento de la paleta.
 * Paradas a lo largo del eje mayor (% del color mezclado con blanco): los extremos quedan
 * fuera del cuerpo y van plenos; el centro cruza por delante y va claro.
 */
export const RING_TONES: readonly { tone: 'body' | 'accent'; stops: readonly [number, number, number] }[] = RINGS.map((_, i) =>
  i % 3 === 1 ? { tone: 'accent', stops: [100, 70, 95] } : { tone: 'body', stops: i % 3 === 0 ? [100, 40, 90] : [100, 50, 80] },
)

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

/* ------------------------------------------------------------- «!» vertical */

/**
 * Barra del «!» vertical de bloub: envolvente de dos círculos, cónica (arriba 0,132, abajo
 * 0,075). El punto va debajo. Medidas de bloub.
 */
export const BAR_CY = -0.1875
export const BAR_RADII = profileFromPolygon(hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075), 0, BAR_CY)
export const BAR_DOT = { x: -0.012, y: 0.526, r: 0.113 } as const

/* ------------------------------------------------------- celebración */

export interface DotSpec {
  x: number
  y: number
  r: number
  opacity: number
  /** color: el del cuerpo (por defecto) o el acento de la paleta */
  tone?: 'body' | 'accent'
}

const BURST_COUNT = 8

/**
 * Chispas que salen del cuerpo en abanico, se frenan y se apagan: alegría breve. Ocho, con
 * colores alternados de cuerpo y acento, y una pizca de desorden determinista.
 */
export function burstParticles(t: number): DotSpec[] {
  const out: DotSpec[] = []
  const rng = createRng(0xb0057)
  for (let i = 0; i < BURST_COUNT; i++) {
    const angle = ((-90 + i * (360 / BURST_COUNT) + 14 + rng() * 10) * Math.PI) / 180
    const delay = rng() * 0.08
    const u = clamp((t - delay) / 0.75)
    if (u <= 0 || u >= 1) continue
    const d = 0.98 + 0.5 * easings.easeOutCubic(u)
    out.push({
      x: Math.cos(angle) * d,
      y: Math.sin(angle) * d,
      r: (0.085 - 0.04 * u) * (i % 2 ? 0.85 : 1),
      opacity: clamp(u / 0.08) * clamp((1 - u) / 0.35),
      tone: i % 2 ? 'body' : 'accent',
    })
  }
  return out
}

/** Burbujas de sueño: suben en diagonal desde la coronilla, crecen y se desvanecen. */
export function sleepBubbles(t: number, still: boolean): DotSpec[] {
  if (still) {
    return [
      { x: 0.62, y: -0.86, r: 0.055, opacity: 0.55 },
      { x: 0.8, y: -1.04, r: 0.075, opacity: 0.4 },
    ]
  }
  const out: DotSpec[] = []
  const period = 2.8
  for (let i = 0; i < 3; i++) {
    const u = (((t - i * (period / 3)) % period) + period) % period / period
    out.push({
      x: 0.52 + u * 0.42,
      y: -0.72 - u * 0.5,
      r: 0.04 + u * 0.05,
      opacity: clamp(u / 0.15) * clamp((1 - u) / 0.4) * 0.6,
    })
  }
  return out
}
