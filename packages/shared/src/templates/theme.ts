/**
 * Tema de documento: tokens acotados que el renderizador compila a variables CSS de confianza.
 * Nunca acepta CSS, `url()`, gradientes ni nombres de fuente libres.
 */
import { z } from 'zod'
import { HexColorSchema } from './fields'
import { contrastRatio, ensureContrast, formatContrast, normalizeHex, readableOn } from './color'
import {
  DOC_FONTS,
  DOC_FONT_IDS,
  currentDocFontId,
  fontAllows,
  nearestFontWeight,
  type DocFontId,
  type DocFontRole,
} from './fonts'
import { issue, type DocIssue, type DocIssuePath, type DocZodParams } from './issues'

export const PALETTE_ROLES = ['paper', 'surface', 'ink', 'muted', 'rule', 'accent', 'onAccent', 'strong', 'onStrong'] as const
export type PaletteRole = (typeof PALETTE_ROLES)[number]

export const DENSITIES = ['compact', 'comfortable', 'airy'] as const
export const TYPE_SCALES = ['compact', 'standard', 'editorial'] as const
export const RADII = ['none', 'small', 'medium', 'large'] as const
export const RULE_STYLES = ['none', 'hairline', 'strong'] as const
export const ACCENT_USAGES = ['minimal', 'headings', 'bands', 'bold'] as const
export const DRAWING_STYLES = ['realistic', 'technical'] as const
export const IMAGE_TREATMENTS = ['natural', 'rounded', 'framed', 'bleed', 'monochrome'] as const
export const LABEL_CASES = ['normal', 'uppercase'] as const
/**
 * Retícula y composición de la página: el carácter de cada diseño (dónde van los títulos, cómo se
 * arma la ficha de una ventana, el peso de las planillas). Sale del diseño predefinido, no de adornos.
 */
export const DOC_COMPOSITIONS = ['atelier', 'corporativa', 'obra', 'hogar', 'memoria'] as const

export type DocComposition = (typeof DOC_COMPOSITIONS)[number]
export type DocDensity = (typeof DENSITIES)[number]
export type DocTypeScale = (typeof TYPE_SCALES)[number]
export type DocRadius = (typeof RADII)[number]
export type DocRuleStyle = (typeof RULE_STYLES)[number]
export type DocAccentUsage = (typeof ACCENT_USAGES)[number]
export type DocDrawingStyle = (typeof DRAWING_STYLES)[number]
export type DocImageTreatment = (typeof IMAGE_TREATMENTS)[number]

/** Radio recomendado en px por token (guía para el renderizador). */
export const DOC_RADIUS_PX: Readonly<Record<DocRadius, number>> = { none: 0, small: 2, medium: 4, large: 8 }

export const PaletteSchema = z.strictObject({
  /** Fondo de página. */
  paper: HexColorSchema,
  /** Fondo suave de paneles, tarjetas y bandas. */
  surface: HexColorSchema,
  /** Texto principal. */
  ink: HexColorSchema,
  /** Texto secundario (etiquetas, leyendas). */
  muted: HexColorSchema,
  /** Líneas y bordes (decorativo). */
  rule: HexColorSchema,
  /** Color de marca: títulos, cifras grandes, marcas y rellenos según `accentUsage`. */
  accent: HexColorSchema,
  /** Texto sobre rellenos de acento. */
  onAccent: HexColorSchema,
  /** Campo intenso (portadas y separadores oscuros). */
  strong: HexColorSchema,
  /** Texto sobre el campo intenso. */
  onStrong: HexColorSchema,
})
export type DocPalette = z.infer<typeof PaletteSchema>

const fontId = z.preprocess(currentDocFontId, z.enum(DOC_FONT_IDS))

export const ThemeFontsSchema = z.strictObject({ heading: fontId, body: fontId, mono: fontId })
export type DocThemeFonts = z.infer<typeof ThemeFontsSchema>

const weight = z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)])

const themeShape = {
  palette: PaletteSchema,
  fonts: ThemeFontsSchema,
  headingWeight: weight,
  labelCase: z.enum(LABEL_CASES),
  density: z.enum(DENSITIES),
  typeScale: z.enum(TYPE_SCALES),
  radius: z.enum(RADII),
  rules: z.enum(RULE_STYLES),
  accentUsage: z.enum(ACCENT_USAGES),
  drawingStyle: z.enum(DRAWING_STYLES),
  imageTreatment: z.enum(IMAGE_TREATMENTS),
  /** Sin dato: la de `corporativa`, la más neutra. */
  composition: z.enum(DOC_COMPOSITIONS).optional(),
}

/** Tema sin reglas cruzadas (para composición y esquemas parciales). */
export const ThemeBaseSchema = z.strictObject(themeShape)

export const ThemeSchema = ThemeBaseSchema.superRefine((theme, ctx) => {
  for (const i of themeIssues(theme)) {
    if (i.severity !== 'error') continue
    const params: DocZodParams = { docCode: i.code, docParams: i.params }
    ctx.addIssue({ code: 'custom', message: i.code, path: i.path, params })
  }
})

export type DocTheme = z.infer<typeof ThemeBaseSchema>

/** Ajuste parcial de tema (operaciones y ajustes por cotización). */
export const ThemePatchSchema = z.strictObject({
  palette: PaletteSchema.partial().optional(),
  fonts: ThemeFontsSchema.partial().optional(),
  headingWeight: weight.optional(),
  labelCase: z.enum(LABEL_CASES).optional(),
  density: z.enum(DENSITIES).optional(),
  typeScale: z.enum(TYPE_SCALES).optional(),
  radius: z.enum(RADII).optional(),
  rules: z.enum(RULE_STYLES).optional(),
  accentUsage: z.enum(ACCENT_USAGES).optional(),
  drawingStyle: z.enum(DRAWING_STYLES).optional(),
  imageTreatment: z.enum(IMAGE_TREATMENTS).optional(),
  composition: z.enum(DOC_COMPOSITIONS).optional(),
})
export type DocThemePatch = z.infer<typeof ThemePatchSchema>

export interface ContrastRule {
  fg: PaletteRole
  bg: PaletteRole
  min: number
  severity: 'error' | 'warning'
}

/**
 * Reglas WCAG 2.x: texto normal ≥ 4.5:1 (1.4.3); acento ≥ 3:1 frente al papel porque se usa en
 * títulos grandes, cifras y marcas gráficas (1.4.11); las líneas sólo deben verse (aviso).
 */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  { fg: 'ink', bg: 'paper', min: 4.5, severity: 'error' },
  { fg: 'ink', bg: 'surface', min: 4.5, severity: 'error' },
  { fg: 'muted', bg: 'paper', min: 4.5, severity: 'error' },
  { fg: 'muted', bg: 'surface', min: 4.5, severity: 'error' },
  { fg: 'accent', bg: 'paper', min: 3, severity: 'error' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, severity: 'error' },
  { fg: 'onStrong', bg: 'strong', min: 4.5, severity: 'error' },
  { fg: 'rule', bg: 'paper', min: 1.2, severity: 'warning' },
]

export interface ContrastCheck extends ContrastRule {
  ratio: number
  ok: boolean
}

export function checkPaletteContrast(palette: DocPalette): ContrastCheck[] {
  return CONTRAST_RULES.map((rule) => {
    const ratio = contrastRatio(palette[rule.fg], palette[rule.bg])
    return { ...rule, ratio, ok: ratio >= rule.min }
  })
}

export function paletteContrastIssues(palette: DocPalette, path: DocIssuePath = ['theme', 'palette']): DocIssue[] {
  return checkPaletteContrast(palette)
    .filter((c) => !c.ok)
    .map((c) => issue(c.severity, 'low_contrast', [...path, c.fg], { fg: c.fg, bg: c.bg, ratio: formatContrast(c.ratio), min: c.min }))
}

export interface RepairPaletteResult {
  palette: DocPalette
  /** Roles que se ajustaron. */
  changed: PaletteRole[]
}

const BACKGROUNDS: ReadonlySet<PaletteRole> = new Set(['paper'])

/**
 * Ajusta lo mínimo para cumplir todas las reglas. Prefiere mover el color de primer plano; si ese
 * rol está bloqueado (lo acaba de elegir la persona) mueve el fondo, salvo el papel, que nunca se
 * toca. Siempre converge: con negro o blanco cualquier fondo alcanza 4.5:1.
 */
export function repairPaletteContrast(input: DocPalette, options: { locked?: readonly PaletteRole[] } = {}): RepairPaletteResult {
  const locked = new Set(options.locked ?? [])
  const palette: DocPalette = { ...input }
  for (const role of PALETTE_ROLES) palette[role] = normalizeHex(palette[role]) ?? '#000000'
  const changed = new Set<PaletteRole>()
  for (let pass = 0; pass < 4; pass++) {
    let dirty = false
    for (const rule of CONTRAST_RULES) {
      if (contrastRatio(palette[rule.fg], palette[rule.bg]) >= rule.min) continue
      const moveBg = locked.has(rule.fg) && !locked.has(rule.bg) && !BACKGROUNDS.has(rule.bg)
      if (moveBg) {
        // Fondo de acento/intenso/superficie: acercarlo al lado opuesto del texto.
        palette[rule.bg] = ensureContrast(palette[rule.bg], palette[rule.fg], rule.min)
        changed.add(rule.bg)
      } else if (rule.fg === 'onAccent' || rule.fg === 'onStrong') {
        const best = readableOn(palette[rule.bg], palette.ink, palette.paper)
        palette[rule.fg] = contrastRatio(best, palette[rule.bg]) >= rule.min ? best : ensureContrast(palette[rule.fg], palette[rule.bg], rule.min)
        changed.add(rule.fg)
      } else {
        palette[rule.fg] = ensureContrast(palette[rule.fg], palette[rule.bg], rule.min)
        changed.add(rule.fg)
      }
      dirty = true
    }
    if (!dirty) break
  }
  return { palette, changed: PALETTE_ROLES.filter((r) => changed.has(r)) }
}

/** Problemas del tema: roles de fuente, pesos disponibles y contraste. */
export function themeIssues(theme: DocTheme, path: DocIssuePath = []): DocIssue[] {
  const out: DocIssue[] = []
  const roles: [keyof DocThemeFonts, DocFontRole][] = [
    ['heading', 'heading'],
    ['body', 'body'],
    ['mono', 'mono'],
  ]
  for (const [key, role] of roles) {
    const id = theme.fonts[key] as DocFontId
    if (!fontAllows(id, role)) out.push(issue('error', 'font_role', [...path, 'fonts', key], { font: id, role }))
  }
  const heading = theme.fonts.heading as DocFontId
  const nearest = nearestFontWeight(heading, theme.headingWeight)
  if (nearest !== theme.headingWeight) {
    out.push(issue('error', 'font_weight', [...path, 'headingWeight'], { font: heading, weight: theme.headingWeight, nearest }))
  }
  out.push(...paletteContrastIssues(theme.palette, [...path, 'palette']))
  return out
}

/** Elige la fuente válida más parecida para un rol (misma categoría si es posible). */
export function fallbackFontFor(role: DocFontRole, like?: DocFontId): DocFontId {
  const candidates = DOC_FONT_IDS.filter((id) => fontAllows(id, role))
  if (like) {
    const same = candidates.find((id) => DOC_FONTS[id].category === DOC_FONTS[like].category)
    if (same) return same
  }
  return role === 'mono' ? 'jetbrains-mono' : candidates[0]
}

export interface RepairThemeResult {
  theme: DocTheme
  issues: DocIssue[]
}

/** Corrige roles de fuente, peso y contraste (siempre devuelve un tema válido). */
export function repairTheme(theme: DocTheme, options: { locked?: readonly PaletteRole[]; path?: DocIssuePath } = {}): RepairThemeResult {
  const path = options.path ?? ['theme']
  const out: DocTheme = { ...theme, palette: { ...theme.palette }, fonts: { ...theme.fonts } }
  const issues: DocIssue[] = []
  const roles: [keyof DocThemeFonts, DocFontRole][] = [
    ['heading', 'heading'],
    ['body', 'body'],
    ['mono', 'mono'],
  ]
  for (const [key, role] of roles) {
    const id = out.fonts[key] as DocFontId
    if (!fontAllows(id, role)) {
      const next = fallbackFontFor(role, id)
      issues.push(issue('warning', 'font_role', [...path, 'fonts', key], { font: id, role }))
      out.fonts[key] = next
    }
  }
  const nearest = nearestFontWeight(out.fonts.heading as DocFontId, out.headingWeight)
  if (nearest !== out.headingWeight) {
    issues.push(issue('info', 'font_weight', [...path, 'headingWeight'], { font: out.fonts.heading, weight: out.headingWeight, nearest }))
    out.headingWeight = nearest
  }
  const repaired = repairPaletteContrast(out.palette, { locked: options.locked })
  for (const role of repaired.changed) issues.push(issue('warning', 'contrast_repaired', [...path, 'palette', role], { role }))
  out.palette = repaired.palette
  return { theme: out, issues }
}

/** Aplica un ajuste parcial (sin validar ni reparar). */
export function applyThemePatch(theme: DocTheme, patch: DocThemePatch): DocTheme {
  const out: DocTheme = { ...theme, palette: { ...theme.palette }, fonts: { ...theme.fonts } }
  if (patch.palette) for (const role of PALETTE_ROLES) if (patch.palette[role] !== undefined) out.palette[role] = normalizeHex(patch.palette[role]) ?? out.palette[role]
  if (patch.fonts) {
    if (patch.fonts.heading) out.fonts.heading = patch.fonts.heading
    if (patch.fonts.body) out.fonts.body = patch.fonts.body
    if (patch.fonts.mono) out.fonts.mono = patch.fonts.mono
  }
  const scalar = ['headingWeight', 'labelCase', 'density', 'typeScale', 'radius', 'rules', 'accentUsage', 'drawingStyle', 'imageTreatment'] as const
  for (const key of scalar) {
    const v = patch[key]
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  return out
}
