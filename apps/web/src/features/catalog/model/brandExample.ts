/**
 * Ejemplos en vivo para «Mis precios» de una marca, calculados con el motor real: cuánto cuesta
 * una ventana típica con precios de lista y con tus descuentos, y cómo el despunte y el disco
 * cambian lo que sale de una barra.
 */
import {
  computeBom,
  createDesign,
  DEFAULT_CUT,
  formatSize,
  optimizeCuts,
  priceItem,
  TYPOLOGIES,
  type BrandSettings,
  type Catalog,
  type Id,
  type ItemPriceDetail,
  type Line,
  type PricingSettings,
  type TypologyId,
} from '@framezen/engine'

const COMPLETENESS_RANK: Record<NonNullable<Line['completeness']>, number> = { verified: 0, complete: 1, partial: 2 }

/** La línea más confiable de la marca (verificada antes que completa; practicable antes que corredera). */
export function pickExampleLine(catalog: Pick<Catalog, 'lines'>, brandId: Id): Line | undefined {
  return catalog.lines
    .filter((l) => l.brandId === brandId)
    .sort(
      (a, b) =>
        COMPLETENESS_RANK[a.completeness ?? 'partial'] - COMPLETENESS_RANK[b.completeness ?? 'partial'] ||
        Number(a.kind === 'sliding') - Number(b.kind === 'sliding') ||
        a.name.localeCompare(b.name, 'es'),
    )[0]
}

const PREFERRED: Record<Line['kind'], TypologyId[]> = {
  casement: ['tilt_turn', 'casement', 'fixed_casement', 'fixed'],
  sliding: ['sliding_2', 'sliding_2_fixed', 'sliding_3'],
}

export function exampleTypology(line: Pick<Line, 'kind' | 'typologyIds'>): TypologyId {
  const own = new Set(line.typologyIds)
  return PREFERRED[line.kind].find((t) => own.has(t)) ?? (line.typologyIds[0] as TypologyId | undefined) ?? PREFERRED[line.kind][0]
}

/** Vidrio para los ejemplos: el predeterminado del taller, o el primer termopanel con precio. */
export function exampleGlassId(catalog: Pick<Catalog, 'glass'>, preferred?: Id): Id | undefined {
  if (preferred && catalog.glass.some((g) => g.id === preferred)) return preferred
  // El termopanel más común del rubro (4+12+4) da ejemplos que el taller reconoce.
  const common = catalog.glass.find((g) => g.pricePerM2 > 0 && /(^|\D)4\s*[+-]\s*12\s*[+-]\s*4(\D|$)/.test(g.name))
  if (common) return common.id
  return (
    catalog.glass.find((g) => g.kind === 'dvh' && g.pricePerM2 > 0)?.id ??
    catalog.glass.find((g) => g.pricePerM2 > 0)?.id ??
    catalog.glass[0]?.id
  )
}

export interface BrandExample {
  title: string
  lineName: string
  colorName: string
  glassName: string
  /** Precio con lista completa (sin descuentos ni ajuste de margen de la marca). */
  list: ItemPriceDetail
  /** Precio con los ajustes del borrador. */
  mine: ItemPriceDetail
}

export function neutralSettings(settings: BrandSettings): BrandSettings {
  const { marginAdjust: _ignored, ...rest } = settings
  return { ...rest, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } }
}

export function brandExample(
  catalog: Catalog,
  settings: BrandSettings,
  pricing: Partial<PricingSettings>,
  defaults: { glassId?: Id; colorId?: Id } = {},
): BrandExample | null {
  const line = pickExampleLine(catalog, settings.brandId)
  if (!line) return null
  const typologyId = exampleTypology(line)
  const typology = TYPOLOGIES.find((t) => t.id === typologyId)
  const width = line.kind === 'sliding' ? 1500 : 1200
  const height = 1200
  const colorId = defaults.colorId && line.colorIds.includes(defaults.colorId) ? defaults.colorId : (line.colorIds[0] ?? catalog.colors[0]?.id ?? 'blanco')
  const glassId = exampleGlassId(catalog, defaults.glassId)
  if (!glassId) return null
  try {
    const design = createDesign(typologyId, { lineId: line.id, width, height, colorId, glassId })
    const bom = computeBom(design, catalog)
    const list = priceItem(bom, design, catalog, pricing, { brandSettings: neutralSettings(settings) })
    const mine = priceItem(bom, design, catalog, pricing, { brandSettings: settings })
    return {
      title: `${typology?.name ?? 'Ventana'} ${formatSize(width, height)}`,
      lineName: line.name,
      colorName: catalog.colors.find((c) => c.id === colorId)?.name ?? colorId,
      glassName: catalog.glass.find((g) => g.id === glassId)?.name ?? '',
      list,
      mine,
    }
  } catch {
    return null
  }
}

export interface BarExample {
  barLength: number
  piece: number
  trim: number
  kerf: number
  /** Piezas que caben en una barra. */
  pieces: number
  /** Sobrante al final de la barra. */
  remainder: number
  /** Aprovechamiento de la barra (%). */
  yieldPct: number
  /** Posición de cada pieza desde el inicio de la barra. */
  offsets: number[]
}

/** Cuántas piezas iguales salen de una barra con este despunte y este disco (optimizador real). */
export function barExample(trim: number, kerf: number, options: { piece?: number; barLength?: number } = {}): BarExample {
  const piece = options.piece ?? 1400
  const barLength = options.barLength ?? DEFAULT_CUT.barLength
  const plan = optimizeCuts([{ key: 'ejemplo', length: piece, qty: 12, label: 'ejemplo' }], {
    barLength,
    kerf: Math.max(0, kerf),
    trimStart: Math.max(0, trim),
    trimEnd: 0,
    minReusable: DEFAULT_CUT.minReusable,
  })
  const bar = plan.groups[0]?.bars[0]
  const offsets = bar?.cuts.map((c) => c.offset) ?? []
  return {
    barLength,
    piece,
    trim: Math.max(0, trim),
    kerf: Math.max(0, kerf),
    pieces: bar?.cuts.length ?? 0,
    remainder: bar?.remainder ?? barLength,
    yieldPct: bar?.yieldPct ?? 0,
    offsets,
  }
}
