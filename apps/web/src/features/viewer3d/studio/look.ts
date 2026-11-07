/**
 * Puesta en escena por color: fondo y exposición para que blanco, antracita y madera se lean a la primera,
 * en tema claro y oscuro. Fondos de muro neutro y cálido: el fondo acompaña a la ventana, nunca se parece a
 * ella. Una ventana clara va sobre un yeso medio; una oscura o de madera, sobre uno claro.
 *
 * Puro: sin three.js ni DOM, para poder medir el contraste en pruebas.
 */

export type ProfileTone = 'light' | 'wood' | 'dark' | 'mid'

export interface StudioLook {
  tone: ProfileTone
  /** Fondo: centro iluminado, borde y piso. */
  backdrop: { center: string; edge: string; floor: string }
  /** Exposición del tone mapping. */
  exposure: number
  /** Intensidad del entorno sobre los materiales. */
  environment: number
  /** Luz principal (con sombra). */
  key: number
  shadowColor: string
  shadowOpacity: number
  /** Vidrio: se compone sobre el fondo en espacio de pantalla, y cada fondo pide otra mezcla. */
  glass: { opacity: number; reflect: number }
}

export interface LookInput {
  /** Luminancia relativa (0–1) del color que se está mirando. */
  luminance: number
  finish: string
  dark: boolean
}

export function toneOf(luminance: number, finish: string): ProfileTone {
  if (finish === 'woodgrain') return luminance < 0.09 ? 'dark' : 'wood'
  if (luminance >= 0.5) return 'light'
  if (luminance <= 0.09) return 'dark'
  return 'mid'
}

const ON_DARK = { opacity: 0.5, reflect: 0.4 }
const ON_MID = { opacity: 0.76, reflect: 0.24 }
const ON_LIGHT = { opacity: 0.78, reflect: 0.2 }

const LOOKS: Record<'light' | 'dark', Record<ProfileTone, Omit<StudioLook, 'tone'>>> = {
  light: {
    light: { backdrop: { center: '#B4ADA0', edge: '#9B9488', floor: '#A69F92' }, exposure: 0.98, environment: 0.74, key: 1.12, shadowColor: '#2A2620', shadowOpacity: 0.55, glass: ON_MID },
    wood: { backdrop: { center: '#F3F1EC', edge: '#D9D5CD', floor: '#E2DED6' }, exposure: 0.96, environment: 0.78, key: 1.2, shadowColor: '#2A2620', shadowOpacity: 0.5, glass: ON_LIGHT },
    dark: { backdrop: { center: '#F3F1EC', edge: '#D3CFC6', floor: '#DEDAD2' }, exposure: 1, environment: 0.86, key: 1.35, shadowColor: '#2A2620', shadowOpacity: 0.5, glass: ON_LIGHT },
    mid: { backdrop: { center: '#EFEDE8', edge: '#CFCBC3', floor: '#DBD7CF' }, exposure: 1, environment: 0.82, key: 1.3, shadowColor: '#2A2620', shadowOpacity: 0.5, glass: ON_LIGHT },
  },
  dark: {
    light: { backdrop: { center: '#45413B', edge: '#1D1B18', floor: '#2C2925' }, exposure: 0.94, environment: 0.7, key: 1.08, shadowColor: '#000000', shadowOpacity: 0.8, glass: ON_DARK },
    wood: { backdrop: { center: '#3C3934', edge: '#191714', floor: '#26231F' }, exposure: 0.98, environment: 0.78, key: 1.25, shadowColor: '#000000', shadowOpacity: 0.75, glass: ON_DARK },
    dark: { backdrop: { center: '#D6D2CA', edge: '#99948A', floor: '#B4AFA5' }, exposure: 0.96, environment: 0.82, key: 1.35, shadowColor: '#000000', shadowOpacity: 0.6, glass: ON_LIGHT },
    mid: { backdrop: { center: '#45413B', edge: '#1D1B18', floor: '#2C2925' }, exposure: 1, environment: 0.82, key: 1.35, shadowColor: '#000000', shadowOpacity: 0.75, glass: ON_DARK },
  },
}

export function studioLook({ luminance, finish, dark }: LookInput): StudioLook {
  const tone = toneOf(luminance, finish)
  return { tone, ...LOOKS[dark ? 'dark' : 'light'][tone] }
}

/** Fondo del visor en CSS: no pesa en la GPU, no tiene bandas y el vidrio se compone sobre él sin más pases. */
export function backdropCss({ center, edge, floor }: StudioLook['backdrop']): string {
  return [
    `radial-gradient(70% 62% at 50% 40%, ${center} 0%, transparent 100%)`,
    `linear-gradient(180deg, ${edge} 0%, ${edge} 52%, ${floor} 80%, ${floor} 100%)`,
  ].join(', ')
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa de un #RRGGBB. */
export function luminanceOfHex(hex: string): number {
  const n = parseInt(hex.slice(1, 7).padEnd(6, '0'), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Contraste WCAG entre dos luminancias. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
