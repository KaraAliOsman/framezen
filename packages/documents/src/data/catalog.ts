/**
 * Datos del catálogo de productos (CatalogDocData) a partir del catálogo efectivo y los ajustes
 * de la organización. Puro y determinista: lo usan la vista previa de la web (/documentos) y el
 * servidor para el PDF (GET /api/catalog/pdf), así ambos muestran exactamente lo mismo.
 *
 * - Una entrada por línea (en el orden del catálogo), con sus tipologías dibujadas por el motor.
 * - «Desde $X/m²» = precio neto del motor (como en una cotización real) ÷ área, hacia arriba a $100.
 *   Si al precio le faltan datos (perfiles o herrajes sin precio, perfil que la línea no tiene…)
 *   no se publica: el cliente vería más barata justo la línea incompleta. Va «Precio a consultar».
 * - Las líneas con datos parciales (`completeness: 'partial'`) se pueden dejar fuera
 *   (`includePartial: false`); la web las deja desmarcadas por defecto.
 * - Vidrios de cada línea: el del precio (el del taller) y otros termopaneles del mismo espesor.
 * - Nunca lanza: una tipología que la línea no puede dibujar se omite; una línea sin ninguna, también.
 */
import {
  computeLayout,
  createDesign,
  designName,
  evaluateQuote,
  getTypology,
  TYPOLOGIES,
  type Brand,
  type Catalog,
  type CutSettings,
  type Id,
  type Line,
  type PricingSettings,
  type TypologyId,
  type WindowDesign,
} from '@framezen/engine'
import type { DocumentPrefs, Org } from '@framezen/shared'
import type { DocOrg } from '../base/types'
import type { CatalogDocData, CatalogDocEntry, CatalogDocTypology } from '../sales/types'
import { mergeQuoteDocPrefs, quoteDocDate, quoteDocOrg } from './quote'

/** Tipologías por defecto cuando una línea no declara las suyas. */
export const CATALOG_DOC_DEFAULT_TYPOLOGIES: Readonly<Record<Line['kind'], readonly TypologyId[]>> = Object.freeze({
  casement: ['fixed', 'casement', 'tilt_turn', 'awning', 'casement_double', 'door'],
  sliding: ['sliding_2', 'sliding_2_fixed', 'sliding_4'],
})

/** Máximo de tipologías por línea en el folleto (en el orden en que las declara la línea). */
export const CATALOG_DOC_MAX_TYPOLOGIES = 12

/** Ajustes de la organización que usa el catálogo (OrgSettings sirve tal cual). */
export interface CatalogDocSettings {
  pricing?: Partial<PricingSettings>
  cut?: Partial<CutSettings>
  documents?: Partial<DocumentPrefs>
  /** Color y vidrio por defecto del taller (si la línea los admite). */
  defaults?: { lineId?: Id; colorId?: Id; glassId?: Id }
}

export interface BuildCatalogDocInput {
  org: DocOrg | Org
  catalog: Catalog
  settings: CatalogDocSettings
  /** Líneas a incluir (por defecto, todas las del catálogo). Se respeta el orden del catálogo. */
  lineIds?: readonly Id[]
  /** Máximo de tipologías por línea (por defecto 12). */
  maxTypologies?: number
  /** Título de portada (por defecto lo pone la plantilla: «Catálogo de ventanas y puertas»). */
  title?: string
  /** Fecha de emisión (ISO o Date; se lleva al día de Chile). Por defecto, hoy. */
  date?: string | Date
  /**
   * Incluir líneas con datos parciales (`completeness: 'partial'`). Por defecto sí (respeta la
   * lista que llega). Con `false` quedan fuera, salvo que no quede ninguna (nunca un folleto vacío).
   */
  includePartial?: boolean
}

const KNOWN_TYPOLOGIES = new Set<string>(TYPOLOGIES.map((t) => t.id))

/** Máximo de vidrios por línea en la ficha técnica (el del precio + alternativas). */
export const CATALOG_DOC_MAX_GLASS = 3

/**
 * Avisos del motor que dejan el precio incompleto (sale más barato de lo que es): materiales sin
 * precio, perfiles o líneas que no están, herrajes que no entran al costo.
 */
export function isIncompletePriceWarning(warning: { code: string; level?: string }): boolean {
  const code = warning.code ?? ''
  return (
    warning.level === 'error' ||
    code.startsWith('price_missing') ||
    code === 'profile_missing' ||
    code === 'reinforcement_profile_missing' ||
    code === 'line_missing' ||
    code === 'glass_missing' ||
    code === 'item_missing' ||
    code === 'color_missing' ||
    code === 'hardware_missing'
  )
}

/** ¿La línea tiene datos parciales? (sin el dato se considera completa). */
export function isPartialLine(line: Pick<Line, 'completeness'>): boolean {
  return line.completeness === 'partial'
}

/**
 * Precio «desde» por m² de un diseño, calculado con el motor (el mismo precio que daría una
 * cotización real), redondeado hacia arriba a $100. Sin precio, o si al precio le faltan datos
 * (avisos de precio o perfil faltante, ver `isIncompletePriceWarning`) → undefined.
 */
export function fromPricePerM2(design: WindowDesign, catalog: Catalog, settings: Pick<CatalogDocSettings, 'pricing' | 'cut'> = {}): number | undefined {
  try {
    const evaluation = evaluateQuote({ items: [{ id: 'x', ref: 'V1', qty: 1, design }], extras: [], discountPct: 0 }, catalog, settings.pricing ?? {}, { cut: settings.cut })
    const item = evaluation.items[0]
    if (!item) return undefined
    if ([...(item.price.warnings ?? []), ...(item.bom.warnings ?? [])].some(isIncompletePriceWarning)) return undefined
    const area = item.bom.area || (design.width * design.height) / 1_000_000
    const unit = item.price.unitNet ?? 0
    if (!(unit > 0) || !(area > 0)) return undefined
    return Math.ceil(unit / area / 100) * 100
  } catch {
    return undefined
  }
}

/** Color con que se dibuja la línea: el del taller si la línea lo tiene; si no, su primero. */
function lineColor(line: Line, catalog: Catalog, preferred?: Id): Id {
  if (preferred && line.colorIds.includes(preferred)) return preferred
  return line.colorIds[0] ?? catalog.colors[0]?.id ?? 'blanco'
}

/** Vidrio del taller; si no, el primero del catálogo. */
function catalogGlass(catalog: Catalog, preferred?: Id): Id {
  if (preferred && catalog.glass.some((g) => g.id === preferred)) return preferred
  return catalog.glass[0]?.id ?? 'vidrio'
}

/**
 * Vidrios que se muestran en la ficha: primero el del precio (el del taller) y después otros del
 * mismo tipo y espesor con precio (entran en el mismo junquillo), los de nombre más simple primero.
 */
export function catalogLineGlass(catalog: Catalog, glassId: Id, max = CATALOG_DOC_MAX_GLASS): Id[] {
  const base = catalog.glass.find((g) => g.id === glassId)
  if (!base) return []
  const priced = catalog.glass.filter((g) => g.id !== base.id && g.pricePerM2 > 0 && g.kind === base.kind)
  const same = priced.filter((g) => Math.abs((g.thickness ?? 0) - (base.thickness ?? 0)) < 0.5)
  const near = priced.filter((g) => !same.includes(g) && Math.abs((g.thickness ?? 0) - (base.thickness ?? 0)) <= 2)
  const order = (a: (typeof priced)[number], b: (typeof priced)[number]) => a.name.length - b.name.length || a.pricePerM2 - b.pricePerM2 || a.name.localeCompare(b.name)
  return [base.id, ...[...same].sort(order).map((g) => g.id), ...[...near].sort(order).map((g) => g.id)].slice(0, Math.max(1, Math.floor(max)))
}

/** Tipologías declaradas por la línea (las que el motor conoce) o las típicas de su sistema. */
export function catalogLineTypologies(line: Line, max = CATALOG_DOC_MAX_TYPOLOGIES): TypologyId[] {
  const declared = (line.typologyIds ?? []).filter((id): id is TypologyId => KNOWN_TYPOLOGIES.has(id))
  const ids = declared.length ? declared : (CATALOG_DOC_DEFAULT_TYPOLOGIES[line.kind] ?? CATALOG_DOC_DEFAULT_TYPOLOGIES.casement)
  return ids.slice(0, Math.max(1, Math.floor(max)))
}

/** Folleto con las líneas del catálogo, sus tipologías dibujadas y «desde $X/m²». */
export function buildCatalogDocData(input: BuildCatalogDocInput): CatalogDocData {
  const { catalog, settings } = input
  const wanted = input.lineIds ? new Set(input.lineIds) : null
  const chosen = (catalog.lines ?? []).filter((line) => !wanted || wanted.has(line.id))
  // Sin las parciales solo si se pide y si queda alguna: nunca un folleto vacío.
  const complete = input.includePartial === false ? chosen.filter((line) => !isPartialLine(line)) : chosen
  const lines = complete.length ? complete : chosen
  const glassId = catalogGlass(catalog, settings.defaults?.glassId)
  const glassIds = catalogLineGlass(catalog, glassId)
  const max = Number.isFinite(input.maxTypologies) && (input.maxTypologies ?? 0) > 0 ? (input.maxTypologies as number) : CATALOG_DOC_MAX_TYPOLOGIES

  const entries: CatalogDocEntry[] = []
  for (const line of lines) {
    const brand: Brand = catalog.brands?.find((b) => b.id === line.brandId) ?? { id: line.brandId, name: 'Perfiles', kind: 'profiles' }
    const colorId = lineColor(line, catalog, settings.defaults?.colorId)
    const typologies: CatalogDocTypology[] = []
    for (const typologyId of catalogLineTypologies(line, max)) {
      try {
        const typology = getTypology(typologyId)
        const size = typology?.defaultSize ?? { width: 1000, height: 1000 }
        const design = createDesign(typologyId, { lineId: line.id, width: size.width, height: size.height, colorId, glassId })
        const price = fromPricePerM2(design, catalog, settings)
        typologies.push({
          typologyId,
          name: typology?.name ?? designName(design),
          layout: computeLayout(design, catalog),
          design,
          ...(price ? { fromPricePerM2: price } : {}),
        })
      } catch {
        // Si una tipología no se puede dibujar con esta línea, se omite sin romper el catálogo.
      }
    }
    if (typologies.length) entries.push({ line, brand, typologies, ...(glassIds.length ? { glassIds } : {}) })
  }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  return {
    org: quoteDocOrg(input.org),
    prefs: mergeQuoteDocPrefs(settings.documents),
    // El documento solo necesita las líneas elegidas (colores, vidrios y marcas quedan completos).
    catalog: lines.length !== (catalog.lines ?? []).length ? { ...catalog, lines } : catalog,
    entries,
    ...(title ? { title } : {}),
    date: quoteDocDate(input.date ?? new Date()),
  }
}
