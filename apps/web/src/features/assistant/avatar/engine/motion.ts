/*
 * Intensidad de animación del avatar (AvatarSpec.motion). Diseño propio de DEKOPEN.
 * «Reducir movimiento» del sistema siempre gana sobre cualquiera de estos perfiles.
 */
import type { AvatarMotion } from '@dekopen/shared'
import { createRng, mod } from './math'

export interface MotionProfile {
  id: AvatarMotion
  /** cuánta deriva de la mirada en reposo (1 = la de bloub) */
  wander: number
  /** escala del tiempo de la vida en reposo (deriva y respiración) */
  lifeRate: number
  /** micro deriva del centro y respiración */
  float: boolean
  /** multiplica la velocidad de los anillos */
  ringSpeed: number
  /** cuántos anillos al trabajar (1 a 3) */
  rings: number
  /** amplitud de la negación con la cabeza */
  shake: number
  /** multiplica la duración de los fundidos */
  morph: number
  /** gestos espontáneos en reposo (mirar de lado, ladear la cabeza) */
  fidgets: boolean
}

export const MOTION_PROFILES: Record<AvatarMotion, MotionProfile> = {
  calm: { id: 'calm', wander: 1, lifeRate: 1, float: true, ringSpeed: 1, rings: 3, shake: 1, morph: 1, fidgets: true },
  lively: { id: 'lively', wander: 1.25, lifeRate: 1.2, float: true, ringSpeed: 1.6, rings: 3, shake: 1.15, morph: 0.85, fidgets: true },
  minimal: { id: 'minimal', wander: 0.45, lifeRate: 0.8, float: false, ringSpeed: 0.7, rings: 1, shake: 0.6, morph: 0.8, fidgets: false },
}

export function motionProfile(id: string | undefined): MotionProfile {
  return (id && (MOTION_PROFILES as Record<string, MotionProfile>)[id]) || MOTION_PROFILES.calm
}

/* ------------------------------------------------------------ gestos en reposo */

export type FidgetKind = 'curious' | 'happy' | 'glanceLeft' | 'glanceRight' | 'proud'

export interface Fidget {
  at: number
  dur: number
  kind: FidgetKind
}

/** Calendario de gestos: se repite cada 600 s, determinista (como los parpadeos). */
export const FIDGET_SPAN = 600
const FIDGET_KINDS: FidgetKind[] = ['glanceRight', 'curious', 'glanceLeft', 'happy', 'glanceRight', 'proud', 'glanceLeft', 'curious']

function buildFidgets(seed: number, every: [number, number]): Fidget[] {
  const rng = createRng(seed)
  const out: Fidget[] = []
  let t = 6 + rng() * 4
  let n = 0
  while (t < FIDGET_SPAN - 4) {
    const kind = FIDGET_KINDS[(n + Math.floor(rng() * 3)) % FIDGET_KINDS.length]
    const dur = kind.startsWith('glance') ? 1.3 + rng() * 0.6 : 1.6 + rng() * 0.6
    out.push({ at: t, dur, kind })
    t += dur + every[0] + rng() * (every[1] - every[0])
    n++
  }
  return out
}

export const FIDGETS: Record<'calm' | 'lively', Fidget[]> = {
  calm: buildFidgets(0xf1d6e7, [11, 19]),
  lively: buildFidgets(0x11fe1, [6, 11]),
}

/** Entrada 0,35 s, se sostiene y sale 0,45 s. */
const FIDGET_IN = 0.35
const FIDGET_OUT = 0.45

/** Gesto activo en `t` y su peso (0 a 1), o null. Función pura del tiempo. */
export function fidgetAt(t: number, list: Fidget[]): { kind: FidgetKind; weight: number } | null {
  const tt = mod(t, FIDGET_SPAN)
  // búsqueda binaria del último gesto que empezó
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].at <= tt) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return null
  const f = list[found]
  const u = tt - f.at
  if (u > f.dur) return null
  const k = Math.min(u / FIDGET_IN, 1, (f.dur - u) / FIDGET_OUT)
  const weight = k <= 0 ? 0 : k * k * (3 - 2 * k)
  return weight > 0 ? { kind: f.kind, weight } : null
}

/* ------------------------------------------------------------- asentir al hablar */

/** Asentimientos suaves mientras llega la respuesta: uno cada 0,9–1,4 s, período 60 s. */
export const NOD_SPAN = 60
export const NODS: number[] = (() => {
  const rng = createRng(0x90d)
  const out: number[] = []
  let t = 0.35
  while (t < NOD_SPAN - 1.5) {
    out.push(t)
    t += 0.9 + rng() * 0.5
  }
  return out
})()

/** Cabeceo (grados, negativo = baja la mirada) en `t`. */
export function nodAt(t: number, amplitude = 3): number {
  const tt = mod(t, NOD_SPAN)
  let lo = 0
  let hi = NODS.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (NODS[mid] <= tt) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return 0
  const u = (tt - NODS[found]) / 0.34
  return u >= 1 ? 0 : -amplitude * Math.sin(Math.PI * u)
}
