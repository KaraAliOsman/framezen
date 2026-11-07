/**
 * Aspecto de un asistente (estilo bloub). Solo parámetros acotados: nunca SVG, URLs ni código.
 * El equipo AVATAR puede AGREGAR valores a estas listas (los guardados siguen siendo válidos); no
 * debe quitar ni renombrar ids existentes. `normalizeAvatarSpec` repara datos antiguos o raros.
 */
import { z } from 'zod'

export const AVATAR_SHAPES = [
  'blob',
  'circle',
  'pebble',
  'squircle',
  'capsule',
  'egg',
  'hexagon',
  'drop',
  'cloud',
  'star',
  'triangle',
  /** Forma propia de DEKOPEN: silueta sólida con alféizar. */
  'window',
] as const
export type AvatarShape = (typeof AVATAR_SHAPES)[number]

export interface AvatarPalette {
  id: AvatarPaletteId
  body: string
  eye: string
  accent: string
}

export const AVATAR_PALETTE_IDS = [
  'anthracite',
  'float_glass',
  'graphite',
  'ocean',
  'sky',
  'forest',
  'sage',
  'sand',
  'terracotta',
  'coral',
  'plum',
  'sun',
] as const
export type AvatarPaletteId = (typeof AVATAR_PALETTE_IDS)[number]

/** 12 paletas con contraste suficiente entre cuerpo y ojos (≥ 4.5:1) en claro y oscuro. */
export const AVATAR_PALETTES: Record<AvatarPaletteId, AvatarPalette> = {
  anthracite: { id: 'anthracite', body: '#383E42', eye: '#FFFFFF', accent: '#7FB8A4' },
  float_glass: { id: 'float_glass', body: '#2F6F5E', eye: '#FFFFFF', accent: '#BFE3D6' },
  graphite: { id: 'graphite', body: '#4A4F57', eye: '#FFFFFF', accent: '#F0B429' },
  ocean: { id: 'ocean', body: '#1F4E8C', eye: '#FFFFFF', accent: '#8EC5FF' },
  sky: { id: 'sky', body: '#2B6CB0', eye: '#FFFFFF', accent: '#FBD38D' },
  forest: { id: 'forest', body: '#2D5A3D', eye: '#FFFFFF', accent: '#B7E4C7' },
  sage: { id: 'sage', body: '#5B6E5A', eye: '#FFFFFF', accent: '#E9F0DA' },
  sand: { id: 'sand', body: '#8A6B45', eye: '#FFFFFF', accent: '#F3DFC1' },
  terracotta: { id: 'terracotta', body: '#A1452D', eye: '#FFFFFF', accent: '#FFD2B8' },
  coral: { id: 'coral', body: '#B83B4B', eye: '#FFFFFF', accent: '#FFC7CF' },
  plum: { id: 'plum', body: '#5E3A74', eye: '#FFFFFF', accent: '#E3C8F2' },
  sun: { id: 'sun', body: '#8C5A00', eye: '#FFFFFF', accent: '#FFE08A' },
}

export const AVATAR_EYES = ['capsule', 'round', 'oval', 'dot', 'arc', 'wide'] as const
export type AvatarEyes = (typeof AVATAR_EYES)[number]

export const AVATAR_ACCESSORIES = [
  'none',
  'glasses',
  'safety_glasses',
  'hard_hat',
  'cap',
  'headset',
  'pencil',
  'tape_measure',
  'bow_tie',
  'leaf',
] as const
export type AvatarAccessory = (typeof AVATAR_ACCESSORIES)[number]

/** Intensidad de la animación (todas respetan «reducir movimiento»). */
export const AVATAR_MOTIONS = ['calm', 'lively', 'minimal'] as const
export type AvatarMotion = (typeof AVATAR_MOTIONS)[number]

export interface AvatarColors {
  body: string
  eye: string
  accent: string
}

export interface AvatarSpec {
  version: 1
  shape: AvatarShape
  /** Paleta con nombre, o 'custom' con `colors`. */
  palette: AvatarPaletteId | 'custom'
  colors?: AvatarColors
  eyes: AvatarEyes
  accessory: AvatarAccessory
  motion: AvatarMotion
}

export const DEFAULT_AVATAR: AvatarSpec = {
  version: 1,
  shape: 'window',
  palette: 'anthracite',
  eyes: 'capsule',
  accessory: 'none',
  motion: 'calm',
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const avatarColorsSchema = z.object({ body: hex, eye: hex, accent: hex }).strict()

export const avatarSpecSchema = z
  .object({
    version: z.literal(1).default(1),
    shape: z.enum(AVATAR_SHAPES),
    palette: z.union([z.enum(AVATAR_PALETTE_IDS), z.literal('custom')]),
    colors: avatarColorsSchema.optional(),
    eyes: z.enum(AVATAR_EYES),
    accessory: z.enum(AVATAR_ACCESSORIES),
    motion: z.enum(AVATAR_MOTIONS),
  })
  .strict()
  .refine((v) => v.palette !== 'custom' || Boolean(v.colors), { message: 'custom_palette_needs_colors', path: ['colors'] })

/** Colores efectivos (paleta con nombre o propios). */
export function avatarColors(spec: Pick<AvatarSpec, 'palette' | 'colors'>): AvatarColors {
  if (spec.palette === 'custom' && spec.colors) return spec.colors
  const palette = spec.palette !== 'custom' ? AVATAR_PALETTES[spec.palette] : undefined
  const base = palette ?? AVATAR_PALETTES.anthracite
  return { body: base.body, eye: base.eye, accent: base.accent }
}

/** Repara un avatar guardado: valores desconocidos vuelven al valor por defecto (nunca falla). */
export function normalizeAvatarSpec(value: unknown): AvatarSpec {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback)
  const colors = avatarColorsSchema.safeParse(raw.colors)
  const paletteOk = raw.palette === 'custom' ? colors.success : (AVATAR_PALETTE_IDS as readonly unknown[]).includes(raw.palette)
  return {
    version: 1,
    shape: pick(AVATAR_SHAPES, raw.shape, DEFAULT_AVATAR.shape),
    palette: paletteOk ? (raw.palette as AvatarSpec['palette']) : DEFAULT_AVATAR.palette,
    ...(raw.palette === 'custom' && colors.success ? { colors: colors.data } : {}),
    eyes: pick(AVATAR_EYES, raw.eyes, DEFAULT_AVATAR.eyes),
    accessory: pick(AVATAR_ACCESSORIES, raw.accessory, DEFAULT_AVATAR.accessory),
    motion: pick(AVATAR_MOTIONS, raw.motion, DEFAULT_AVATAR.motion),
  }
}
