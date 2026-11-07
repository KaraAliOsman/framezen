/**
 * Colores efectivos de un avatar (DEKOPEN). Puro y probado: el mismo cálculo sirve al avatar,
 * al diseñador (avisos de contraste) y a las pruebas.
 *
 * - El cuerpo se aclara lo justo en el tema oscuro para no perderse sobre la superficie
 *   antracita, sin bajar el contraste de los ojos de 3:1.
 * - Un cuerpo muy claro lleva un filo fino en el tema claro (si no, desaparece sobre blanco).
 * - El paño de la ventana es el cuerpo teñido con el acento: vidrio con canto verde.
 */
import { AVATAR_PALETTES, avatarColors, normalizeAvatarSpec, type AvatarColors, type AvatarSpec } from '@dekopen/shared'

/** Superficies de referencia del tema (DESIGN §2.1). */
const SURFACE_LIGHT = '#FFFFFF'
const SURFACE_DARK = '#151B1D'

export interface ResolvedAvatarColors extends AvatarColors {
  /** cuerpo en el tema oscuro */
  bodyDark: string
  /** paño de vidrio (claro / oscuro) */
  glass: string
  glassDark: string
  /** filo del cuerpo en el tema claro, o null si no hace falta */
  outline: string | null
  /** contraste ojos/cuerpo (claro) */
  eyeContrast: number
}

function parse(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim())
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** Mezcla lineal en sRGB (suficiente para tintes chicos). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return a
  return toHex([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t])
}

/** Luminancia relativa WCAG. */
export function luminance(hex: string): number {
  const p = parse(hex)
  if (!p) return 0
  const [r, g, b] = p.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Cuerpo para el tema oscuro: se mezcla con blanco de a poco hasta separarse de la superficie
 * (≥ 2,2:1, se lee como figura) sin que los ojos bajen de 3:1 contra él.
 */
export function bodyForDark(body: string, eye: string, surface = SURFACE_DARK): string {
  if (contrastRatio(body, surface) >= 2.2) return body.toUpperCase()
  let best = body
  for (let t = 0.02; t <= 0.6 + 1e-9; t += 0.02) {
    const candidate = mixHex(body, '#FFFFFF', t)
    if (contrastRatio(candidate, eye) < 3) break
    best = candidate
    if (contrastRatio(candidate, surface) >= 2.2) break
  }
  return best.toUpperCase()
}

/** Colores efectivos de un avatar (acepta datos viejos o raros: se normalizan). */
export function resolveAvatarColors(spec: Partial<AvatarSpec> | null | undefined): ResolvedAvatarColors {
  const safe = normalizeAvatarSpec(spec ?? {})
  const { body, eye, accent } = avatarColors(safe)
  const bodyDark = bodyForDark(body, eye)
  return {
    body: body.toUpperCase(),
    eye: eye.toUpperCase(),
    accent: accent.toUpperCase(),
    bodyDark,
    glass: mixHex(mixHex(body, accent, 0.32), '#FFFFFF', 0.04),
    glassDark: mixHex(mixHex(bodyDark, accent, 0.3), '#FFFFFF', 0.04),
    outline: contrastRatio(body, SURFACE_LIGHT) < 1.35 ? 'rgb(16 22 24 / 0.16)' : null,
    eyeContrast: contrastRatio(body, eye),
  }
}

/** Avisos (no bloqueos) para colores propios en el diseñador. */
export interface ColorAdvice {
  /** ojos poco visibles sobre el cuerpo */
  lowEyeContrast: boolean
  /** el cuerpo casi no se distingue de la superficie clara */
  faintOnLight: boolean
}

export function adviseColors(colors: AvatarColors): ColorAdvice {
  return {
    lowEyeContrast: contrastRatio(colors.body, colors.eye) < 3,
    faintOnLight: contrastRatio(colors.body, SURFACE_LIGHT) < 1.35,
  }
}

/** Colores sugeridos al pasar a «Personalizado»: parte de la paleta actual. */
export function startingCustomColors(spec: AvatarSpec): AvatarColors {
  if (spec.palette === 'custom' && spec.colors) return spec.colors
  const p = spec.palette !== 'custom' ? AVATAR_PALETTES[spec.palette] : AVATAR_PALETTES.anthracite
  return { body: p.body, eye: p.eye, accent: p.accent }
}
