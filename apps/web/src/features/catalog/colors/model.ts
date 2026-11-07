/**
 * Lógica pura de la pestaña de colores y texturas: cómo se ve cada color (textura subida,
 * integrada o adivinada por el nombre), URLs de imágenes, nombre desde el archivo y etiquetas de
 * precio. Sin React, para probarla directo.
 */
import type { Color } from '@dekopen/engine'
import {
  BUILTIN_TEXTURES,
  type BuiltinTextureId,
  type TextureAsset,
  type TextureFinish,
  type TextureRef,
} from '@dekopen/shared'
import { API_BASE } from '../../../lib/api'
import { swatchImage } from '../model/swatch'
import { builtinTileUrl } from './builtin'

// ── Clasificación por nombre ─────────────────────────────────────────────────

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')

/** Reglas en orden: la primera que calza gana. `exact` = es ese foliado; si no, solo su familia. */
const NAME_RULES: { test: RegExp; id: BuiltinTextureId; exact: boolean }[] = [
  { test: /crema|cream|creme|krem|9001/, id: 'cream_9001', exact: true },
  { test: /antraci|anthraz|anthrac|antrasit|7016/, id: 'anthracite_7016_smooth', exact: true },
  { test: /roble dorado|golden|eiche gold|rovere dorato|carvalho dourado|altin mese/, id: 'golden_oak', exact: true },
  { test: /nogal|walnut|nuss|noce|nogueira|noyer|ceviz/, id: 'nut_tree', exact: true },
  { test: /caoba|mahog|mogno|acajou|mogano|maun/, id: 'mahogany', exact: true },
  { test: /winchester/, id: 'winchester', exact: true },
  { test: /sheffield/, id: 'sheffield_oak', exact: true },
  { test: /irland|irish|irlanda/, id: 'irish_oak', exact: true },
  { test: /chartwell/, id: 'chartwell_green', exact: true },
  { test: /cuarzo|quartz|quarz|kuvars|7039/, id: 'quartz_grey_7039', exact: true },
  { test: /marron|brown|braun|chocolate|cafe|8022/, id: 'black_brown_8022', exact: true },
  { test: /blanco|white|weiss|bianco|branco|blanc|beyaz|9016/, id: 'white_9016', exact: true },
  { test: /negro|black|schwarz|nero|preto|noir|siyah|9005/, id: 'black_9005', exact: true },
  { test: /grafito|graphite|graphit/, id: 'anthracite_7016_smooth', exact: false },
  { test: /plata|silver|silber|argento|prata|alumin|acero|inox|steel|titanio|titan|peltre|pewter|metal|cepill|brush/, id: 'metbrush_silver', exact: false },
  { test: /roble|oak|eiche|rovere|carvalho|chene|mese|embero|anteak|colonial|lenga|wengu|terra|cerezo|cherry|pino|pine|teca|teak|madera|wood|holz/, id: 'golden_oak', exact: false },
  { test: /gris|grey|gray|grau|grigio|cinza|gri\b/, id: 'grey_7035', exact: false },
]

export function guessBuiltinTexture(name: string): { id: BuiltinTextureId; exact: boolean } | null {
  const n = fold(name)
  for (const rule of NAME_RULES) if (rule.test.test(n)) return { id: rule.id, exact: rule.exact }
  return null
}

// ── Apariencia ───────────────────────────────────────────────────────────────

export interface ColorAppearance {
  hex: string
  /** De dónde sale el dibujo: textura subida, integrada (exacta o como familia teñida) o liso. */
  source: 'upload' | 'builtin' | 'family' | 'flat'
  /** Imagen de la tesela (si hay). */
  tileUrl?: string
  thumbUrl?: string
  /** La tesela es de otra madera de la misma familia: se tiñe con el color (soft-light). */
  tint?: boolean
  /** Muestra vectorial de respaldo (sin foto): se dibuja a su tamaño, no a la escala física. */
  procedural?: boolean
  finish: TextureFinish
  scaleMm: number
  builtinId?: BuiltinTextureId
  assetId?: string
  /** Colores claro/oscuro para la muestra de respaldo (sin tesela). */
  light?: string
  dark?: string
}

export function textureImageUrl(assetId: string, variant: 'tile' | 'thumb' = 'tile'): string {
  return `${API_BASE}/textures/${encodeURIComponent(assetId)}/image${variant === 'thumb' ? '?variant=thumb' : ''}`
}

/** Apariencia de una textura (referencia guardada en un color). */
export function appearanceOfRef(ref: TextureRef, hex: string, uploads?: ReadonlyMap<string, TextureAsset>): ColorAppearance {
  if (ref.kind === 'upload') {
    const asset = uploads?.get(ref.assetId)
    return {
      hex,
      source: 'upload',
      tileUrl: textureImageUrl(ref.assetId),
      thumbUrl: textureImageUrl(ref.assetId, 'thumb'),
      finish: ref.finish ?? asset?.meta.finish ?? 'woodgrain',
      scaleMm: ref.scaleMm ?? asset?.meta.scaleMm ?? 900,
      assetId: ref.assetId,
      ...(asset ? { light: asset.meta.palette.light, dark: asset.meta.palette.dark } : {}),
    }
  }
  const t = BUILTIN_TEXTURES[ref.id]
  // Referencia a una textura que ya no existe en la biblioteca: el color liso, nunca un error.
  if (!t) return { hex, source: 'flat', finish: ref.finish ?? 'smooth', scaleMm: ref.scaleMm ?? 300 }
  // Sin la tesela fotográfica todavía: la muestra vectorial del catálogo (ruido con el color base).
  const photo = builtinTileUrl(ref.id)
  const tile = photo ?? swatchImage({ id: ref.id, name: t.names.es, hex: t.hex, texture: { kind: 'builtin', id: ref.id, finish: t.finish } })
  return {
    hex,
    source: 'builtin',
    ...(tile ? { tileUrl: tile, thumbUrl: tile } : {}),
    ...(tile && !photo ? { procedural: true } : {}),
    finish: ref.finish ?? t.finish,
    scaleMm: ref.scaleMm ?? t.scaleMm,
    builtinId: ref.id,
    light: t.light,
    dark: t.dark,
  }
}

/** Cómo se ve un color del catálogo: su textura, o la familia que sugiere su nombre, o liso. */
export function appearanceOf(color: Pick<Color, 'name' | 'hex' | 'texture'>, uploads?: ReadonlyMap<string, TextureAsset>): ColorAppearance {
  if (color.texture) return appearanceOfRef(color.texture as TextureRef, color.hex, uploads)
  const guess = guessBuiltinTexture(color.name)
  if (!guess) return { hex: color.hex, source: 'flat', finish: 'smooth', scaleMm: 300 }
  const t = BUILTIN_TEXTURES[guess.id]
  const photo = builtinTileUrl(guess.id)
  // Familia sin foliado exacto: la veta de la biblioteca teñida con su color; sin foto, la muestra
  // vectorial ya hecha con su color.
  const tile = photo ?? swatchImage({ id: `${guess.id}:${color.hex}`, name: color.name, hex: color.hex, texture: { kind: 'builtin', id: guess.id, finish: t.finish } })
  return {
    hex: color.hex,
    source: guess.exact ? 'builtin' : 'family',
    ...(tile ? { tileUrl: tile, thumbUrl: tile } : {}),
    ...(photo && !guess.exact ? { tint: true } : {}),
    ...(tile && !photo ? { procedural: true } : {}),
    finish: t.finish,
    scaleMm: t.scaleMm,
    builtinId: guess.id,
    light: guess.exact ? t.light : shade(color.hex, 0.16),
    dark: guess.exact ? t.dark : shade(color.hex, -0.22),
  }
}

/** Aclara (+) u oscurece (−) un hex en una fracción, para la muestra de respaldo. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  const ch = (h: string) => {
    const v = parseInt(h, 16)
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)
    return Math.round(Math.max(0, Math.min(255, out))).toString(16).padStart(2, '0')
  }
  return `#${ch(m[1]!)}${ch(m[2]!)}${ch(m[3]!)}`.toUpperCase()
}

/** Luminancia relativa aproximada (0–1) para decidir bordes y contraste de etiquetas. */
export function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => parseInt(x, 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 200
}

/**
 * Fondo CSS de una muestra sin tesela: el color con una veta suave (madera), un cepillado fino
 * (metálico) o un brillo de canto (liso). Mejor que un plano mientras llega la imagen real.
 */
export function fallbackBackground(a: Pick<ColorAppearance, 'hex' | 'finish' | 'light' | 'dark'>): string {
  const light = a.light ?? shade(a.hex, 0.14)
  const dark = a.dark ?? shade(a.hex, -0.2)
  if (a.finish === 'woodgrain') {
    return [
      `repeating-linear-gradient(178deg, transparent 0 7px, ${dark}55 7px 8px, transparent 8px 13px, ${light}40 13px 15px, transparent 15px 23px)`,
      `repeating-linear-gradient(181deg, transparent 0 19px, ${dark}33 19px 22px, transparent 22px 37px)`,
      a.hex,
    ].join(', ')
  }
  if (a.finish === 'metallic') return `repeating-linear-gradient(180deg, ${light}30 0 1px, transparent 1px 3px), linear-gradient(180deg, ${light}, ${a.hex} 55%, ${dark})`
  if (a.finish === 'textured') return `radial-gradient(${light}35 0.6px, transparent 0.8px) 0 0 / 3px 3px, radial-gradient(${dark}40 0.6px, transparent 0.8px) 1px 2px / 4px 4px, ${a.hex}`
  return a.hex
}

// ── Subida ───────────────────────────────────────────────────────────────────

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** «roble_rustico-02.jpg» → «Roble rustico 02»; null si el nombre es genérico de cámara o captura. */
export function nameFromFileName(fileName: string | undefined): string | null {
  if (!fileName) return null
  const stem = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stem || /^(img|dsc|dscn|pxl|photo|foto|image|imagen|screenshot|captura|whatsapp|signal|scan)\b/i.test(stem) || /^[\d\s]+$/.test(stem)) return null
  const clean = stem.slice(0, 60)
  return clean.charAt(0).toLocaleUpperCase() + clean.slice(1)
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

// ── Precio ───────────────────────────────────────────────────────────────────

/** Factor de precio ↔ recargo en % (1,15 ↔ 15). */
export function factorToPct(factor: number | undefined): number | null {
  if (factor === undefined || !Number.isFinite(factor)) return null
  return Math.round((factor - 1) * 1000) / 10
}

export function pctToFactor(pct: number): number {
  return Math.round((1 + pct / 100) * 1000) / 1000
}

/** Giro en grados normalizado a (−180, 180] (lo que acepta el servidor). */
export function normalizeRotation(deg: number): number {
  let a = deg % 360
  if (a > 180) a -= 360
  if (a <= -180) a += 360
  return Math.round(a * 10) / 10
}
