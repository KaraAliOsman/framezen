/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN: sin giro hacia un panel (TURN = 0), objetivos
 * explícitos (input, tarjeta) y negación suave con la cabeza.
 */
import { TAU, clamp } from './math'

/**
 * Hacia dónde mira Marco cuando algo externo lo guía (cursor, input, tarjeta).
 * `yaw`/`pitch` son ABSOLUTOS y reemplazan los de la pose según `mix`; la mezcla la
 * hace el motor porque solo él conoce la pose en cada instante. `wander` = cuánta
 * deriva automática queda. `spin` = giro (grados) que se resta a la guiñada en camino:
 * los ojos viven en una esfera, así que un giro se lee como mover la cabeza.
 */
export interface Look {
  yaw: number
  pitch: number
  mix: number
  spin: number
  wander: number
}

export const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 }

/** Seguimiento del cursor: máximos del original (elegidos en bloub, no medidos). */
export const YAW_MAX = 16
export const PITCH_MAX = 13
/** Altura de la mirada con el cursor al centro: algo sobre el ecuador = atento. */
export const PITCH = 10

/** Objetivos explícitos (input, tarjeta): algo más decididos que el cursor. */
export const TARGET_YAW_MAX = 20
export const TARGET_PITCH_MAX = 18
export const TARGET_PITCH = 4

/** Rampa de enganche al empezar a seguir algo, para que los ojos no salten. */
export const ENGAGE_TIME = 0.5
/** Al soltar, la cara vuelve a su pose con calma. */
export const RELEASE_MORPH = 0.6

export type AimKind = 'pointer' | 'target'

export interface Aim {
  /** desvío horizontal del objetivo respecto del centro de Marco, −1 a 1 */
  nx: number
  /** desvío vertical, −1 a 1, en el sentido de la pantalla (abajo positivo) */
  ny: number
  kind: AimKind
}

/**
 * Normaliza un objetivo por media ventana: la mirada satura cuando el objetivo llega al
 * borde de la pantalla, sea cual sea el tamaño del avatar. Devuelve null si no hay con
 * qué medir (una caja de tamaño 0 daría 0/0 = NaN).
 */
export function normalizeAim(
  target: { x: number; y: number },
  center: { x: number; y: number },
  viewport: { width: number; height: number },
): { nx: number; ny: number } | null {
  const hw = viewport.width / 2
  const hh = viewport.height / 2
  if (!(hw > 0) || !(hh > 0)) return null
  const nx = clamp((target.x - center.x) / hw, -1, 1)
  const ny = clamp((target.y - center.y) / hh, -1, 1)
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
  return { nx, ny }
}

/** Mirada hacia un objetivo. `engage` (0 a 1) sube el control externo de a poco. */
export function aimLook(aim: Aim, engage = 1): Look {
  const target = aim.kind === 'target'
  return {
    yaw: aim.nx * (target ? TARGET_YAW_MAX : YAW_MAX),
    pitch: (target ? TARGET_PITCH : PITCH) - aim.ny * (target ? TARGET_PITCH_MAX : PITCH_MAX),
    mix: clamp(engage),
    spin: 0,
    // con el cursor la deriva se apaga (si no, parece que lo busca sin encontrarlo);
    // mirando un input conserva un poco de vida
    wander: target ? 0.35 : 0,
  }
}

/** Duración de la negación suave con la cabeza (estado de error). */
export const SHAKE_TIME = 1.1

/**
 * «No, no»: oscilación amortiguada de la guiñada. Termina en mix 0 y spin ≈ 0, así que
 * no queda nada que soltar.
 */
export function shakeLook(t: number): Look {
  const spin = t < SHAKE_TIME ? 14 * Math.sin(t * TAU * 2.6) * Math.exp(-3.2 * t) : 0
  return { yaw: 0, pitch: 0, mix: 0, spin, wander: 1 }
}
