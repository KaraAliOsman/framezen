/**
 * Lecturas del catálogo para el diseñador: líneas agrupadas por marca, colores de una línea,
 * vidrios agrupados por tipo y valores por defecto. Nunca lanza con catálogos incompletos.
 */
import { lineFabricates, V7_TYPOLOGY_IDS, type Catalog, type Color, type Glass, type GlassKind, type Line, type TypologyId } from '@dekopen/engine'
import { getGlossary, getLocale, translate } from '../../../lib/i18n'
import es from '../i18n/es'

/** Orden alfabético del idioma de la interfaz (números como números: «Serie 60» antes que «Serie 100»). */
function collator(): Intl.Collator {
  try {
    return new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' })
  } catch {
    return new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
  }
}

export interface LineGroup {
  brandId: string
  brandName: string
  lines: Line[]
}

/** Líneas agrupadas por marca (marcas y líneas en orden alfabético del idioma de la interfaz). */
export function linesByBrand(catalog: Catalog | undefined, filter?: (line: Line) => boolean): LineGroup[] {
  const lines = (catalog?.lines ?? []).filter((l) => (filter ? filter(l) : true))
  const groups = new Map<string, LineGroup>()
  for (const line of lines) {
    const brand = catalog?.brands.find((b) => b.id === line.brandId)
    const key = brand?.id ?? line.brandId ?? 'otras'
    if (!groups.has(key)) groups.set(key, { brandId: key, brandName: brand?.name ?? translate(es, 'pickers.otherLines'), lines: [] })
    groups.get(key)!.lines.push(line)
  }
  const order = collator()
  const out = [...groups.values()]
  out.forEach((g) => g.lines.sort((a, b) => order.compare(a.name, b.name)))
  return out.sort((a, b) => order.compare(a.brandName, b.brandName))
}

/** ¿La línea fabrica esta tipología? Las combinaciones de v7 se deducen de sus partes (ver `lineFabricates`). */
export function lineSupports(line: Line, typologyId: TypologyId, catalog?: Catalog): boolean {
  return lineFabricates(line, typologyId, catalog?.profiles ?? [])
}

export function findLine(catalog: Catalog | undefined, lineId: string | undefined): Line | undefined {
  return lineId ? catalog?.lines.find((l) => l.id === lineId) : undefined
}

export function brandName(catalog: Catalog | undefined, brandId: string | undefined): string | undefined {
  return brandId ? catalog?.brands.find((b) => b.id === brandId)?.name : undefined
}

/** «Practicable · 60 mm · 4 cámaras» (en el idioma de la interfaz). */
export function lineDetail(line: Line): string {
  const g = getGlossary()
  const parts = [g.term(line.kind === 'sliding' ? 'lineKind.sliding' : 'lineKind.casement')]
  if (line.depth) parts.push(translate(es, 'pickers.depth', { mm: line.depth }))
  if (line.chambers) parts.push(translate(es, 'pickers.chambers', { count: line.chambers }))
  if (line.material === 'aluminum') parts.push(translate(es, 'pickers.aluminum'))
  return parts.join(' · ')
}

/** Colores que fabrica la línea (o todos si la línea no los declara). */
export function lineColors(catalog: Catalog | undefined, lineId: string | undefined): Color[] {
  const colors = catalog?.colors ?? []
  const line = findLine(catalog, lineId)
  if (!line || !line.colorIds?.length) return colors
  const allowed = new Set(line.colorIds)
  const list = colors.filter((c) => allowed.has(c.id))
  return list.length ? list : colors
}

const GLASS_ORDER: GlassKind[] = ['dvh', 'mono', 'laminated', 'tempered', 'other']

export interface GlassGroup {
  kind: GlassKind
  label: string
  items: Glass[]
}

export function glassGroups(catalog: Catalog | undefined): GlassGroup[] {
  const glass = catalog?.glass ?? []
  const order = collator()
  const glossary = getGlossary()
  return GLASS_ORDER.map((kind) => ({
    kind,
    label: glossary.glassKind(kind),
    items: glass.filter((g) => (GLASS_ORDER.includes(g.kind) ? g.kind : 'other') === kind).sort((a, b) => order.compare(a.name, b.name)),
  })).filter((g) => g.items.length > 0)
}

export function glassName(catalog: Catalog | undefined, glassId: string | undefined): string | undefined {
  return glassId ? catalog?.glass.find((g) => g.id === glassId)?.name : undefined
}

export interface DesignDefaults {
  lineId?: string
  colorId?: string
  glassId?: string
  /** Línea de respaldo (la de tus ajustes) si `lineId` no fabrica la tipología elegida. */
  fallbackLineId?: string
}

/** Color válido para la línea: el pedido si la línea lo fabrica; si no, blanco o el primero. */
export function pickColor(catalog: Catalog | undefined, lineId: string | undefined, wanted?: string): string {
  const colors = lineColors(catalog, lineId)
  if (wanted && colors.some((c) => c.id === wanted)) return wanted
  const white = colors.find((c) => /blanc|white/i.test(`${c.id} ${c.name}`))
  return white?.id ?? colors[0]?.id ?? wanted ?? ''
}

/** Vidrio por defecto: el pedido si existe; si no, el preferido del catálogo (ver `preferredGlass`). */
export function pickGlass(catalog: Catalog | undefined, wanted?: string): string {
  const glass = catalog?.glass ?? []
  if (wanted && glass.some((g) => g.id === wanted)) return wanted
  return preferredGlass(catalog)?.id ?? wanted ?? ''
}

/** Tintes, capas y usos especiales: un DVH con esto en el nombre no es el «incoloro de siempre». */
const SPECIAL_GLASS =
  /bronce|gris|verde|azul|humo|reflect|espej|low.?e|lamin|templ|empavon|sat[eé]n|semilla|palill|acust|arg[oó]n|morisco|control|solar|catedral|acanal|esmeril|[aá]cid|fijo|proyect|jumbo|policarb|acr[ií]lic|mate|negro/i

/** «4+12+4» desde el nombre o la composición («4 incoloro + 12 cámara + 4 incoloro»). */
export function glassComposition(glass: Pick<Glass, 'name' | 'composition'>): string | null {
  const read = (text: string | undefined) => {
    const parts = (text ?? '').match(/\d+(?:[.,]\d+)?/g)
    return parts && parts.length >= 3 ? parts.slice(0, 3).map((n) => n.replace(',', '.')).join('+') : null
  }
  const fromName = (glass.name ?? '').match(/(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)/)
  if (fromName) return fromName.slice(1, 4).map((n) => n.replace(',', '.')).join('+')
  return read(glass.composition)
}

/** DVH incoloro corriente (sin tintes ni capas especiales). */
export function isClearDvh(glass: Glass): boolean {
  return glass.kind === 'dvh' && !SPECIAL_GLASS.test(glass.name.replace(/incoloro/gi, ''))
}

/**
 * Vidrio preferido para una ventana nueva: el termopanel de siempre, DVH 4+12+4 incoloro con
 * precio. Si el catálogo no lo tiene, el DVH incoloro con precio de la composición más común en
 * tu catálogo; si no hay DVH, el primer vidrio con precio. Nunca lanza.
 */
export function preferredGlass(catalog: Catalog | undefined): Glass | undefined {
  const glass = catalog?.glass ?? []
  const dvh = glass.filter((g) => g.kind === 'dvh')
  if (!dvh.length) return glass.find((g) => g.pricePerM2 > 0) ?? glass[0]
  const priced = dvh.filter((g) => g.pricePerM2 > 0)
  const pool = priced.length ? priced : dvh
  const clear = pool.filter(isClearDvh)
  const candidates = clear.length ? clear : pool
  const byName = (a: Glass, b: Glass) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'es')
  const standard = candidates.filter((g) => glassComposition(g) === '4+12+4').sort(byName)
  if (standard.length) return standard[0]
  const counts = new Map<string, number>()
  for (const g of dvh) {
    const c = glassComposition(g)
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const common = (g: Glass) => counts.get(glassComposition(g) ?? '') ?? 0
  return [...candidates].sort((a, b) => common(b) - common(a) || byName(a, b))[0]
}

/**
 * Vidrio por defecto de una ventana nueva sin otra de referencia: el DVH 4+12+4 incoloro si el
 * catálogo lo tiene; si no, el de tus ajustes (si existe y tiene precio); si no, el preferido.
 */
export function defaultGlassId(catalog: Catalog | undefined, settingsGlassId?: string): string {
  const preferred = preferredGlass(catalog)
  if (preferred && glassComposition(preferred) === '4+12+4' && isClearDvh(preferred)) return preferred.id
  const fromSettings = settingsGlassId ? catalog?.glass.find((g) => g.id === settingsGlassId) : undefined
  if (fromSettings && fromSettings.pricePerM2 > 0) return fromSettings.id
  return preferred?.id ?? fromSettings?.id ?? settingsGlassId ?? ''
}

/** Tipologías que se pueden fabricar con las líneas del catálogo (todas si no hay líneas). */
export function availableTypologies(catalog: Catalog | undefined): Set<TypologyId> | null {
  const lines = catalog?.lines ?? []
  if (lines.length === 0) return null
  const set = new Set<TypologyId>()
  for (const l of lines) {
    for (const t of l.typologyIds ?? []) set.add(t as TypologyId)
    for (const t of V7_TYPOLOGY_IDS) if (lineFabricates(l, t, catalog?.profiles ?? [])) set.add(t)
  }
  return set.size ? set : null
}
