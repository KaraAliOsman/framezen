/**
 * Tema de una plantilla (`DocTemplate.theme`, ya validado y con contraste reparado) → variables CSS de
 * confianza. Nunca se concatena texto de la plantilla en CSS: sólo hex validados, ids de la lista
 * cerrada de fuentes y valores numéricos de tablas propias.
 */
import type { CSSProperties } from 'react'
import { DOC_FONTS, fontStack, mixHex, ensureContrast, contrastRatio, normalizeHex, type DocFontId, type DocTheme } from '@dekopen/shared'
import type { PageGeometry } from './page'
import { compositionOf, type CompositionSpec, type TypeScaleValues } from './composition'

export type { TypeScaleValues }

/** Escalas tipográficas (px a 96 dpi; 12,5 px ≈ 9,4 pt). */
export const TYPE_SCALE_VALUES: Readonly<Record<DocTheme['typeScale'], TypeScaleValues>> = {
  compact: { body: 11.5, small: 10.5, label: 9.5, h3: 13, h2: 17, h1: 25, display: 38, figure: 22, lineHeight: 1.42 },
  standard: { body: 12.5, small: 11, label: 10, h3: 14.5, h2: 20, h1: 30, display: 46, figure: 28, lineHeight: 1.5 },
  editorial: { body: 13.5, small: 11.5, label: 10.5, h3: 16, h2: 24, h1: 36, display: 58, figure: 32, lineHeight: 1.55 },
}

export interface DensityValues {
  /** Aire entre bloques de una misma sección. */
  gap: number
  /** Aire antes de una sección nueva. */
  section: number
  /** Relleno de paneles y bandas. */
  pad: number
  /** Relleno vertical de filas. */
  row: number
}

export const DENSITY_VALUES: Readonly<Record<DocTheme['density'], DensityValues>> = {
  compact: { gap: 10, section: 22, pad: 12, row: 6 },
  comfortable: { gap: 14, section: 30, pad: 16, row: 9 },
  airy: { gap: 18, section: 40, pad: 20, row: 12 },
}

export const RADIUS_VALUES: Readonly<Record<DocTheme['radius'], number>> = { none: 0, small: 2, medium: 5, large: 10 }

/**
 * Ancho medio de un carácter (en em) por familia: con esto la paginación de respaldo estima líneas
 * de texto sin medir (la medición real en el navegador/Chromium corrige lo que falte).
 */
export const FONT_WIDTH: Readonly<Record<DocFontId, number>> = {
  'hanken-grotesk': 0.5,
  'public-sans': 0.53,
  archivo: 0.5,
  'source-sans-3': 0.46,
  overpass: 0.5,
  'schibsted-grotesk': 0.52,
  'inter-tight': 0.49,
  'instrument-sans': 0.5,
  'source-serif-4': 0.49,
  literata: 0.52,
  'jetbrains-mono': 0.6,
}

export interface ResolvedThemeTokens {
  palette: Record<'paper' | 'surface' | 'ink' | 'muted' | 'rule' | 'accent' | 'onAccent' | 'strong' | 'onStrong', string>
  /** Acento legible como texto chico sobre el papel (≥ 4,5:1). */
  accentInk: string
  accentSoft: string
  accentLine: string
  ruleStrong: string
  faint: string
  ink2: string
  scale: TypeScaleValues
  density: DensityValues
  radius: number
  fonts: { heading: DocFontId; body: DocFontId; mono: DocFontId }
  headingOptical: number
  composition: CompositionSpec
}

/** Escala de la composición, proporcional a la `typeScale` elegida en el tema. */
function compositionScale(comp: CompositionSpec, typeScale: DocTheme['typeScale']): TypeScaleValues {
  const wanted = TYPE_SCALE_VALUES[typeScale] ?? TYPE_SCALE_VALUES.standard
  const k = wanted.body / TYPE_SCALE_VALUES[comp.baseScale].body
  if (k === 1) return comp.scale
  const { lineHeight, ...sizes } = comp.scale
  return { ...(Object.fromEntries(Object.entries(sizes).map(([key, v]) => [key, Math.round(v * k * 100) / 100])) as Omit<TypeScaleValues, 'lineHeight'>), lineHeight }
}

export function resolveThemeTokens(theme: DocTheme): ResolvedThemeTokens {
  const p = theme.palette
  const hex = (v: string, fb: string) => normalizeHex(v) ?? fb
  const palette = {
    paper: hex(p.paper, '#FFFFFF'),
    surface: hex(p.surface, '#F3F3F2'),
    ink: hex(p.ink, '#1F2224'),
    muted: hex(p.muted, '#55595C'),
    rule: hex(p.rule, '#D3D5D6'),
    accent: hex(p.accent, '#245B58'),
    onAccent: hex(p.onAccent, '#FFFFFF'),
    strong: hex(p.strong, '#1F2224'),
    onStrong: hex(p.onStrong, '#FFFFFF'),
  }
  const faintCandidate = mixHex(palette.muted, palette.paper, 0.22)
  const fonts = theme.fonts as ResolvedThemeTokens['fonts']
  const comp = compositionOf(theme)
  return {
    palette,
    accentInk: ensureContrast(palette.accent, palette.paper, 4.5),
    accentSoft: mixHex(palette.accent, palette.paper, 0.9),
    accentLine: mixHex(palette.accent, palette.paper, 0.62),
    ruleStrong: mixHex(palette.rule, palette.ink, 0.32),
    faint: contrastRatio(faintCandidate, palette.paper) >= 3.2 ? faintCandidate : palette.muted,
    ink2: mixHex(palette.ink, palette.muted, 0.45),
    scale: compositionScale(comp, theme.typeScale),
    density: DENSITY_VALUES[theme.density] ?? DENSITY_VALUES.comfortable,
    radius: RADIUS_VALUES[theme.radius] ?? 0,
    fonts,
    headingOptical: 1,
    composition: comp,
  }
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`

/** Variables CSS del tema y de la página (se aplican en línea en la raíz del documento). */
export function templateThemeVars(theme: DocTheme, page: PageGeometry): CSSProperties {
  const k = resolveThemeTokens(theme)
  const s = k.scale
  const o = k.headingOptical
  const d = k.density
  const ruleW = theme.rules === 'none' ? 0 : theme.rules === 'strong' ? 1 : 0.75
  const keyW = theme.rules === 'none' ? 0 : theme.rules === 'strong' ? 2 : 1
  const headingCat = DOC_FONTS[k.fonts.heading]?.category ?? 'sans'
  const tracking = headingCat === 'serif' ? '-0.008em' : theme.headingWeight >= 700 ? '-0.018em' : '-0.014em'
  const upper = theme.labelCase === 'uppercase'
  return {
    '--dk-paper': k.palette.paper,
    '--dk-surface': k.palette.surface,
    '--dk-ink': k.palette.ink,
    '--dk-ink-2': k.ink2,
    '--dk-muted': k.palette.muted,
    '--dk-faint': k.faint,
    '--dk-rule': k.palette.rule,
    '--dk-rule-strong': k.ruleStrong,
    '--dk-accent': k.palette.accent,
    '--dk-accent-ink': k.accentInk,
    '--dk-accent-soft': k.accentSoft,
    '--dk-accent-line': k.accentLine,
    '--dk-on-accent': k.palette.onAccent,
    '--dk-strong': k.palette.strong,
    '--dk-on-strong': k.palette.onStrong,
    '--dk-font-heading': fontStack(k.fonts.heading),
    '--dk-font-body': fontStack(k.fonts.body),
    '--dk-side': px(Math.round(page.contentWidth * k.composition.sideRatio)),
    '--dk-heading-weight': String(theme.headingWeight),
    '--dk-heading-tracking': tracking,
    '--dk-fs-body': px(s.body),
    '--dk-fs-small': px(s.small),
    '--dk-fs-label': px(s.label),
    '--dk-fs-h3': px(s.h3),
    '--dk-fs-h2': px(s.h2 * o),
    '--dk-fs-h1': px(s.h1 * o),
    '--dk-fs-display': px(s.display * o),
    '--dk-fs-figure': px(s.figure * o),
    '--dk-lh': String(s.lineHeight),
    '--dk-gap': px(d.gap),
    '--dk-section': px(d.section),
    '--dk-pad': px(d.pad),
    '--dk-row': px(d.row),
    '--dk-radius': px(k.radius),
    '--dk-radius-s': px(Math.min(k.radius, 3)),
    '--dk-rule-w': px(ruleW),
    '--dk-key-w': px(keyW),
    '--dk-label-transform': upper ? 'uppercase' : 'none',
    '--dk-label-tracking': upper ? '0.07em' : '0.005em',
    '--dk-label-weight': upper ? '600' : '500',
    '--dk-page-w': px(page.width),
    '--dk-page-h': px(page.height),
    '--dk-m-top': px(page.margins.top),
    '--dk-m-right': px(page.margins.right),
    '--dk-m-bottom': px(page.margins.bottom),
    '--dk-m-left': px(page.margins.left),
  } as CSSProperties
}

/** Fuentes que usa un tema (para incrustarlas en el PDF o cargarlas en la vista previa). */
export function themeFontIds(theme: DocTheme): DocFontId[] {
  return [...new Set([theme.fonts.heading, theme.fonts.body] as DocFontId[])]
}
