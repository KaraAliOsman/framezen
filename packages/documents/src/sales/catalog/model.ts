/**
 * Modelo del catálogo: a partir de `CatalogDocData` (líneas, diseños dibujados por el motor y precios
 * «desde» del motor) arma las familias, productos, colores, vidrios y herrajes que muestran las
 * secciones, ya con nombres de dominio en el idioma del documento. Puro y determinista.
 *
 * Nunca inventa datos: sin precio → «Precio a consultar»; sin valores de desempeño verificados no se
 * publica ninguno; las medidas por hoja son los rangos orientativos de herraje del motor y se rotulan
 * como tales.
 */
import {
  OPENING_SIZE_LIMITS,
  getTypology,
  type Catalog,
  type Color,
  type DesignNode,
  type Glass,
  type Item,
  type Line,
  type OpeningKind,
  type TypologyGroup,
  type WindowDesign,
} from '@dekopen/engine'
import {
  colorDisplayName,
  glassKindName,
  glossaryTerm,
  openingName,
  typologyName,
  type DocLocale,
} from '@dekopen/shared'
import type { CatalogDocData, CatalogDocEntry, CatalogDocTypology } from '../types'
import { catalogText } from './i18n'

export interface SizeRange {
  minW: number
  maxW: number
  minH: number
  maxH: number
}

export interface ProductModel {
  key: string
  /** Código corto de la tarjeta: A01, A02… (letra de la línea + número). */
  code: string
  typologyId: string
  /** Nombre de la tipología en el idioma del documento. */
  name: string
  group: TypologyGroup | 'window'
  family: FamilyModel
  source: CatalogDocTypology
  /** Resumen de apertura ya traducido («Oscilobatiente · 1 hoja»). */
  opening: string
  /** Aperturas que tiene (sin repetir, en orden de aparición). */
  openings: OpeningKind[]
  /** Rango orientativo de la hoja principal (sin dato si es fija). */
  sashRange?: SizeRange
  fromPrice?: number
  area: number
}

export interface FinishModel {
  id: string
  name: string
  hex: string
  code?: string
  color: Color
  /** Terminación declarada por la textura (para el rótulo). */
  finish?: 'smooth' | 'woodgrain' | 'textured' | 'metallic'
  /** Líneas que lo ofrecen (nombres). */
  lines: string[]
}

export interface GlassModel {
  id: string
  name: string
  kind: Glass['kind']
  kindLabel: string
  thickness?: number
  composition?: string
  /** Capas «4+12+4» → [vidrio 4, cámara 12, vidrio 4] (si se pueden leer). */
  layers: { kind: 'pane' | 'gap'; mm: number }[]
  /** Es el vidrio con que se calcularon los precios «desde». */
  base: boolean
}

export interface HardwareModel {
  id: string
  name: string
  code: string
  openings: string[]
  finishes: string[]
}

export interface FamilyModel {
  index: number
  letter: string
  id: string
  name: string
  brand: string
  line: Line
  description?: string
  material: string
  system: string
  depth?: number
  chambers?: number
  products: ProductModel[]
  colors: FinishModel[]
  glass: GlassModel[]
  openings: OpeningKind[]
  /** Producto más representativo (el de mayor superficie entre los que abren). */
  hero?: ProductModel
  fromPrice?: number
  /** Vidrio más grueso que admite según su catálogo (mm). */
  maxGlass?: number
  /** Hoja más grande entre sus aperturas (rango orientativo). */
  maxSash?: { w: number; h: number }
}

export interface CatalogModel {
  locale: DocLocale
  families: FamilyModel[]
  products: ProductModel[]
  finishes: FinishModel[]
  glass: GlassModel[]
  hardware: HardwareModel[]
  openings: OpeningKind[]
  /** Precio «desde» más bajo del catálogo (para tarjetas de familia). */
  hasPrices: boolean
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export function familyLetter(index: number): string {
  if (index < LETTERS.length) return LETTERS[index]
  return `${LETTERS[Math.floor(index / LETTERS.length) - 1] ?? 'Z'}${LETTERS[index % LETTERS.length]}`
}

// ── Aperturas ────────────────────────────────────────────────────────────────

interface LeafInfo {
  kind: OpeningKind
  direction?: 'in' | 'out'
  use?: string
}

function collectLeaves(node: DesignNode | undefined, out: LeafInfo[], depth = 0): void {
  if (!node || depth > 24) return
  if (node.type === 'leaf') {
    const o = node.opening as { kind: OpeningKind; direction?: 'in' | 'out'; use?: string }
    out.push({ kind: o.kind, direction: o.direction, use: o.use })
  } else if (node.type === 'split') for (const child of node.children ?? []) collectLeaves(child, out, depth + 1)
}

type LimitClass = keyof typeof OPENING_SIZE_LIMITS

function limitClass(leaf: LeafInfo, design: WindowDesign): LimitClass | undefined {
  switch (leaf.kind) {
    case 'casement':
      return leaf.direction === 'out' ? 'casement_out' : 'casement'
    case 'awning':
      return 'awning'
    case 'tilt_turn':
      return leaf.use === 'balcony' || leaf.use === 'entrance' || design.height >= 1900 ? 'tilt_turn_door' : 'tilt_turn'
    case 'door':
      return 'door'
    case 'tilt':
      return 'tilt'
    case 'pivot_h':
      return 'pivot_h'
    case 'pivot_v':
      return 'pivot_v'
    case 'tilt_slide':
      return 'tilt_slide'
    case 'parallel_slide':
      return 'parallel_slide'
    case 'folding':
      return 'folding'
    default:
      return undefined
  }
}

/** Resumen de apertura en el idioma del documento y rango orientativo de la hoja principal. */
export interface OpeningSummary {
  /** Texto completo («Oscilobatiente · 1 hoja»). */
  text: string
  /** Nombre de la apertura («Oscilobatiente») y detalle («1 hoja + 1 paño fijo»). */
  label: string
  detail: string
  openings: OpeningKind[]
  range?: SizeRange
}

export function productOpening(design: WindowDesign, locale: DocLocale): OpeningSummary {
  const t = catalogText(locale)
  const root = design.root
  if (root?.type === 'sliding') {
    const moving = root.panels.filter((p) => p.kind === 'moving').length
    const fixed = root.panels.length - moving
    const lift = root.system === 'lift_slide'
    const name = glossaryTerm(lift ? 'sliding.system.lift_slide' : 'sliding.system.standard', locale)
    const detail = fixed > 0 ? t('product.slidingFixed', { moving, fixed }) : t('product.sliding', { moving })
    const limits = OPENING_SIZE_LIMITS[lift ? 'lift_slide' : 'sliding']
    return { text: `${name} · ${detail}`, label: name, detail, openings: [], range: moving > 0 ? { ...limits } : undefined }
  }
  const leaves: LeafInfo[] = []
  collectLeaves(root, leaves)
  const kinds: OpeningKind[] = []
  for (const l of leaves) if (!kinds.includes(l.kind)) kinds.push(l.kind)
  const moving = leaves.filter((l) => l.kind !== 'fixed')
  if (moving.length === 0) {
    const text = leaves.length > 1 ? t('product.fixedPanes', { count: leaves.length }) : t('product.fixedOnly')
    return { text, label: text, detail: '', openings: kinds }
  }
  const main = moving[0]
  const cls = limitClass(main, design)
  const range = cls ? { ...OPENING_SIZE_LIMITS[cls] } : undefined
  const movingKinds = kinds.filter((k) => k !== 'fixed')
  const names = movingKinds.map((k) => openingName(k, locale))
  const label = names.length > 1 ? t('product.combined', { a: names[0], b: names.slice(1).join(' + ') }) : (names[0] ?? '')
  const fixed = leaves.length - moving.length
  const leavesText = t('product.leaves', { count: moving.length })
  const fixedText = fixed > 0 ? ` + ${t('product.fixedPanes', { count: fixed })}` : ''
  return { text: `${label} · ${leavesText}${fixedText}`, label, detail: `${leavesText}${fixedText}`, openings: kinds, range }
}

// ── Vidrios ──────────────────────────────────────────────────────────────────

/** «DVH 4+12+4» / «4+12+4» / «6+16+6» → capas. Laminados «3+3» cuentan como un vidrio de 6. */
export function glassLayers(glass: Pick<Glass, 'name' | 'composition' | 'thickness' | 'kind'>): { kind: 'pane' | 'gap'; mm: number }[] {
  const text = `${glass.name} ${glass.composition ?? ''}`
  const m = /(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)/.exec(text)
  const num = (s: string) => Number(s.replace(',', '.'))
  if (m && glass.kind === 'dvh') {
    const [a, b, c] = [num(m[1]), num(m[2]), num(m[3])]
    if ([a, b, c].every((n) => n > 0 && n < 60)) return [{ kind: 'pane', mm: a }, { kind: 'gap', mm: b }, { kind: 'pane', mm: c }]
  }
  const thickness = glass.thickness && glass.thickness > 0 ? glass.thickness : undefined
  return thickness ? [{ kind: 'pane', mm: thickness }] : []
}

// ── Construcción ─────────────────────────────────────────────────────────────

function colorFinish(color: Color): FinishModel['finish'] {
  const f = color.texture?.finish
  if (f === 'smooth' || f === 'woodgrain' || f === 'textured' || f === 'metallic') return f
  return color.texture ? 'woodgrain' : undefined
}

/**
 * Producto que representa a la línea en portadas y fichas: uno que abre, de proporción amable
 * (ni una tira de 6 hojas ni una ranura) y, entre esos, el más grande.
 */
function heroOf(products: ProductModel[]): ProductModel | undefined {
  const operable = products.filter((p) => p.openings.some((k) => k !== 'fixed') || p.source.design.root?.type === 'sliding')
  const pool = operable.length ? operable : products
  const score = (p: ProductModel) => {
    const aspect = p.source.design.width / Math.max(1, p.source.design.height)
    return p.area * (aspect >= 0.45 && aspect <= 2.1 ? 1 : 0.3)
  }
  return [...pool].sort((a, b) => score(b) - score(a))[0]
}

function glassModel(glass: Glass, base: boolean, locale: DocLocale): GlassModel {
  return {
    id: glass.id,
    name: glass.name,
    kind: glass.kind,
    kindLabel: glassKindName(glass.kind, locale),
    ...(glass.thickness ? { thickness: glass.thickness } : {}),
    ...(glass.composition ? { composition: glass.composition } : {}),
    layers: glassLayers(glass),
    base,
  }
}

function hardwareModels(entries: CatalogDocEntry[], catalog: Catalog, locale: DocLocale): HardwareModel[] {
  const byId = new Map<string, Item>(catalog.items.map((i) => [i.id, i]))
  const colorName = (id: string) => {
    const color = catalog.colors.find((c) => c.id === id)
    return color ? colorDisplayName(color, locale) : undefined
  }
  const out = new Map<string, HardwareModel>()
  for (const entry of entries) {
    for (const rule of entry.line.hardwareRules ?? []) {
      const item = byId.get(rule.itemId)
      if (!item || item.kind !== 'hardware') continue
      const model = out.get(item.id) ?? { id: item.id, name: item.name, code: item.code, openings: [], finishes: [] }
      for (const kind of rule.openings ?? []) {
        const label = openingName(kind, locale)
        if (!model.openings.includes(label)) model.openings.push(label)
      }
      for (const colorId of Object.keys(rule.byColor ?? {})) {
        const name = colorName(colorId)
        if (name && !model.finishes.includes(name)) model.finishes.push(name)
      }
      out.set(item.id, model)
    }
  }
  return [...out.values()]
}

export function buildCatalogModel(data: CatalogDocData, locale: DocLocale): CatalogModel {
  const catalog = data.catalog
  const colorsById = new Map(catalog.colors.map((c) => [c.id, c]))
  const glassById = new Map(catalog.glass.map((g) => [g.id, g]))
  const finishes = new Map<string, FinishModel>()
  const glassAll = new Map<string, GlassModel>()
  const families: FamilyModel[] = []
  const openingsAll: OpeningKind[] = []

  data.entries.forEach((entry, index) => {
    const letter = familyLetter(index)
    const line = entry.line
    const colors: FinishModel[] = []
    for (const id of line.colorIds ?? []) {
      const color = colorsById.get(id)
      if (!color) continue
      const existing = finishes.get(id)
      const model: FinishModel = existing ?? { id, name: colorDisplayName(color, locale), hex: color.hex, ...(color.code ? { code: color.code } : {}), color, finish: colorFinish(color), lines: [] }
      if (!model.lines.includes(line.name)) model.lines.push(line.name)
      finishes.set(id, model)
      colors.push(model)
    }
    const glass = (entry.glassIds ?? [])
      .map((id, i) => {
        const g = glassById.get(id)
        return g ? glassModel(g, i === 0, locale) : undefined
      })
      .filter((g): g is GlassModel => !!g)
    for (const g of glass) if (!glassAll.has(g.id)) glassAll.set(g.id, g)

    const family: FamilyModel = {
      index,
      letter,
      id: line.id,
      name: line.name,
      brand: entry.brand?.name ?? '',
      line,
      ...(line.description ? { description: line.description } : {}),
      material: glossaryTerm(`material.${line.material}` as never, locale),
      system: glossaryTerm(`lineKind.${line.kind}` as never, locale),
      ...(line.depth ? { depth: line.depth } : {}),
      ...(line.chambers ? { chambers: line.chambers } : {}),
      products: [],
      colors,
      glass,
      openings: [],
    }
    family.products = entry.typologies.map((t, i) => {
      const opening = productOpening(t.design, locale)
      for (const k of opening.openings) if (!family.openings.includes(k)) family.openings.push(k)
      const typology = getTypology(t.typologyId)
      const name = typologyName(t.typologyId, locale, t.name)
      // El nombre ya dice la apertura («Oscilobatiente»): no se repite, queda el detalle («1 hoja»).
      const says = (a: string, b: string) => a.toLocaleLowerCase(locale).includes(b.toLocaleLowerCase(locale))
      const openingText = opening.label && says(name, opening.label) ? opening.detail : opening.text
      return {
        key: `${line.id}:${t.typologyId}:${i}`,
        code: `${letter}${String(i + 1).padStart(2, '0')}`,
        typologyId: t.typologyId,
        name,
        group: typology?.group ?? 'window',
        family,
        source: t,
        opening: openingText,
        openings: opening.openings,
        ...(opening.range ? { sashRange: opening.range } : {}),
        ...(t.fromPricePerM2 && t.fromPricePerM2 > 0 ? { fromPrice: t.fromPricePerM2 } : {}),
        area: (t.design.width * t.design.height) / 1_000_000,
      }
    })
    if (line.kind === 'sliding' && !family.openings.length) family.openings.push('fixed')
    for (const k of family.openings) if (!openingsAll.includes(k)) openingsAll.push(k)
    family.hero = heroOf(family.products)
    const prices = family.products.map((p) => p.fromPrice).filter((p): p is number => typeof p === 'number')
    if (prices.length) family.fromPrice = Math.min(...prices)
    const thick = glass.map((g) => g.thickness ?? 0).filter((n) => n > 0)
    if (thick.length) family.maxGlass = Math.max(...thick)
    const ranges = family.products.map((p) => p.sashRange).filter((r): r is SizeRange => !!r)
    if (ranges.length) family.maxSash = { w: Math.max(...ranges.map((r) => r.maxW)), h: Math.max(...ranges.map((r) => r.maxH)) }
    families.push(family)
  })

  const products = families.flatMap((f) => f.products)
  return {
    locale,
    families,
    products,
    finishes: [...finishes.values()],
    glass: [...glassAll.values()],
    hardware: hardwareModels(data.entries, catalog, locale),
    openings: openingsAll,
    hasPrices: products.some((p) => p.fromPrice !== undefined),
  }
}

/** Producto en otro color de su línea (variantes del lookbook): rota por los colores disponibles. */
export function variantColor(product: ProductModel, offset: number): { colorId?: string; name?: string } {
  const ids = product.family.line.colorIds ?? []
  if (!ids.length) return {}
  const colorId = ids[offset % ids.length]
  const color = product.family.colors.find((c) => c.id === colorId)
  return { colorId, name: color?.name }
}
