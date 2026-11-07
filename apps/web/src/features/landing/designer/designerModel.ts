import { SAMPLE_CATALOG } from '@dekopen/catalog'
import {
  computeLayout,
  createDesign,
  type Catalog,
  type Color,
  type Glass,
  type Layout,
  type Line,
  type TypologyId,
  type WindowDesign,
} from '@dekopen/engine'

/** Las cinco tipologías del mini diseñador de la portada. */
export type HeroTypology = Extract<TypologyId, 'fixed' | 'casement' | 'tilt_turn' | 'sliding_2' | 'door'>

export interface HeroTypologyOption {
  id: HeroTypology
  /** Medida con la que parte al elegirla. */
  defaultSize: { width: number; height: number }
  limits: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
}

const WINDOW_LIMITS = { minWidth: 300, maxWidth: 3000, minHeight: 300, maxHeight: 2600 }

export const HERO_TYPOLOGIES: HeroTypologyOption[] = [
  { id: 'fixed', defaultSize: { width: 1200, height: 1000 }, limits: WINDOW_LIMITS },
  { id: 'casement', defaultSize: { width: 700, height: 1100 }, limits: { ...WINDOW_LIMITS, maxWidth: 1400 } },
  { id: 'tilt_turn', defaultSize: { width: 800, height: 1200 }, limits: { ...WINDOW_LIMITS, maxWidth: 1400 } },
  {
    id: 'sliding_2',
    defaultSize: { width: 1800, height: 1200 },
    limits: { minWidth: 800, maxWidth: 4000, minHeight: 500, maxHeight: 2600 },
  },
  { id: 'door', defaultSize: { width: 900, height: 2100 }, limits: { minWidth: 600, maxWidth: 1300, minHeight: 1800, maxHeight: 2700 } },
]

export const DEFAULT_TYPOLOGY: HeroTypology = 'sliding_2'

export function typologyOption(id: HeroTypology): HeroTypologyOption {
  return HERO_TYPOLOGIES.find((option) => option.id === id) ?? HERO_TYPOLOGIES[0]
}

export function isWithinLimits(option: HeroTypologyOption, width: number, height: number): boolean {
  const { minWidth, maxWidth, minHeight, maxHeight } = option.limits
  return width >= minWidth && width <= maxWidth && height >= minHeight && height <= maxHeight
}

/** Primera línea del catálogo que fabrica la tipología (si ninguna la declara, la primera del tipo correcto). */
export function pickLine(catalog: Catalog, typology: HeroTypology): Line | undefined {
  const kind = typology === 'sliding_2' ? 'sliding' : 'casement'
  return (
    catalog.lines.find((line) => line.kind === kind && line.typologyIds.includes(typology)) ??
    catalog.lines.find((line) => line.kind === kind) ??
    catalog.lines[0]
  )
}

/** Vidrio de ejemplo: el primer termopanel (DVH) del catálogo; si no hay, el primero. */
export function pickGlass(catalog: Catalog): Glass | undefined {
  return catalog.glass.find((glass) => glass.kind === 'dvh') ?? catalog.glass[0]
}

/** Hasta 4 colores que ofrece la línea, en el orden del catálogo. */
export function lineColors(catalog: Catalog, line: Line | undefined, max = 4): Color[] {
  if (!line) return catalog.colors.slice(0, max)
  const colors = line.colorIds
    .map((id) => catalog.colors.find((color) => color.id === id))
    .filter((color): color is Color => Boolean(color))
  return (colors.length > 0 ? colors : catalog.colors).slice(0, max)
}

export interface ExampleInput {
  typology: HeroTypology
  width: number
  height: number
  colorId?: string
}

export interface ExampleResult {
  design: WindowDesign
  layout: Layout
  line: Line | undefined
  color: Color | undefined
  glass: Glass | undefined
  colors: Color[]
  /** m² de carpintería (cota). */
  area: number
}

export function buildExample(input: ExampleInput, catalog: Catalog = SAMPLE_CATALOG): ExampleResult {
  const line = pickLine(catalog, input.typology)
  const glass = pickGlass(catalog)
  const colors = lineColors(catalog, line)
  const color = colors.find((candidate) => candidate.id === input.colorId) ?? colors[0]
  const design = createDesign(input.typology, {
    lineId: line?.id ?? '',
    width: input.width,
    height: input.height,
    colorId: color?.id ?? '',
    glassId: glass?.id ?? '',
  })
  const layout = computeLayout(design, catalog)
  return { design, layout, line, color, glass, colors, area: (input.width * input.height) / 1_000_000 }
}

/** Como buildExample, pero nunca lanza: si el motor no puede, devuelve null. */
export function safeExample(input: ExampleInput, catalog: Catalog = SAMPLE_CATALOG): ExampleResult | null {
  try {
    return buildExample(input, catalog)
  } catch {
    return null
  }
}
