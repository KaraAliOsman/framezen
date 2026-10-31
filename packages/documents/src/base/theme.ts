import type { CSSProperties } from 'react'
import type { DocumentPrefs } from '@framezen/shared'
import { ensureContrast, isHex, mix, readableOn, toHex, parseHex } from './color'

export type DocFont = 'instrument' | 'serif' | 'grotesk'
export type DocPaper = 'letter' | 'a4'

export interface DocTheme {
  /** Color de marca del taller (#RRGGBB). */
  accent: string
  font: DocFont
  paper: DocPaper
}

export const DEFAULT_ACCENT = '#2747C2'

export const DEFAULT_THEME: DocTheme = { accent: DEFAULT_ACCENT, font: 'instrument', paper: 'letter' }

/** Tema a partir de las preferencias de documentos y el color de la organización. */
export function themeFromPrefs(prefs: Pick<DocumentPrefs, 'font' | 'paper' | 'accent'>, orgAccent?: string): DocTheme {
  const accent = isHex(prefs.accent) ? prefs.accent : isHex(orgAccent) ? orgAccent : DEFAULT_ACCENT
  return { accent: toHex(parseHex(accent)), font: prefs.font ?? 'instrument', paper: prefs.paper ?? 'letter' }
}

/** Tamaño de página en px CSS (96 dpi), igual en pantalla y en Chromium. */
export const PAPER_SIZE: Record<DocPaper, { width: number; height: number; css: string; label: string }> = {
  letter: { width: 816, height: 1056, css: 'letter', label: 'Carta' },
  a4: { width: 794, height: 1123, css: 'A4', label: 'A4' },
}

/** Márgenes interiores de la página (px). */
export const PAGE_MARGIN = { top: 52, right: 56, bottom: 40, left: 56 }

/** Alto útil para contenido (descontando márgenes y pie). */
export function pageContentHeight(paper: DocPaper): number {
  return PAPER_SIZE[paper].height - PAGE_MARGIN.top - PAGE_MARGIN.bottom - FOOTER_HEIGHT
}

export function pageContentWidth(paper: DocPaper): number {
  return PAPER_SIZE[paper].width - PAGE_MARGIN.left - PAGE_MARGIN.right
}

export const FOOTER_HEIGHT = 28

export const FONT_STACKS: Record<'instrument' | 'fraunces' | 'interTight', string> = {
  // Inter Tight completa los signos que Instrument Sans no trae (², ³, ½): sin depender del sistema.
  instrument: "'Instrument Sans Variable', 'Instrument Sans', 'Inter Tight Variable', ui-sans-serif, system-ui, sans-serif",
  fraunces: "'Fraunces Variable', 'Fraunces', ui-serif, Georgia, serif",
  interTight: "'Inter Tight Variable', 'Inter Tight', ui-sans-serif, system-ui, sans-serif",
}

/** Fuente de titulares y de texto según la elección del taller. */
export function themeFonts(font: DocFont): { display: string; text: string } {
  switch (font) {
    case 'serif':
      return { display: FONT_STACKS.fraunces, text: FONT_STACKS.instrument }
    case 'grotesk':
      return { display: FONT_STACKS.interTight, text: FONT_STACKS.interTight }
    default:
      return { display: FONT_STACKS.instrument, text: FONT_STACKS.instrument }
  }
}

/** Variables CSS del tema (se aplican inline en la raíz del documento). */
export function themeVars(theme: DocTheme): CSSProperties {
  const accent = toHex(parseHex(theme.accent, DEFAULT_ACCENT))
  const fonts = themeFonts(theme.font)
  const size = PAPER_SIZE[theme.paper] ?? PAPER_SIZE.letter
  return {
    '--fzd-accent': accent,
    '--fzd-accent-ink': ensureContrast(accent, '#FFFFFF', 4.5),
    '--fzd-accent-on': readableOn(accent),
    '--fzd-accent-soft': mix(accent, '#FFFFFF', 0.93),
    '--fzd-accent-line': mix(accent, '#FFFFFF', 0.7),
    '--fzd-display': fonts.display,
    '--fzd-text': fonts.text,
    '--fzd-display-weight': theme.font === 'serif' ? '500' : '600',
    '--fzd-display-tracking': theme.font === 'serif' ? '-0.01em' : theme.font === 'grotesk' ? '-0.025em' : '-0.015em',
    '--fzd-page-w': `${size.width}px`,
    '--fzd-page-h': `${size.height}px`,
  } as CSSProperties
}

/** Variables del tema serializadas para CSS (respaldo cuando no hay estilo inline). */
export function themeVarsCss(theme: DocTheme): string {
  return Object.entries(themeVars(theme))
    .map(([key, value]) => `${key}: ${String(value)};`)
    .join(' ')
}
