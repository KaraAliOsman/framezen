/**
 * Utilidades de color para los tokens de tema: hex de 6 dígitos, luminancia relativa y contraste
 * WCAG 2.x, y ajuste mínimo de un color para alcanzar un contraste dado (sin cambiar su tono).
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/
const HEX3 = /^#[0-9a-fA-F]{3}$/

export function isHex6(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value)
}

/** `#abc` / `#AABBCC` / `aabbcc` → `#AABBCC`; `null` si no es un color hex. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let v = value.trim()
  if (!v.startsWith('#')) v = `#${v}`
  if (HEX3.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return HEX6.test(v) ? v.toUpperCase() : null
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** Luminancia relativa WCAG 2.x (0 negro … 1 blanco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste WCAG (1 … 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Redondeo hacia abajo a 2 decimales (para mostrar contraste sin "aprobar" por redondeo). */
export function formatContrast(ratio: number): number {
  return Math.floor(ratio * 100) / 100
}

/** Mezcla lineal en sRGB: `t = 0` → `a`, `t = 1` → `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const k = Math.min(1, Math.max(0, t))
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k)
}

/** Oscuro o claro, el que más contraste dé sobre `bg`. */
export function readableOn(bg: string, dark = '#111111', light = '#FFFFFF'): string {
  const pick = contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light
  return normalizeHex(pick) ?? '#000000'
}

/**
 * Devuelve `fg` si ya contrasta al menos `min` con `bg`; si no, lo acerca lo mínimo posible a negro
 * o a blanco (la dirección que alcance el objetivo y conserve más el color original).
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  const base = normalizeHex(fg) ?? '#000000'
  if (contrastRatio(base, bg) >= min) return base
  const candidates: string[] = []
  for (const target of ['#000000', '#FFFFFF']) {
    if (contrastRatio(target, bg) < min) continue
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (contrastRatio(mixHex(base, target, mid), bg) >= min) hi = mid
      else lo = mid
    }
    // El redondeo a 8 bits puede dejarlo apenas por debajo: avanza hasta cumplir.
    let t = hi
    let out = mixHex(base, target, t)
    while (contrastRatio(out, bg) < min && t < 1) {
      t = Math.min(1, t + 0.01)
      out = mixHex(base, target, t)
    }
    if (contrastRatio(out, bg) >= min) candidates.push(out)
  }
  if (candidates.length === 0) return readableOn(bg, '#000000', '#FFFFFF')
  const [r0, g0, b0] = hexToRgb(base)
  const dist = (h: string) => {
    const [r, g, b] = hexToRgb(h)
    return (r - r0) ** 2 + (g - g0) ** 2 + (b - b0) ** 2
  }
  return candidates.sort((x, y) => dist(x) - dist(y))[0]
}
