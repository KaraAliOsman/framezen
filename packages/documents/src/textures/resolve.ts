/**
 * Apariencia de un color del catálogo: el resolvedor único que comparten el dibujo 2D (realista y
 * técnico), los documentos, las muestras y el visor 3D.
 *
 * Orden de decisión:
 *  1. `Color.texture` explícita (integrada, alias del catálogo inicial o subida por el taller).
 *  2. Nombre/id conocido («Nogal» → nut_tree, «Antracita» → anthracite_7016_smooth, «Roble dorado» → golden_oak).
 *  3. Tono: madera por matiz, blanco por claridad; el resto queda liso con el hex del catálogo.
 * `hex` sigue siendo el respaldo plano; si el tono del catálogo difiere del foliado, se tiñe la tesela.
 */
import type { Color } from '@dekopen/engine'
import { isBuiltinTextureId, type Locale, type TextureFinish } from '@dekopen/shared'
import { builtinTextureHref } from './loader'
import { BUILTIN_TEXTURE_IDS, BUILTIN_TEXTURE_LIBRARY, LEGACY_TEXTURE_ALIASES, builtinTextureName, surfaceMaterialFor, type BuiltinTextureId, type SurfaceMaterial } from './registry'

/** Textura subida por el taller, ya en línea (data URL de la API de texturas). */
export interface UploadedTextureSource {
  /** data:image/webp|png|jpeg;base64,… (nunca una URL remota: Chromium imprime sin red). */
  href: string
  scaleMm?: number
  finish?: TextureFinish
  angleDeg?: number
  palette?: { base: string; light?: string; dark?: string }
  name?: string
}

/** Fuentes de imagen para el dibujo: integradas (data URL) y subidas por id de asset. */
export interface TextureSources {
  builtin?: Partial<Record<BuiltinTextureId, string>>
  uploads?: Readonly<Record<string, UploadedTextureSource>>
}

export type AppearanceSource = { kind: 'builtin'; id: BuiltinTextureId } | { kind: 'upload'; assetId: string }

export interface ColorAppearance {
  /** Id estable para `<defs>` (`b-golden_oak`, `b-nut_tree-t4a2e1b`, `u-<asset>`, `f-383e42`). */
  key: string
  /** Respaldo plano (#RRGGBB). */
  hex: string
  light: string
  dark: string
  finish: TextureFinish
  source: AppearanceSource | null
  /** Imagen de la tesela si está disponible (data URL). */
  href?: string
  /** Repetición física a lo largo de la veta (mm) y proporción alto/ancho. */
  scaleMm: number
  aspect: number
  /** Giro extra de la veta (°). */
  angleDeg: number
  /** Velo del hex del catálogo sobre la tesela (0 = foliado tal cual). */
  tint: number
  /** Veta direccional (sigue cada pieza) o isótropa. */
  grain: 'x' | 'none'
  material: SurfaceMaterial
  luminance: number
  /** Blanco/crema/claros: el dibujo usa contornos grises. */
  isLight: boolean
  match: 'texture' | 'name' | 'hex' | 'default'
}

type ColorInput = Pick<Color, 'id' | 'hex'> & Partial<Pick<Color, 'name' | 'texture'>>

// ── Color ────────────────────────────────────────────────────────────────────

function normHex(hex: string | undefined, fallback = '#F5F5F0'): string {
  const value = (hex ?? '').trim().replace(/^#/, '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toUpperCase()}` : fallback
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const lin = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminanceOf(hex: string): number {
  const [r, g, b] = rgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Diferencia de color CIE76 (suficiente para decidir si teñir). */
export function deltaE(a: string, b: string): number {
  const p = lab(normHex(a))
  const q = lab(normHex(b))
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')
  return `#${c(0)}${c(1)}${c(2)}`.toUpperCase()
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

// ── Clasificación por nombre ─────────────────────────────────────────────────

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
}

/** Orden importante: lo específico antes que lo genérico («antracita veta» antes que «antracita»). */
const NAME_RULES: [RegExp, BuiltinTextureId | 'wood'][] = [
  [/(antraci|anthrac|anthrazit|antrasit|7016).*(veta|wood|grain|madera|holz|venat|veio|veine|ahsap)|(veta|woodgrain).*(antraci|anthrac|anthrazit|7016)/, 'anthracite_7016_woodgrain'],
  [/(antraci|anthrac|anthrazit|antrasit|7016|grafit|graphit).*(textur|arena|sand|rugos|grano|struktur|sabbi|kum|areado|sable)|(textur|sablé|sand).*(antraci|anthrac|anthrazit|7016|grafit)/, 'anthracite_7016_sand'],
  [/grafit|graphit/, 'anthracite_7016_sand'],
  [/antraci|anthrac|anthrazit|antrasit|7016/, 'anthracite_7016_smooth'],
  [/cuarzo|quartz|quarz|quarzo|kuvars|7039/, 'quartz_grey_7039'],
  [/crema|cream|creme|crème|krem|9001/, 'cream_9001'],
  [/(marr[o]n|brown|braun|marrone|kahve|castanho|brun).*(negr|black|schwarz|nero|siyah|noir)|(negr|black|schwarz|nero|noir).*(marr[o]n|brown|braun)|8022|chocolate|wengue|wenge/, 'black_brown_8022'],
  [/negr|black|schwarz|nero|siyah|noir|preto|9005/, 'black_9005'],
  [/chartwell/, 'chartwell_green'],
  [/winchester/, 'winchester'],
  [/sheffield/, 'sheffield_oak'],
  [/irland|irish|irische|irlandese|irlanda/, 'irish_oak'],
  [/(roble|oak|eiche|rovere|mese|carvalho|chene).*(dorad|golden|gold|dorato|altin|dore)|(dorad|golden).*(roble|oak|eiche)|goldeneiche|golden oak/, 'golden_oak'],
  [/nogal|walnut|nussbaum|noce|ceviz|nogueira|noyer|nut[ _-]?tree/, 'nut_tree'],
  [/caoba|mahogany|mahagoni|mogano|maun|mogno|acajou|sapell?i|cerezo|cherry|kirsch/, 'mahogany'],
  [/alumin|plata|silver|metal|titan|inox|acero|steel|peltre|pewter|bronce|bronze|champagne|cepill|brush/, 'metbrush_silver'],
  [/roble|oak|eiche|rovere|mese|carvalho|chene|madera|wood|holz|legno|lenga|teca|teak|pino|anteak|embero|colonial|haya|cedro|olmo|fresno/, 'wood'],
  [/gris claro|light gr[ae]y|lichtgrau|grigio luce|7035|gris luminoso|cinza claro|acik gri/, 'grey_7035'],
  [/blanc|white|weiss|bianco|beyaz|branco|9016|9010/, 'white_9016'],
]

/** Foliado integrado por nombre o id del color (o null si el nombre no dice nada). */
export function classifyColorName(text: string, hex?: string): BuiltinTextureId | null {
  const probe = fold(text)
  for (const [re, id] of NAME_RULES) {
    if (!re.test(probe)) continue
    return id === 'wood' ? nearestBuiltin(hex ?? '#A0703F', 'woodgrain') : id
  }
  return null
}

/** Foliado integrado más parecido en tono, dentro de un acabado. */
export function nearestBuiltin(hex: string, finish?: TextureFinish): BuiltinTextureId {
  let best: BuiltinTextureId = finish === 'woodgrain' ? 'golden_oak' : 'white_9016'
  let bestDistance = Infinity
  for (const id of BUILTIN_TEXTURE_IDS) {
    const look = BUILTIN_TEXTURE_LIBRARY[id]
    if (finish && look.finish !== finish) continue
    const d = deltaE(hex, look.hex)
    if (d < bestDistance) {
      bestDistance = d
      best = id
    }
  }
  return best
}

function looksLikeWood(hex: string): boolean {
  const { h, s, l } = hsl(hex)
  return h >= 12 && h <= 48 && s >= 0.3 && l >= 0.12 && l <= 0.6
}

// ── Resolución ───────────────────────────────────────────────────────────────

const TINT_FREE = 7

function tintFor(colorHex: string, textureHex: string): number {
  const d = deltaE(colorHex, textureHex)
  return d <= TINT_FREE ? 0 : Math.min(0.62, Math.round(((d - TINT_FREE) / 36) * 100) / 100)
}

function keyPart(text: string): string {
  return text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
}

function flatAppearance(hex: string, match: ColorAppearance['match']): ColorAppearance {
  const lum = luminanceOf(hex)
  return {
    key: `f-${hex.slice(1).toLowerCase()}`,
    hex,
    light: mixHex(hex, '#FFFFFF', lum > 0.5 ? 0.35 : 0.18),
    dark: mixHex(hex, '#000000', lum > 0.5 ? 0.12 : 0.3),
    finish: 'smooth',
    source: null,
    scaleMm: 300,
    aspect: 1,
    angleDeg: 0,
    tint: 0,
    grain: 'none',
    material: surfaceMaterialFor('smooth'),
    luminance: lum,
    isLight: lum > 0.55,
    match,
  }
}

function builtinAppearance(id: BuiltinTextureId, colorHex: string | undefined, sources: TextureSources | undefined, match: ColorAppearance['match'], scaleMm?: number, angleDeg?: number): ColorAppearance {
  const look = BUILTIN_TEXTURE_LIBRARY[id]
  const hex = colorHex ?? look.hex
  const tint = colorHex ? tintFor(colorHex, look.hex) : 0
  const lum = luminanceOf(hex)
  const scale = scaleMm && scaleMm > 0 ? scaleMm : look.scaleMm
  const angle = Number.isFinite(angleDeg) ? Number(angleDeg) : 0
  const parts = [`b-${id}`]
  if (tint > 0) parts.push(`t${hex.slice(1).toLowerCase()}`)
  if (scale !== look.scaleMm) parts.push(`s${Math.round(scale)}`)
  if (angle) parts.push(`a${Math.round(angle)}`)
  return {
    key: parts.join('-'),
    hex,
    light: tint > 0 ? mixHex(look.light, hex, tint) : look.light,
    dark: tint > 0 ? mixHex(look.dark, hex, tint) : look.dark,
    finish: look.finish,
    source: { kind: 'builtin', id },
    href: sources?.builtin?.[id] ?? builtinTextureHref(id),
    scaleMm: scale,
    aspect: look.aspect,
    angleDeg: angle,
    tint,
    grain: look.grain,
    material: look.material,
    luminance: lum,
    isLight: lum > 0.55,
    match,
  }
}

const memo = new Map<string, ColorAppearance>()

/**
 * Apariencia (textura, tonos, material) de un color del catálogo. Puro y memorizado; `undefined` =
 * PVC blanco. Con `sources` se usan las teselas indicadas; sin ellas, las integradas ya cargadas.
 */
export function resolveColorAppearance(color: ColorInput | undefined, sources?: TextureSources): ColorAppearance {
  if (!color) return builtinAppearance('white_9016', undefined, sources, 'default')
  const hex = normHex(color.hex, '')
  const texture = color.texture
  const upload = texture?.kind === 'upload' ? sources?.uploads?.[texture.assetId] : undefined
  const builtinHref = texture?.kind === 'builtin' && isBuiltinTextureId(texture.id) ? (sources?.builtin?.[texture.id] ?? builtinTextureHref(texture.id)) : undefined
  const memoKey = [color.id, hex, color.name ?? '', texture ? JSON.stringify(texture) : '', upload?.href.length ?? 0, upload?.href.slice(-24) ?? '', builtinHref ? 1 : 0, sources?.builtin ? Object.keys(sources.builtin).length : 0].join('|')
  const cached = memo.get(memoKey)
  if (cached && (cached.source?.kind !== 'builtin' || cached.href || !builtinTextureHref(cached.source.id))) return cached
  const out = computeAppearance(color, hex || undefined, sources)
  if (memo.size > 600) memo.clear()
  memo.set(memoKey, out)
  return out
}

function computeAppearance(color: ColorInput, hex: string | undefined, sources: TextureSources | undefined): ColorAppearance {
  const texture = color.texture
  if (texture?.kind === 'upload') {
    const upload = sources?.uploads?.[texture.assetId]
    const finish = texture.finish ?? upload?.finish ?? 'woodgrain'
    const base = normHex(upload?.palette?.base ?? hex ?? '#A0703F')
    const flat = hex ?? base
    const lum = luminanceOf(flat)
    return {
      key: `u-${keyPart(texture.assetId)}${texture.scaleMm ? `-s${Math.round(texture.scaleMm)}` : ''}${texture.angleDeg ? `-a${Math.round(texture.angleDeg)}` : ''}`,
      hex: flat,
      light: normHex(upload?.palette?.light, mixHex(flat, '#FFFFFF', 0.2)),
      dark: normHex(upload?.palette?.dark, mixHex(flat, '#000000', 0.3)),
      finish,
      source: { kind: 'upload', assetId: texture.assetId },
      href: upload?.href && /^data:image\/(webp|png|jpeg);base64,/.test(upload.href) ? upload.href : undefined,
      scaleMm: texture.scaleMm ?? upload?.scaleMm ?? 160,
      aspect: 1,
      angleDeg: texture.angleDeg ?? upload?.angleDeg ?? 0,
      tint: 0,
      grain: finish === 'woodgrain' || finish === 'metallic' ? 'x' : 'none',
      material: surfaceMaterialFor(finish),
      luminance: lum,
      isLight: lum > 0.55,
      match: 'texture',
    }
  }
  if (texture?.kind === 'builtin') {
    if (isBuiltinTextureId(texture.id)) return builtinAppearance(texture.id, hex, sources, 'texture', texture.scaleMm, texture.angleDeg)
    const id = LEGACY_TEXTURE_ALIASES[texture.id] ?? classifyColorName(`${texture.id} ${color.name ?? ''}`, hex) ?? (hex ? nearestBuiltin(hex, texture.finish) : 'white_9016')
    // La escala de un alias del catálogo inicial era de otra tesela: la biblioteca conoce la suya.
    return builtinAppearance(id, hex, sources, 'texture', undefined, texture.angleDeg)
  }
  const byName = classifyColorName(`${color.name ?? ''} ${color.id}`, hex)
  if (byName) {
    const look = BUILTIN_TEXTURE_LIBRARY[byName]
    // Un color liso de otro tono con nombre genérico («Gris» claro, «Blanco» hueso) conserva su hex.
    if (look.finish === 'smooth' && hex && deltaE(hex, look.hex) > 14) return flatAppearance(hex, 'name')
    return builtinAppearance(byName, hex, sources, 'name')
  }
  if (hex && looksLikeWood(hex)) return builtinAppearance(nearestBuiltin(hex, 'woodgrain'), hex, sources, 'hex')
  if (hex && luminanceOf(hex) > 0.82 && hsl(hex).s < 0.3) return builtinAppearance('white_9016', hex, sources, 'hex')
  if (hex) return flatAppearance(hex, 'hex')
  return builtinAppearance('white_9016', undefined, sources, 'default')
}

/** Apariencia de un color por id dentro de un catálogo (con respaldo por nombre del id). */
export function appearanceForColorId(colorId: string | undefined, colors: readonly ColorInput[] | undefined, sources?: TextureSources): ColorAppearance {
  if (!colorId) return resolveColorAppearance(undefined, sources)
  const color = colors?.find((c) => c.id === colorId)
  if (color) return resolveColorAppearance(color, sources)
  const byName = classifyColorName(colorId)
  return byName ? builtinAppearance(byName, undefined, sources, 'name') : resolveColorAppearance(undefined, sources)
}

/** Nombre visible de la apariencia (el del catálogo manda; si no, el del foliado integrado). */
export function appearanceLabel(appearance: ColorAppearance, color: Pick<Color, 'name'> | undefined, locale: Locale = 'es'): string {
  if (color?.name) return color.name
  return appearance.source?.kind === 'builtin' ? builtinTextureName(appearance.source.id, locale) : appearance.hex
}

/** Foliados integrados que necesita un conjunto de apariencias (para precargar). */
export function builtinIdsOf(appearances: readonly ColorAppearance[]): BuiltinTextureId[] {
  const ids = new Set<BuiltinTextureId>()
  for (const a of appearances) if (a.source?.kind === 'builtin') ids.add(a.source.id)
  return [...ids]
}
