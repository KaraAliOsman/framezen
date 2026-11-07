/**
 * Composiciones de cotización: cada una fija su retícula y su escala tipográfica. El CSS propio de cada
 * una vive en `css.ts` bajo `.dkd--c-<id>`; aquí solo está lo que la paginación necesita saber.
 */
import type { DocComposition, DocTheme } from '@dekopen/shared'

export interface TypeScaleValues {
  body: number
  small: number
  label: number
  h3: number
  h2: number
  h1: number
  display: number
  figure: number
  lineHeight: number
}

export interface CompositionSpec {
  id: DocComposition
  /** Títulos de sección en la columna del margen y contenido a su derecha. */
  sideHeadings: boolean
  /** Ancho de la columna del margen (fracción del ancho útil). */
  sideRatio: number
  /** Capítulos numerados. */
  numbered: boolean
  /** Las cuotas van en la columna libre junto a los valores, no como capítulo aparte. */
  payBesideTotals?: boolean
  /** Escala del diseño (px a 96 dpi: 13,33 px = 10 pt). */
  scale: TypeScaleValues
  /** `typeScale` con el que el diseño usa su escala tal cual; otro valor la agranda o achica. */
  baseScale: DocTheme['typeScale']
}

export const COMPOSITIONS: Readonly<Record<DocComposition, CompositionSpec>> = {
  atelier: {
    id: 'atelier',
    sideHeadings: true,
    sideRatio: 1 / 3,
    numbered: false,
    scale: { body: 13.5, small: 11.5, label: 11, h3: 15, h2: 22, h1: 34, display: 60, figure: 46, lineHeight: 1.5 },
    baseScale: 'editorial',
  },
  corporativa: {
    id: 'corporativa',
    sideHeadings: false,
    sideRatio: 0,
    numbered: true,
    payBesideTotals: true,
    scale: { body: 13, small: 11.25, label: 10.5, h3: 13.5, h2: 18, h1: 28, display: 44, figure: 30, lineHeight: 1.5 },
    baseScale: 'standard',
  },
  obra: {
    id: 'obra',
    sideHeadings: false,
    sideRatio: 0,
    numbered: false,
    scale: { body: 11.75, small: 10.75, label: 10, h3: 12, h2: 14, h1: 21, display: 30, figure: 24, lineHeight: 1.32 },
    baseScale: 'compact',
  },
  hogar: {
    id: 'hogar',
    sideHeadings: false,
    sideRatio: 0,
    numbered: false,
    scale: { body: 14, small: 12.25, label: 11.5, h3: 16.5, h2: 25, h1: 36, display: 48, figure: 44, lineHeight: 1.5 },
    baseScale: 'standard',
  },
  memoria: {
    id: 'memoria',
    sideHeadings: false,
    sideRatio: 0,
    numbered: true,
    payBesideTotals: true,
    scale: { body: 11.75, small: 10.75, label: 10, h3: 13, h2: 15, h1: 22, display: 34, figure: 26, lineHeight: 1.36 },
    baseScale: 'compact',
  },
}

export function compositionOf(theme: Pick<DocTheme, 'composition'>): CompositionSpec {
  return COMPOSITIONS[theme.composition ?? 'corporativa'] ?? COMPOSITIONS.corporativa
}
