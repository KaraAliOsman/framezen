/** Utilidades de color sin dependencias (hex #RRGGBB). */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string | undefined, fallback = '#2747C2'): Rgb {
  const value = (hex ?? '').trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback === hex ? { r: 39, g: 71, b: 194 } : parseHex(fallback)
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

export function isHex(value: string | undefined): value is string {
  return !!value && /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
}

/** Mezcla `a` hacia `b` en proporción t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

/** Oscurece (amount > 0) o aclara (amount < 0) hacia negro/blanco. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#000000', amount) : mix(hex, '#FFFFFF', -amount)
}

/** Luminancia relativa WCAG. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Oscurece un color hasta alcanzar el contraste pedido sobre `bg` (texto de acento legible). */
export function ensureContrast(hex: string, bg = '#FFFFFF', min = 4.5): string {
  let color = toHex(parseHex(hex))
  for (let i = 0; i < 20 && contrast(color, bg) < min; i++) color = shade(color, 0.08)
  return color
}

/** Texto blanco o tinta según el fondo. */
export function readableOn(bg: string, dark = '#1F1C18', light = '#FFFFFF'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark
}
