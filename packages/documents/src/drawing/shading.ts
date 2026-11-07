/**
 * Luz del dibujo realista: una sola fuente arriba a la izquierda y por delante (en pantalla, también en
 * la vista exterior). Cada perfil se describe por su sección, una lista de franjas con su inclinación, y
 * el tono de cada franja sale de su normal: por eso un chaflán cambia de tono al doblar el inglete, como
 * en un render de verdad, sin pintar nada a mano.
 *
 * Las franjas se agrupan por intensidad en un solo `<path>`: el dibujo tiene decenas de franjas pero muy
 * pocos elementos, que es lo que cuesta en el navegador y en el PDF.
 */
import type { ReactNode } from 'react'
import type { Rect } from '@dekopen/engine'
import type { ColorAppearance } from '../textures/resolve'
import type { Pt } from './path'

/** Dirección hacia la luz en pantalla (x derecha, y abajo, z hacia quien mira), normalizada. */
const LIGHT = (() => {
  const v: [number, number, number] = [-0.5, -0.68, 0.54]
  const len = Math.hypot(...v)
  return v.map((c) => c / len) as [number, number, number]
})()

/**
 * Brillo relativo a una cara plana. `normal` es la normal del canto en mm (vista interior) y `slope` la
 * inclinación de la franja: positiva mira hacia esa normal, negativa hacia el lado contrario.
 */
export function bandLight(normal: Pt, slope: number, mirror: boolean): number {
  const nx = mirror ? -normal[0] : normal[0]
  const len = Math.hypot(slope, 1)
  const dot = (nx * slope * LIGHT[0] + normal[1] * slope * LIGHT[1] + LIGHT[2]) / len
  return dot - LIGHT[2]
}

export interface Tones {
  base: string
  /** Contorno (muy tenue: un render no tiene líneas negras). */
  outline: string
  seam: string
  /** Color de las sombras: en blancos es un gris frío, no negro. */
  shadow: string
  lit: number
  dark: number
  /** Opacidad de la soldadura de los ingletes. */
  seamOpacity: number
}

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const x = p(a)
  const y = p(b)
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')
  return `#${c(0)}${c(1)}${c(2)}`.toUpperCase()
}

export const mixHex = mix

export function tonesOf(a: ColorAppearance): Tones {
  const wood = a.finish === 'woodgrain'
  if (a.luminance > 0.6) return { base: a.hex, outline: '#AEB6B8', seam: '#9AA3A6', shadow: '#3C4A50', lit: 0.5, dark: 0.34, seamOpacity: 0.32 }
  if (a.luminance > 0.2) return { base: a.hex, outline: mix(a.dark, '#000000', 0.3), seam: mix(a.dark, '#000000', 0.25), shadow: '#14100C', lit: 0.42, dark: 0.5, seamOpacity: 0.5 }
  if (wood || a.luminance > 0.08) return { base: a.hex, outline: mix(a.dark, '#000000', 0.45), seam: mix(a.dark, '#000000', 0.3), shadow: '#0B0806', lit: 0.3, dark: 0.55, seamOpacity: 0.55 }
  return { base: a.hex, outline: mix(a.dark, '#000000', 0.4), seam: mix(a.light, '#000000', 0.1), shadow: '#050708', lit: 0.3, dark: 0.55, seamOpacity: 0.4 }
}

const q1 = (n: number) => Math.round(n * 10) / 10

/** Polígono compacto: usa H y V en los tramos rectos para ahorrar bytes en documentos de 40 ítems. */
export function polyPath(pts: readonly Pt[]): string {
  let d = ''
  let px = 0
  let py = 0
  pts.forEach((p, i) => {
    const x = q1(p[0])
    const y = q1(p[1])
    if (i === 0) d += `M${x} ${y}`
    else if (y === py && x !== px) d += `H${x}`
    else if (x === px && y !== py) d += `V${y}`
    else if (x !== px || y !== py) d += `L${x} ${y}`
    px = x
    py = y
  })
  return `${d}Z`
}

export function rectPathD(r: Rect): string {
  return `M${q1(r.x)} ${q1(r.y)}H${q1(r.x + r.w)}V${q1(r.y + r.h)}H${q1(r.x)}Z`
}

/** Agrupa polígonos por intensidad de velo. */
export class VeilBatch {
  private readonly levels = new Map<string, { fill: string; opacity: number; d: string[] }>()

  constructor(private readonly tones: Tones) {}

  /** `value` es brillo con signo; `gain` atenúa o refuerza la franja. */
  add(polygon: readonly Pt[], value: number, gain = 1): void {
    this.addPath(polyPath(polygon), value, gain)
  }

  addPath(d: string, value: number, gain = 1): void {
    const light = value >= 0
    const alpha = Math.abs(value) * (light ? this.tones.lit : this.tones.dark) * gain
    const step = Math.round(alpha / 0.02) * 0.02
    if (step < 0.02) return
    const opacity = Math.min(0.86, Math.round(step * 100) / 100)
    const fill = light ? '#FFFFFF' : this.tones.shadow
    const key = `${fill}${opacity}`
    const hit = this.levels.get(key)
    if (hit) hit.d.push(d)
    else this.levels.set(key, { fill, opacity, d: [d] })
  }

  nodes(key: string, make: (key: string, d: string, fill: string, opacity: number) => ReactNode): ReactNode[] {
    const out: ReactNode[] = []
    let i = 0
    for (const level of this.levels.values()) out.push(make(`${key}-${i++}`, level.d.join(''), level.fill, level.opacity))
    return out
  }
}
