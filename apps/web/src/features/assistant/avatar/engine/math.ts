/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen.
 */

export const TAU = Math.PI * 2

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export type Easing = (t: number) => number

/**
 * Las transiciones son ease-out exponenciales, sin rebote del cuerpo. Los únicos
 * rebotes son locales (el pop de la pastilla) y viven en la pose que los usa.
 */
export const easings = {
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutQuint: (t: number) => 1 - (1 - t) ** 5,
} satisfies Record<string, Easing>

/** Ruido 1D periódico: cierra sin costura en `period`. Mueve la deriva de la mirada. */
export function loopNoise(t: number, period: number, seed = 0): number {
  const p = (t / period) * TAU
  return (
    0.55 * Math.sin(p + seed) +
    0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) +
    0.15 * Math.sin(3 * p + seed * 2.3 + 2.4)
  )
}

/** PRNG determinista (mulberry32): la misma secuencia en cada lectura. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Redondeo a 2 decimales: acorta a la mitad los paths generados a 60 fps. */
export const r2 = (v: number): number => Math.round(v * 100) / 100

/** Módulo siempre positivo. */
export const mod = (v: number, m: number): number => ((v % m) + m) % m
