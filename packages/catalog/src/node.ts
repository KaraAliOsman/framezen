/**
 * Importador de «informacion de marcas» → Catalog (solo Node).
 *
 * Fuentes (nunca se suben al repositorio):
 *  - items/*.csv: listas «MisPrecios», una marca por archivo.
 *  - marcas diseños y medidas/<marca>/: marca.json, lineas.json, productos.json y
 *    fichas/<id>.json con la pauta de la distribuidora (descuentos y tipología).
 *
 * El resultado se escribe en .data/catalog/base.json (ignorado por git). Nada
 * bloquea: lo que falta queda en 0 o con valores típicos y se informa en el reporte.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AccessoryRule,
  Brand,
  BrandSettings,
  Catalog,
  Color,
  Glass,
  HardwareRule,
  Item,
  Line,
  LineKind,
  Pauta,
  Profile,
  ProfileRole,
  TypologyId,
} from '@framezen/engine'
import {
  chamberFromColor,
  inferUnit,
  isComplementProfile,
  isPlausibleGlassPrice,
  itemKind,
  parseBarLength,
  parseFace,
  parseGlass,
  profileFamily,
  repeatedPlaceholderValues,
  roleFor,
  rowStatus,
  type ProfileFamily,
  type RowStatus,
  PLACEHOLDER_MAX,
} from './classify'
import { brandRuleFor, colorFromCode, modelGroupKey, profileModelCode, prolineToken, strippedModelCandidates } from './codes'
import { COLOR_PALETTE, colorSuffixes, isColorless, normalizeColor } from './colors'
import { parseMisPreciosCsv, type MisPreciosRow } from './csv'
import { PROLINE_FACES, PROLINE_LINES, PROLINE_REINFORCEMENT, PROLINE_REINFORCEMENT_LINE, prolineSettings } from './proline'
import { TYPICAL_PAUTA_PREFIX, lineReadiness, readinessIndex, requiredRolesFor, type ReadinessState } from './readiness'
import { GENERIC_BRAND, GENERIC_ITEMS, buildLineRules } from './rules'
import { SAMPLE_CATALOG } from './sample'
import { catalogStats, type CatalogStats } from './stats'
import { CASEMENT_TYPOLOGIES, SLIDING_TYPOLOGIES, supplierFamily, typologyMatch } from './typologies'
import { cleanLabel, mode, normalizeKey, parseDecimal, slug } from './text'

export const DEFAULT_SOURCE_DIR = process.env.CATALOG_SOURCE_DIR || ''
/** Raíz del monorepo (packages/catalog/src → ../../..). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** .data/catalog/base.json en la raíz del repo (CATALOG_BASE_FILE lo reemplaza, útil en builds empaquetados). */
export const DEFAULT_BASE_FILE = process.env.CATALOG_BASE_FILE || join(REPO_ROOT, '.data', 'catalog', 'base.json')
export const DEFAULT_REPORT_FILE = join(dirname(DEFAULT_BASE_FILE), 'import-report.json')

/** Marcas activadas por defecto (las de mejor cobertura de precios y pautas). */
export const RECOMMENDED_BRANDS = ['PROLINE', 'TERMICO', 'WINSA', 'KOMPEN', 'KUNSTHERM', 'HERRAJESGENERICOS', 'VIDRIOSPROLINE', 'VIDRIOS']

const BRAND_DISPLAY: Record<string, string> = {
  HERRAJESGENERICOS: 'Herrajes genéricos',
  THERMOWINHERRAHES: 'Thermowin herrajes',
  MEPERFILES: 'M&E Perfiles',
  MUCHTEKTECNOCOM: 'Muchtek Tecnocom',
}
const ACCENTS = ['#2747C2', '#2F7D4F', '#A35F00', '#7A4A2A', '#5C8A93', '#6B4FA0', '#B0413E', '#3D6B8C', '#7C7F2A', '#8C5A3C']
const PROFILE_GROUPS = new Set(['PERFIL', 'REFUERZO', 'JUNQUILLO', 'COMPLEMENTARIO'])
const SKIP_GROUPS = new Set(['MANO OBRA'])
const MAX_PROFILE_PRICE = 400000
const MAX_ITEM_PRICE = 2000000

// ── Tipos del reporte ────────────────────────────────────────────────────────

export interface LineImportReport {
  id: string
  name: string
  kind: LineKind
  completeness: NonNullable<Line['completeness']>
  pauta: string
  products: number
  typologies: number
  profiles: number
  profilesPriced: number
  rules: { fromBrand: string[]; fromGeneric: string[]; fromOtherCatalog: string[] }
  /** Línea madre si es una variante de pauta («PROSLD70 · monorriel»). */
  variantOf?: string
  /** Completitud honesta en palabras: qué falta para cotizar una ventana completa con precio. */
  readiness: {
    state: ReadinessState
    headline: string
    details: string[]
    missing: string[]
    readyColors: string[]
  }
}

export interface BrandImportReport {
  id: string
  name: string
  enabled: boolean
  kind: Brand['kind']
  products: number
  lines: LineImportReport[]
  profiles: number
  profilesPriced: number
  items: number
  itemsPriced: number
  glass: number
  glassPriced: number
  colors: string[]
  warnings: string[]
  /** Herrajes con unidad o envase deducido (por el precio o un número entre paréntesis): por confirmar. */
  doubtfulUnits: { id: string; name: string; note: string }[]
  /** Artículos comercialmente idénticos (código, nombre, unidad, envase y precio): se conserva el primero. */
  duplicates: { keptId: string; rowIds: string[]; name: string }[]
  /** Mismo código con descripción o precio distinto: se conservan todos, sin fusionar. */
  codeConflicts: { code: string; ids: string[] }[]
  /** Vidrios con composición o espesor por confirmar, y filas de vidrio que no eran vidrio. */
  glassNotes: { name: string; note: string }[]
  /** Precios de perfil descartados por estar fuera de rango (no es falta de precio en el origen). */
  discardedPrices: { rowId: string; code: string; value: number }[]
  /** Color de la columna que contradice el del código: se conserva la columna. */
  colorConflicts: { code: string; column: string; note: string }[]
}

export interface ImportReport {
  sourceDir: string
  priceListDate?: string
  files: { read: number; duplicates: { file: string; sameAs: string }[] }
  rows: {
    total: number
    unique: number
    deprecated: number
    virtual: number
    junk: number
    zeroPrice: number
    placeholderPrice: number
    outlierPrice: number
  }
  brands: BrandImportReport[]
  totals: CatalogStats & { genericItemsUsed: number }
  /** Líneas por estado: lista para cotizar, cotiza con avisos, solo medidas. */
  readiness: Record<ReadinessState, number>
  warnings: string[]
}

export interface ImportResult {
  catalog: Catalog
  report: ImportReport
}

// ── Estructuras internas ─────────────────────────────────────────────────────

type PriceStatus = 'ok' | 'zero' | 'placeholder' | 'outlier'

interface SourceRow extends MisPreciosRow {
  file: string
  status: RowStatus
  priceStatus: PriceStatus
  /** Precio utilizable (0 si es relleno o está fuera de rango). */
  value: number
}

interface FolderProduct {
  id: string
  tipo: string
  name: string
  dm: number
  ah: number
  dh: number
  avisos: string[]
  error: boolean
  lineName: string
  opening: string
  typologyName: string
}

interface LineDraft {
  key: string
  name: string
  id: string
  fromFolder: boolean
  products: FolderProduct[]
  verified?: (typeof PROLINE_LINES)[string]
}

interface Variant {
  price: number
  rowId: number
  score: number
}

interface ModelDraft {
  key: string
  code: string
  names: { text: string; rowId: number }[]
  families: ProfileFamily[]
  skus: Set<string>
  rowIds: Set<string>
  colored: Map<string, Variant>
  colorless?: Variant
  votes: Map<string, number>
  barLength?: number
  face?: number
  links: { frame: number; sash: number }
  /** Productos del fabricante que nombran este perfil como marco u hoja. */
  linked: { frame: Set<string>; sash: Set<string> }
  lineKey?: string
  /** Sin línea acreditada: común a todas las líneas de la marca. */
  common?: boolean
}

// ── Lectura de archivos ──────────────────────────────────────────────────────

function readJson<T>(file: string): T | undefined {
  try {
    const text = readFileSync(file, 'utf8')
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as T
  } catch {
    return undefined
  }
}

function brandKey(name: string): string {
  return normalizeKey(cleanLabel(name)).replace(/[^A-Z0-9]/g, '')
}

function brandDisplayName(raw: string): string {
  const key = brandKey(raw)
  return BRAND_DISPLAY[key] ?? cleanLabel(raw).replace(/HERRAHES/i, 'Herrajes')
}

function monogram(name: string): string {
  const words = normalizeKey(name).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? 'XX').slice(0, 2)
}

function accentFor(key: string): string {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return ACCENTS[hash % ACCENTS.length]
}

const STOPWORDS = new Set(['DE', 'DEL', 'LA', 'EL', 'Y', 'CON', 'PARA', 'EN', 'AL', 'POR', 'SIN', 'A', 'O', 'LOS', 'LAS', 'E'])
const COLOR_WORDS = /\b(BLANCO|BLANCA|NOGAL|NEGRO|NEGRA|ANTRACITA|ROBLE DORADO|ROBLE DOR\.?|ROBLE MONTANA|ROBLE MONTAÑA|WINCHESTER|GRAFITO|BRONCE|TITANIO)\b/gi

/** Nombre legible: sin marcadores, sin largo de barra ni color de proveedor; mayúsculas suavizadas. */
function displayName(description: string, options: { stripColor?: boolean; stripToken?: string } = {}): string {
  let text = cleanLabel(description)
  text = text.replace(/^\(?\d[\dA-Z.]{5,}\)?\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/u, '') // código legado al inicio
  text = text.replace(/\s*\bX\s*\d[.,]\d{1,2}\s*(M|MT|MTS)?\b\.?/gi, '').replace(/\s*\b\d[.,]\d\s*M\b/gi, '')
  if (options.stripToken) text = text.replace(new RegExp(`\\s*\\b${options.stripToken.replace(/[-]/g, '\\s?-?\\s?')}\\b`, 'i'), '')
  if (options.stripColor) text = text.replace(COLOR_WORDS, ' ')
  text = text.replace(/\s+/g, ' ').replace(/\s*-\s*$/, '').replace(/\s*\.\s*$/, '').trim()
  // Sólo se suavizan los nombres escritos en mayúsculas (se ignoran unidades como «mm»).
  if (/[a-záéíóúñ]/.test(text.replace(/\d\s*mm\b/g, ''))) return text
  const words = text.split(' ').map((word, index) => {
    if (/\d/.test(word)) return word.replace(/(\d)MM\b/g, '$1 mm')
    const bare = normalizeKey(word).replace(/[^A-Z]/g, '')
    if (STOPWORDS.has(bare)) return word.toLocaleLowerCase('es-CL')
    if (bare.length <= 2 && index > 0) return word
    return word.toLocaleLowerCase('es-CL')
  })
  const joined = words.join(' ')
  return joined.charAt(0).toLocaleUpperCase('es-CL') + joined.slice(1)
}

function priceListDate(files: string[]): string | undefined {
  for (const file of files) {
    const match = file.match(/(\d{2})(\d{2})(\d{4})_\d{4}/)
    if (match) return `${match[1]}-${match[2]}-${match[3]}`
  }
  return undefined
}

function readPriceLists(sourceDir: string, report: ImportReport): SourceRow[] {
  const dir = join(sourceDir, 'items')
  if (!existsSync(dir)) {
    report.warnings.push(`No encontré la carpeta de listas de precios: ${dir}`)
    return []
  }
  const files = readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    // «X.csv» antes que «X (1).csv»: ante archivos idénticos se conserva el original.
    .sort((a, b) => {
      const ka = a.replace(/\.csv$/i, '')
      const kb = b.replace(/\.csv$/i, '')
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
  report.priceListDate = priceListDate(files)
  const hashes = new Map<string, string>()
  const byId = new Map<string, SourceRow>()
  const rows: SourceRow[] = []
  for (const file of files) {
    const buffer = readFileSync(join(dir, file))
    const hash = createHash('sha256').update(buffer).digest('hex')
    const sameAs = hashes.get(hash)
    if (sameAs) {
      report.files.duplicates.push({ file, sameAs })
      continue
    }
    hashes.set(hash, file)
    report.files.read++
    for (const row of parseMisPreciosCsv(buffer.toString('utf8'))) {
      report.rows.total++
      const key = row.id || `${file}:${row.code}:${row.description}:${row.color}`
      if (byId.has(key)) continue
      const source: SourceRow = { ...row, file, status: rowStatus(row.description, row.code, row.line), priceStatus: 'ok', value: row.price }
      byId.set(key, source)
      rows.push(source)
    }
  }
  report.rows.unique = rows.length
  return rows
}

function classifyPrices(rows: SourceRow[], report: ImportReport): void {
  const byBrand = new Map<string, SourceRow[]>()
  for (const row of rows) byBrand.set(brandKey(row.brand), [...(byBrand.get(brandKey(row.brand)) ?? []), row])
  for (const brandRows of byBrand.values()) {
    const repeated = repeatedPlaceholderValues(brandRows.map((row) => row.price))
    for (const row of brandRows) {
      if (row.status !== 'ok') continue
      if (row.price <= 0) row.priceStatus = 'zero'
      else if (row.price <= PLACEHOLDER_MAX || repeated.has(row.price)) row.priceStatus = 'placeholder'
      else if (row.price > MAX_ITEM_PRICE) row.priceStatus = 'outlier'
      if (row.priceStatus !== 'ok') row.value = 0
      if (row.priceStatus === 'zero') report.rows.zeroPrice++
      if (row.priceStatus === 'placeholder') report.rows.placeholderPrice++
      if (row.priceStatus === 'outlier') report.rows.outlierPrice++
    }
  }
  for (const row of rows) {
    if (row.status === 'deprecated') report.rows.deprecated++
    if (row.status === 'virtual') report.rows.virtual++
    if (row.status === 'junk') report.rows.junk++
  }
}

interface FolderData {
  name: string
  lines: { id: string; nombre: string }[]
  products: FolderProduct[]
}

function readFolders(sourceDir: string, report: ImportReport): Map<string, FolderData> {
  const root = join(sourceDir, 'marcas diseños y medidas')
  const out = new Map<string, FolderData>()
  if (!existsSync(root)) {
    report.warnings.push(`No encontré la carpeta de pautas: ${root}`)
    return out
  }
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    const dir = join(root, folder.name)
    const brand = readJson<{ nombre?: string }>(join(dir, 'marca.json'))
    const name = brand?.nombre ?? folder.name
    const lines = readJson<{ id: string; nombre: string }[]>(join(dir, 'lineas.json')) ?? []
    const raw =
      readJson<
        {
          id: string
          tipo?: string
          nombre?: string
          descuento_marco?: string
          ancho_hoja?: string
          descuento_hoja?: string
          avisos?: string[]
          marcado_con_error?: boolean
        }[]
      >(join(dir, 'productos.json')) ?? []
    const products: FolderProduct[] = raw.map((product) => {
      const ficha = readJson<{ campos?: { nombre: string; valor: string }[] }>(join(dir, 'fichas', `${product.id}.json`))
      const field = (name: string) => ficha?.campos?.find((campo) => campo.nombre === name)?.valor ?? ''
      const num = (value?: string) => {
        const parsed = parseDecimal(value ?? '')
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
      }
      return {
        id: String(product.id),
        tipo: product.tipo ?? '',
        name: product.nombre ?? '',
        dm: num(product.descuento_marco),
        ah: num(product.ancho_hoja),
        dh: num(product.descuento_hoja),
        avisos: product.avisos ?? [],
        error: Boolean(product.marcado_con_error),
        lineName: field('idLinea'),
        opening: field('tipoAbertura'),
        typologyName: field('idTipologia'),
      }
    })
    out.set(brandKey(name), { name, lines, products })
  }
  return out
}

// ── Líneas ───────────────────────────────────────────────────────────────────

const GENERIC_LINE_WORDS = new Set([
  'SERIE',
  'LINEA',
  'LINE',
  'CORREDERA',
  'CORREDERAS',
  'DOBLE',
  'CONTACTO',
  'PERFIL',
  'EUROPEA',
  'AMERICANA',
  'PRACTICABLE',
  'WIN',
  'MM',
  'VERATEC',
  'WINDOLINE',
  'YAG',
  'THERMOWIN',
  'KOM',
])

function lineTokens(name: string): string[] {
  return normalizeKey(name)
    .replace(/(\d)MM\b/g, '$1')
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 2 && !GENERIC_LINE_WORDS.has(token))
}

function matchLine(name: string, lines: LineDraft[]): LineDraft | undefined {
  const key = normalizeKey(cleanLabel(name))
  if (!key || /^LINEA\W*$/.test(key)) return undefined
  const exact = lines.find((line) => line.key === key)
  if (exact) return exact
  const contained = lines.filter((line) => key.includes(line.key) || line.key.includes(key))
  if (contained.length === 1) return contained[0]
  const tokens = lineTokens(key).filter((token) => /\d/.test(token))
  if (tokens.length) {
    const byNumbers = lines.filter((line) => tokens.every((token) => lineTokens(line.key).some((lineToken) => lineToken.includes(token) || token.includes(lineToken))))
    if (byNumbers.length === 1) return byNumbers[0]
    if (contained.length > 1) {
      const narrowed = contained.filter((line) => byNumbers.includes(line))
      if (narrowed.length === 1) return narrowed[0]
    }
  }
  return undefined
}

function pautaSummary(pauta: Pauta): string {
  const n = (value: number) => String(value).replace('.', ',')
  return `marco ${n(pauta.frameDeduction)} · hoja ${n(pauta.sashWidth)}/${n(pauta.sashDeduction)}`
}

const DEFAULT_PAUTA: Record<LineKind, Pauta> = {
  casement: { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 },
  sliding: { weld: 3, frameDeduction: 52, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 },
}
const DEFAULT_TYPOLOGIES: Record<LineKind, TypologyId[]> = {
  casement: ['fixed', 'casement', 'casement_out', 'tilt_turn', 'awning', 'casement_double', 'fixed_casement'],
  sliding: ['sliding_2', 'sliding_2_fixed', 'sliding_3', 'sliding_4'],
}

/** Producto de puerta: por el tipo «(P…)» o por el nombre de la tipología (hay puertas con tipo «(V)»). */
function isDoorProduct(product: FolderProduct): boolean {
  return /^\(P/.test(product.tipo) || supplierFamily(product.typologyName || product.name) === 'door'
}

/** Pauta por línea: valores más frecuentes de sus ventanas; puertas aparte. */
function derivePauta(kind: LineKind, products: FolderProduct[]): { pauta: Pauta; doorPauta?: Partial<Pauta>; fromData: boolean } {
  const usable = products.filter((product) => !/^\((M|X)\)/.test(product.tipo))
  const windows = usable.filter((product) => !isDoorProduct(product))
  const doors = usable.filter((product) => isDoorProduct(product))
  const ofKind = windows.filter((product) => {
    const family = supplierFamily(product.typologyName || product.name)
    return kind === 'sliding' ? family === 'sliding' : family !== 'sliding'
  })
  const pool = ofKind.length ? ofKind : windows
  const dm = mode(pool.map((product) => product.dm).filter((value) => value > 0)) ?? mode(usable.map((product) => product.dm).filter((value) => value > 0))
  const pair = mode(
    pool.filter((product) => product.ah > 0 && product.dh > 0 && product.ah > product.dh).map((product) => [product.ah, product.dh] as const),
    (value) => value.join('/'),
  )
  const base = DEFAULT_PAUTA[kind]
  const pauta: Pauta = {
    ...base,
    frameDeduction: dm ?? base.frameDeduction,
    sashWidth: pair?.[0] ?? base.sashWidth,
    sashDeduction: pair?.[1] ?? base.sashDeduction,
  }
  const doorPair = mode(
    doors.filter((product) => product.ah > 0 && product.dh > 0 && product.ah > product.dh).map((product) => [product.ah, product.dh] as const),
    (value) => value.join('/'),
  )
  const doorDm = mode(doors.map((product) => product.dm).filter((value) => value > 0))
  let doorPauta: Partial<Pauta> | undefined
  if (doorPair && (doorPair[0] !== pauta.sashWidth || doorPair[1] !== pauta.sashDeduction)) doorPauta = { sashWidth: doorPair[0], sashDeduction: doorPair[1] }
  if (doorDm && doorDm !== pauta.frameDeduction) doorPauta = { ...doorPauta, frameDeduction: doorDm }
  return { pauta, doorPauta, fromData: dm !== undefined && (pair !== undefined || pool.every((product) => product.ah === 0)) }
}

// ── Variantes de corredera (rieles, marco y hoja) ────────────────────────────

type Rails = 'mono' | 'doble' | 'triple'

const RAILS_LABEL: Record<Rails, string> = { mono: 'monorriel', doble: 'doble riel', triple: 'triple riel' }

function railsOf(product: FolderProduct): Rails {
  const text = normalizeKey(`${product.typologyName} ${product.name}`)
  if (/MONO\s*R+IEL|MONORIEL/.test(text)) return 'mono'
  if (/TRIPLE\s*RIEL|3\s*RIELES/.test(text)) return 'triple'
  return 'doble'
}

/** «Corredera Marco 60 Mm…» → '60' (el proveedor distingue marcos del mismo sistema por su ancho). */
function frameTokenOf(product: FolderProduct): string | undefined {
  return normalizeKey(product.name).match(/\bMARCO\s+(\d{2,3})\s*MM\b/)?.[1]
}

/** Números escritos en un nombre de perfil («Hoja corr 48/80» → 48, 80). */
function nameNumbers(name: string): number[] {
  return (normalizeKey(name).replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

interface SlidingVariant {
  rails: Rails
  frameToken?: string
  /** Ancho de hoja propio (variante «hoja 100 mm»). */
  sashWidth?: number
  /** Par ancho/descuento de hoja que corresponde a la hoja de esta variante. */
  pair?: readonly [number, number]
  products: FolderProduct[]
  label: string
}

function matchesRails(name: string, rails: Rails): boolean {
  const text = normalizeKey(name)
  const triple = /TRIPLE|3 RIELES|3 HOJAS/.test(text)
  const mono = /MONO\s*R+IEL|MONORIEL|1 RIEL/.test(text)
  return rails === 'triple' ? triple : rails === 'mono' ? mono : !triple && !mono
}

/**
 * Agrupa los productos de una corredera por rieles, marco y hoja. La línea base es la de doble
 * riel (o la más frecuente); hay variante solo cuando la marca trae el perfil propio: marco de
 * monorriel o triple riel, un marco de otro ancho («marco 88 mm») o una hoja de otro ancho
 * («hoja 100 mm», con al menos dos productos). Cada variante lleva su pauta y sus tipologías.
 */
function slidingVariants(products: FolderProduct[], frameProfiles: Profile[], sashProfiles: Profile[]): { base?: SlidingVariant; extra: SlidingVariant[] } {
  const windows = products.filter(
    (product) => !/^\((M|X)\)/.test(product.tipo) && !isDoorProduct(product) && supplierFamily(product.typologyName || product.name) === 'sliding' && product.dm > 0,
  )
  if (!windows.length) return { extra: [] }
  const byRails = new Map<Rails, FolderProduct[]>()
  for (const product of windows) byRails.set(railsOf(product), [...(byRails.get(railsOf(product)) ?? []), product])
  const baseRails: Rails = byRails.has('doble') ? 'doble' : [...byRails.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
  const extra: SlidingVariant[] = []
  for (const [rails, list] of byRails) {
    if (rails === baseRails) continue
    if (frameProfiles.some((profile) => matchesRails(profile.name, rails))) extra.push({ rails, products: list, label: RAILS_LABEL[rails] })
  }
  // Otro ancho de marco con perfil propio («Corredera Marco 88 Mm» ↔ «Marco Corredera Doble Riel 88mm»).
  let baseProducts = byRails.get(baseRails) ?? []
  let baseToken: string | undefined
  const tokens = new Map<string, FolderProduct[]>()
  for (const product of baseProducts) {
    const token = frameTokenOf(product)
    if (token && frameProfiles.some((profile) => matchesRails(profile.name, baseRails) && nameNumbers(profile.name).includes(Number(token)))) {
      tokens.set(token, [...(tokens.get(token) ?? []), product])
    }
  }
  if (tokens.size >= 2) {
    const ordered = [...tokens.entries()].sort((a, b) => b[1].length - a[1].length)
    baseToken = ordered[0][0]
    for (const [token, list] of ordered.slice(1)) {
      extra.push({ rails: baseRails, frameToken: token, products: list, label: `marco ${token} mm` })
      baseProducts = baseProducts.filter((product) => !list.includes(product))
    }
  } else if (tokens.size === 1) baseToken = [...tokens.keys()][0]
  // Hoja: el par de la línea base es el de una hoja que la marca trae (no una hoja de puerta).
  const pairs = baseProducts.filter((product) => product.ah > 0 && product.dh > 0 && product.ah > product.dh).map((product) => [product.ah, product.dh] as const)
  const hasSash = (width: number) => sashProfiles.some((profile) => nameNumbers(profile.name).includes(width) || profile.face === width)
  const basePair = mode(pairs.filter(([width]) => hasSash(width)), (value) => value.join('/')) ?? mode(pairs, (value) => value.join('/'))
  if (basePair) {
    const widths = new Map<number, FolderProduct[]>()
    for (const product of baseProducts) if (product.ah > 0 && product.ah !== basePair[0]) widths.set(product.ah, [...(widths.get(product.ah) ?? []), product])
    for (const [width, list] of widths) {
      if (list.length < 2 || !hasSash(width)) continue
      const pair = mode(list.filter((product) => product.dh > 0).map((product) => [product.ah, product.dh] as const), (value) => value.join('/'))
      extra.push({ rails: baseRails, frameToken: baseToken, sashWidth: width, pair, products: list, label: `hoja ${String(width).replace('.', ',')} mm` })
    }
  }
  return { base: { rails: baseRails, frameToken: baseToken, pair: basePair, products: baseProducts, label: '' }, extra }
}

function lineKindFrom(line: LineDraft, models: ModelDraft[]): LineKind {
  if (line.verified) return line.verified.kind
  const families = line.products.map((product) => supplierFamily(product.typologyName || product.name))
  const sliding = families.filter((family) => family === 'sliding').length
  const casement = families.filter((family) => family === 'casement' || family === 'door').length
  if (sliding || casement) return sliding > casement ? 'sliding' : 'casement'
  if (/CORREDERA|CORREDIZA|SLIDING|SLIDE|SLD|AMERICAN|GUILLOTINA/.test(line.key)) return 'sliding'
  const slidingProfiles = models.filter((model) => /CORR|SLIDING|RIEL/.test(normalizeKey(model.names[0]?.text ?? ''))).length
  return slidingProfiles > models.length / 2 ? 'sliding' : 'casement'
}

// ── Colores en el código y perfiles por rol ─────────────────────────────────

const COLOR_ORDER = COLOR_PALETTE.map((color) => color.id)

function sortColors(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => {
    const ia = COLOR_ORDER.indexOf(a)
    const ib = COLOR_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
}

/** Acabados de aluminio: un riel mate sirve para cualquier color de PVC que no tenga riel propio. */
const METAL_FINISHES = new Set(['mate', 'acero-inox'])

/** Sufijos de SKU que la paleta no tiene pero las marcas usan (Kompen «-BLAN», Winhouse «NG» = nogal…). */
const EXTRA_COLOR_SUFFIXES: Record<string, string[]> = {
  blanco: ['BLAN', 'BCO'],
  nogal: ['NG', 'N'],
  negro: ['NEGR'],
  antracita: ['ANTR'],
  colonial: ['KOLO', 'COL'],
  anteak: ['ANTE', 'ATK'],
  caoba: ['CAOB'],
  mate: ['MA'],
}

function suffixesFor(colorId: string): string[] {
  return [...new Set([...colorSuffixes(colorId), ...(EXTRA_COLOR_SUFFIXES[colorId] ?? [])])].sort((a, b) => b.length - a.length)
}

const ANY_COLOR_SUFFIX = [...new Set(COLOR_PALETTE.flatMap((color) => suffixesFor(color.id)))].sort((a, b) => b.length - a.length)

/** Color explícito en el código o la descripción de una fila sin columna Color («…-4MT-NE», «riel negro»). */
function explicitColor(code: string, description: string): string | undefined {
  const sku = normalizeKey(code)
  const coded = sku.match(/[-_ /](BL|BLANCO|NE|NEGRO|NG|NO|NOGAL|AN|ANT|RD|GR|TI|WI)$/)
  if (coded) {
    const map: Record<string, string> = { BL: 'blanco', BLANCO: 'blanco', NE: 'negro', NEGRO: 'negro', NG: 'nogal', NO: 'nogal', NOGAL: 'nogal', AN: 'antracita', ANT: 'antracita', RD: 'roble-dorado', GR: 'grafito', TI: 'titanio', WI: 'winchester' }
    return map[coded[1]]
  }
  const word = normalizeKey(description).match(/\b(BLANCO|BLANCA|NEGRO|NEGRA|NOGAL|ANTRACITA|GRAFITO|ROBLE DORADO|WINCHESTER|TITANIO)\b/)
  return word ? normalizeColor(word[1]).id : undefined
}

interface PickContext {
  kind: LineKind
  pauta: Pauta
  rails?: Rails
  frameToken?: string
  /** Perfiles de la línea (o de su línea madre si es variante). */
  own: Profile[]
  /** Comunes de la marca (sin línea acreditada): disponibles para todas sus líneas. */
  commons: Profile[]
  /** Perfiles de las otras líneas de la marca: solo llenan un rol que no tiene ningún candidato. */
  siblings: Profile[]
  familyOf: (profile: Profile) => ProfileFamily
  links: (profile: Profile) => { frame: number; sash: number }
  colors: string[]
}

/** Familias que sirven igual en cualquier tipo de línea (no cambian de rol al pasar de practicable a corredera). */
const NEUTRAL_FAMILIES = new Set<ProfileFamily>(['bead', 'guide', 'interlock', 'mullion', 'french_mullion', 'threshold', 'coupler'])

/** ¿Este perfil puede ocupar el rol en una línea de este tipo? (compatibilidad antes que precio). */
function compatible(role: ProfileRole, profile: Profile, family: ProfileFamily, kind: LineKind): boolean {
  if (isComplementProfile(profile.name)) return false
  if (roleFor(family, kind) !== role) return false
  const text = normalizeKey(profile.name)
  if (role === 'bead') {
    if (kind === 'casement' && /CORREDERA|\bCORR\b|SLIDING/.test(text)) return false
    if (kind === 'sliding' && /PROYECTANTE|ABATIBLE|ABATIR|DOBLE CONTACTO|\bDC\b/.test(text) && !/CORR/.test(text)) return false
  }
  if (role === 'sliding_sash' && /PUERTA/.test(text)) return false
  if (role === 'guide' && /PLEGABLE|\bPLE\b|AMERICANA/.test(text) && kind === 'sliding') return false
  return true
}

function rankProfile(role: ProfileRole, profile: Profile, ctx: PickContext): number {
  const text = normalizeKey(profile.name)
  const numbers = nameNumbers(profile.name)
  const prices = profile.priceByColor ?? {}
  let value = 0
  const links = ctx.links(profile)
  value += (role.includes('frame') ? links.frame : role.includes('sash') ? links.sash : 0) * 3
  if (Object.values(prices).some((price) => price > 0)) value += 3
  if (ctx.colors.length) value += (2 * ctx.colors.filter((colorId) => (prices[colorId] ?? 0) > 0).length) / ctx.colors.length
  value += Object.keys(prices).length * 0.05
  const sashWidth = ctx.pauta.sashWidth
  switch (role) {
    case 'frame':
      if (/FIJO/.test(text)) value += 1
      if (/PUERTA|PTA\b/.test(text)) value -= 1
      break
    case 'sliding_frame': {
      const triple = /TRIPLE|3 RIELES|3 HOJAS/.test(text)
      const mono = /MONO\s*R+IEL|MONORIEL|1 RIEL/.test(text)
      const rails = ctx.rails ?? 'doble'
      if (rails === 'triple') value += triple ? 6 : -6
      else if (rails === 'mono') value += mono ? 6 : -6
      else value += triple || mono ? -6 : /DOBLE|2 RIELES|DOS RIELES/.test(text) ? 2 : 0
      if (ctx.frameToken) value += numbers.includes(Number(ctx.frameToken)) ? 4 : -1
      break
    }
    case 'sash':
    case 'sliding_sash':
      if (numbers.includes(sashWidth)) value += 4
      else if (role === 'sliding_sash' && /GRANDE|100/.test(text)) value -= 0.5
      if (role === 'sash' && /\bEXT/.test(text)) value += 0.5
      if (/PROYEC/.test(text)) value -= 0.25
      break
    case 'door_sash':
      if (/\bEXT/.test(text)) value += 0.5
      break
    case 'interlock':
      if (/TRASLAPO/.test(text)) value += 2
      if (numbers.includes(sashWidth)) value += 4
      if (/PUERTA|FIJO/.test(text)) value -= 2
      if (/MONO\s*R+IEL|MONORIEL/.test(text)) value += ctx.rails === 'mono' ? 3 : -3
      break
    case 'bead':
      {
        // El junquillo por defecto debe calzar con el termopanel de 20 mm (DVH 4+12+4).
        const range = text.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*(?:MM)?\b/)
        const min = range ? Number(range[1]) : undefined
        const max = range ? Number(range[2]) : undefined
        if (min !== undefined && max !== undefined && min <= 20 && max >= 20 && max <= 40) value += 3.5
        else if (/TERMOPANEL|DVH|\bTP\b|20 ?MM|24 ?MM/.test(text)) value += 1
        if ((max !== undefined && max < 10) || /MONOLITIC|SIMPLE|VID\. 4/.test(text)) value -= 1.5
      }
      if (ctx.kind === 'sliding' && /CORR/.test(text)) value += 1
      if (ctx.kind === 'casement' && /ABAT|PROYEC|DOBLE CONTACTO/.test(text)) value += 1
      break
    case 'mullion':
      if (/TRAVESA|PALILLO|BARRA T|POSTE|MONTANTE/.test(text)) value += 1
      break
    case 'french_mullion':
      if (/INVERSOR|BATIENTE/.test(text)) value += 1
      break
    case 'guide':
      if (/ALUMINIO|RIEL|GUIA/.test(text)) value += 0.5
      break
    case 'coupler':
      if (/UNION|ACOPLE/.test(text)) value += 1
      break
  }
  return value
}

/** Perfil por defecto de un rol: primero lo compatible de la línea, después los comunes de la marca y, si no hay nada, otra línea de la marca. */
function pickProfile(role: ProfileRole, ctx: PickContext, allowSiblings: boolean): Profile | undefined {
  const tiers: [Profile[], number][] = [
    [ctx.own, 3],
    [ctx.commons, 0],
  ]
  const scored = tiers.flatMap(([list, bonus]) =>
    list.filter((profile) => compatible(role, profile, ctx.familyOf(profile), ctx.kind)).map((profile) => ({ profile, score: rankProfile(role, profile, ctx) + bonus })),
  )
  if (!scored.length && allowSiblings) {
    for (const profile of ctx.siblings) {
      const family = ctx.familyOf(profile)
      // De otra línea solo se toman familias neutras (junquillo, riel, traslapo…) o marco/hoja de una línea del mismo tipo.
      if (!NEUTRAL_FAMILIES.has(family)) continue
      if (compatible(role, profile, family, ctx.kind)) scored.push({ profile, score: rankProfile(role, profile, ctx) })
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.profile.code.localeCompare(b.profile.code))[0]?.profile
}

/** Fusiona modelos cuyo código es el de otro modelo + un sufijo de color («HC66AN» nogal → «HC66A»). */
function mergeColorSuffixModels(models: Map<string, ModelDraft>, rowModel: Map<string, ModelDraft>, conflicts: BrandImportReport['colorConflicts']): number {
  let merged = 0
  for (const key of [...models.keys()].sort((a, b) => b.length - a.length)) {
    const draft = models.get(key)
    if (!draft || !draft.colored.size) continue
    const colors = [...draft.colored.keys()]
    for (const suffix of ANY_COLOR_SUFFIX) {
      if (!key.endsWith(suffix)) continue
      // Una sola letra solo vale como «N» de nogal (M&E, Optimaline); «A», «B», «R» suelen ser parte del modelo.
      if (suffix.length === 1 && !(suffix === 'N' && colors.every((colorId) => colorId === 'nogal'))) continue
      const stem = key.slice(0, -suffix.length)
      if (stem.length < 3 || (!/\d/.test(stem) && stem.length < 4)) continue
      const target = models.get(stem)
      if (!target || target === draft) continue
      if (!colors.every((colorId) => suffixesFor(colorId).includes(suffix))) {
        conflicts.push({ code: draft.code, column: colors.join(', '), note: `el código termina en «${suffix}», que no corresponde a ese color` })
        break
      }
      const clash = colors.some((colorId) => {
        const current = target.colored.get(colorId)
        const incoming = draft.colored.get(colorId)!
        return current && current.price > 0 && incoming.price > 0 && Math.round(current.price) !== Math.round(incoming.price)
      })
      if (clash) {
        conflicts.push({ code: draft.code, column: colors.join(', '), note: `precio distinto al de ${target.code} en el mismo color` })
        break
      }
      for (const [colorId, variant] of draft.colored) {
        const current = target.colored.get(colorId)
        if (!current || variant.score > current.score) target.colored.set(colorId, variant)
      }
      if (draft.colorless && (!target.colorless || draft.colorless.score > target.colorless.score)) target.colorless = draft.colorless
      target.names.push(...draft.names)
      target.families.push(...draft.families)
      for (const sku of draft.skus) target.skus.add(sku)
      for (const rowId of draft.rowIds) {
        target.rowIds.add(rowId)
        rowModel.set(rowId, target)
      }
      for (const [lineKey, votes] of draft.votes) target.votes.set(lineKey, (target.votes.get(lineKey) ?? 0) + votes)
      target.links.frame += draft.links.frame
      target.links.sash += draft.links.sash
      for (const id of draft.linked.frame) target.linked.frame.add(id)
      for (const id of draft.linked.sash) target.linked.sash.add(id)
      target.barLength ??= draft.barLength
      models.delete(key)
      merged++
      break
    }
  }
  return merged
}

// ── Importación ──────────────────────────────────────────────────────────────

const CODE_REF = /\b(Ma|Marco|Ho|Hoja)\s*:\s*([\w.\-/]+)/gi
const AVISO_REF = /perfil (marco|hoja) (\d+)/i

/**
 * Lee la carpeta de datos de marcas y arma el catálogo base. Nunca lanza por datos
 * incompletos: devuelve lo que pudo importar y un reporte con cifras y avisos.
 */
export function importBrandData(sourceDir: string = DEFAULT_SOURCE_DIR): ImportResult {
  const report: ImportReport = {
    sourceDir,
    files: { read: 0, duplicates: [] },
    rows: { total: 0, unique: 0, deprecated: 0, virtual: 0, junk: 0, zeroPrice: 0, placeholderPrice: 0, outlierPrice: 0 },
    brands: [],
    totals: { ...catalogStats({ colors: [], brands: [], lines: [], profiles: [], items: [], glass: [], brandSettings: [] }), genericItemsUsed: 0 },
    readiness: { ready: 0, warnings: 0, geometry: 0 },
    warnings: [],
  }
  const rows = readPriceLists(sourceDir, report)
  classifyPrices(rows, report)
  const folders = readFolders(sourceDir, report)
  const dateNote = report.priceListDate ? `lista de precios del ${report.priceListDate}` : 'lista de precios importada'

  const rowsByBrand = new Map<string, SourceRow[]>()
  const rawBrandName = new Map<string, string>()
  for (const row of rows) {
    const key = brandKey(row.brand)
    rowsByBrand.set(key, [...(rowsByBrand.get(key) ?? []), row])
    if (!rawBrandName.has(key)) rawBrandName.set(key, row.brand)
  }
  for (const [key, folder] of folders) if (!rawBrandName.has(key)) rawBrandName.set(key, folder.name)

  const colorsById = new Map<string, Color>()
  const useColor = (id: string): void => {
    if (colorsById.has(id)) return
    const known = COLOR_PALETTE.find((color) => color.id === id)
    colorsById.set(id, known ?? normalizeColor(id.replace(/-/g, ' ')))
  }

  const catalog: Catalog = { colors: [], brands: [], lines: [], profiles: [], items: [], glass: [], brandSettings: [] }
  const genericItemIds = new Set<string>()
  const genericHardware: Item[] = []
  const deferredRules: { line: Line; brandItems: Item[]; report: LineImportReport; related?: string[] }[] = []

  const brandKeys = [...rawBrandName.keys()].sort((a, b) => a.localeCompare(b))
  // HERRAJES GENERICOS primero: sus artículos sirven de respaldo para todas las marcas.
  brandKeys.sort((a, b) => (a === 'HERRAJESGENERICOS' ? -1 : b === 'HERRAJESGENERICOS' ? 1 : 0))

  for (const key of brandKeys) {
    const raw = rawBrandName.get(key)!
    const name = brandDisplayName(raw)
    const brandId = slug(name)
    const deprecated = /NO\s*USAR/i.test(raw)
    const isGlassBrand = key.startsWith('VIDRIOS')
    const brandRows = (rowsByBrand.get(key) ?? []).filter((row) => row.status === 'ok' && !SKIP_GROUPS.has(normalizeKey(row.group)))
    const folder = folders.get(key)
    const brandReport: BrandImportReport = {
      id: brandId,
      name,
      enabled: false,
      kind: 'profiles',
      products: folder?.products.length ?? 0,
      lines: [],
      profiles: 0,
      profilesPriced: 0,
      items: 0,
      itemsPriced: 0,
      glass: 0,
      glassPriced: 0,
      colors: [],
      warnings: [],
      doubtfulUnits: [],
      duplicates: [],
      codeConflicts: [],
      glassNotes: [],
      discardedPrices: [],
      colorConflicts: [],
    }
    if (deprecated) brandReport.warnings.push('La marca viene marcada «no usar» por el proveedor: queda desactivada.')
    const rule = brandRuleFor(name)

    // ── Ítems y vidrios ──
    const items: Item[] = []
    const glass: Glass[] = []
    const itemIds = new Set<string>()
    const itemBySignature = new Map<string, Item>()
    const itemsByCode = new Map<string, Item[]>()
    const glassByName = new Map<string, { glass: Glass; plausible: boolean; note?: string }>()
    const profileRows: SourceRow[] = []
    for (const row of brandRows) {
      const group = normalizeKey(row.group)
      const subtype = normalizeKey(row.subtype)
      if (!isGlassBrand && PROFILE_GROUPS.has(group) && subtype !== 'VIDRIO') {
        profileRows.push(row)
        continue
      }
      // Solo se lee como vidrio lo que la lista declara vidrio (grupo o subtipo), nunca por la marca:
      // las listas de vidrios también traen siliconas, paletas y herramientas.
      const glassRow = group === 'VIDRIO' || subtype === 'VIDRIO' || /^V\./.test(subtype)
      const notGlassSupply = /SEPARADOR|SELLADOR|EVA\b|BUTILO|TAMIZ/.test(normalizeKey(`${row.subtype} ${row.description}`))
      const parsedGlass = glassRow && !notGlassSupply ? parseGlass(row.description, chamberFromColor(row.color)) : undefined
      if (parsedGlass) {
        const chamber = chamberFromColor(row.color)
        const colorNote = chamber && !/C[AÁ]MARA/i.test(row.description) ? ` (cámara ${row.color.trim().toLocaleLowerCase('es-CL')})` : ''
        const glassName = cleanLabel(parsedGlass.name) + colorNote
        const plausible = isPlausibleGlassPrice(row.value)
        const entry: Glass = {
          id: `${brandId}.${slug(glassName)}`,
          brandId,
          name: glassName,
          kind: parsedGlass.kind,
          thickness: parsedGlass.thickness,
          ...(parsedGlass.composition ? { composition: parsedGlass.composition } : {}),
          pricePerM2: plausible ? Math.round(row.value) : 0,
          ...(parsedGlass.weightKgM2 ? { weightKgM2: parsedGlass.weightKgM2 } : {}),
        }
        if (!plausible && row.value > 0) report.rows.outlierPrice++
        const nameKey = normalizeKey(glassName)
        const current = glassByName.get(nameKey)
        if (current && current.glass.pricePerM2 !== entry.pricePerM2 && entry.pricePerM2 > 0 && current.glass.pricePerM2 > 0) {
          brandReport.glassNotes.push({ name: glassName, note: `otra tarifa con el mismo nombre (${entry.pricePerM2.toLocaleString('es-CL')}/m², fila ${row.id}): se conserva la primera` })
        }
        if (!current || (plausible && !current.plausible)) glassByName.set(nameKey, { glass: entry, plausible, note: parsedGlass.doubtful })
        continue
      }
      if (isGlassBrand && !glassRow && !notGlassSupply && /ESPEJO|MIRROR/.test(normalizeKey(row.description))) {
        brandReport.glassNotes.push({ name: cleanLabel(row.description), note: 'viene en la lista de vidrios pero no es un vidrio: queda como artículo' })
      }
      const description = cleanLabel(row.description)
      if (!description) continue
      const inferred = inferUnit(description, row.value)
      const legacy = normalizeKey(description).match(/^(\d[\dA-Z.]{5,})\s/)?.[1]
      const code = row.code || legacy || ''
      const price = row.value > 0 ? Math.round(row.value * 100) / 100 : 0
      const displayed = displayName(description)
      // Duplicado comercial exacto (mismo código, nombre, unidad, envase y precio): se conserva el primero.
      const signature = [normalizeKey(code), normalizeKey(displayed), inferred.unit, inferred.packSize ?? '', price].join('|')
      const twin = itemBySignature.get(signature)
      if (twin) {
        const entry = brandReport.duplicates.find((duplicate) => duplicate.keptId === twin.id)
        if (entry) entry.rowIds.push(row.id)
        else brandReport.duplicates.push({ keptId: twin.id, rowIds: [row.id], name: twin.name })
        continue
      }
      let id = `${brandId}.${slug(code || description)}`
      for (let n = 2; itemIds.has(id); n++) id = `${brandId}.${slug(code || description)}-${n}`
      itemIds.add(id)
      const item: Item = {
        id,
        brandId,
        kind: itemKind(row.group, description),
        code,
        name: displayed,
        unit: inferred.unit,
        ...(inferred.packSize ? { packSize: inferred.packSize } : {}),
        price,
      }
      items.push(item)
      itemBySignature.set(signature, item)
      if (code) itemsByCode.set(normalizeKey(code), [...(itemsByCode.get(normalizeKey(code)) ?? []), item])
      if (inferred.doubtful) brandReport.doubtfulUnits.push({ id, name: displayed, note: inferred.doubtful })
    }
    for (const [code, list] of itemsByCode) if (list.length > 1) brandReport.codeConflicts.push({ code, ids: list.map((entry) => entry.id) })
    for (const entry of glassByName.values()) {
      glass.push(entry.glass)
      if (entry.note) brandReport.glassNotes.push({ name: entry.glass.name, note: entry.note })
    }
    if (key === 'HERRAJESGENERICOS') genericHardware.push(...items)

    // ── Líneas declaradas ──
    const lines: LineDraft[] = []
    if (!isGlassBrand) {
      const originalCase = new Map<string, string>()
      for (const product of folder?.products ?? []) if (product.lineName) originalCase.set(normalizeKey(product.lineName), product.lineName)
      for (const row of profileRows) if (row.line) originalCase.set(normalizeKey(row.line), row.line)
      for (const declared of folder?.lines ?? []) {
        if (/DISCONTINU|NO\s*USAR/i.test(declared.nombre)) continue
        const lineKey = normalizeKey(cleanLabel(declared.nombre))
        if (lines.some((line) => line.key === lineKey)) continue
        const lineName = cleanLabel(originalCase.get(normalizeKey(declared.nombre)) ?? declared.nombre)
        lines.push({ key: lineKey, name: lineName, id: `${brandId}.${slug(lineName)}`, fromFolder: true, products: [], verified: rule === 'proline' ? PROLINE_LINES[lineKey] : undefined })
      }
      for (const row of profileRows) {
        if (!row.line || matchLine(row.line, lines)) continue
        const lineName = cleanLabel(row.line).replace(/"+$/, '')
        const lineKey = normalizeKey(lineName)
        if (!lineKey || lines.some((line) => line.key === lineKey) || /AUXILIAR|COMPLEMENTARIO/.test(lineKey)) continue
        lines.push({ key: lineKey, name: lineName, id: `${brandId}.${slug(lineName)}`, fromFolder: false, products: [] })
      }
      for (const product of folder?.products ?? []) {
        const line = matchLine(product.lineName, lines)
        if (line) line.products.push(product)
      }
    }

    // ── Perfiles: agrupar variantes de color por modelo ──
    const models = new Map<string, ModelDraft>()
    const rowModel = new Map<string, ModelDraft>()
    const reliableCodeColors = rule === 'kompen' || rule === 'termico' || rule === 'windoline'
    const pending: SourceRow[] = []
    const addRow = (row: SourceRow, model: string, colorId: string | undefined) => {
      const groupKey = modelGroupKey(model)
      let draft = models.get(groupKey)
      if (!draft) {
        draft = {
          key: groupKey,
          code: model,
          names: [],
          families: [],
          skus: new Set(),
          rowIds: new Set(),
          colored: new Map(),
          votes: new Map(),
          links: { frame: 0, sash: 0 },
          linked: { frame: new Set(), sash: new Set() },
        }
        models.set(groupKey, draft)
      }
      const rowId = Number(row.id) || Number.MAX_SAFE_INTEGER
      draft.names.push({ text: row.description, rowId })
      draft.families.push(profileFamily(row.subtype, row.description))
      if (row.code) draft.skus.add(modelGroupKey(row.code))
      draft.rowIds.add(row.id)
      rowModel.set(row.id, draft)
      draft.barLength ??= parseBarLength(row.description, row.code)
      const price = row.value > 0 && row.value <= MAX_PROFILE_PRICE ? row.value : 0
      if (row.value > MAX_PROFILE_PRICE) brandReport.discardedPrices.push({ rowId: row.id, code: row.code, value: row.value })
      if (colorId) {
        const codeColor = colorFromCode(name, row.code)
        if (codeColor && codeColor !== colorId && !isColorless(row.color)) {
          brandReport.colorConflicts.push({ code: row.code, column: row.color, note: `el código dice ${codeColor}` })
        }
        const score = (codeColor === colorId ? 2 : 0) + (price > 0 ? 1 : 0)
        const current = draft.colored.get(colorId)
        if (!current || score > current.score || (score === current.score && rowId < current.rowId)) draft.colored.set(colorId, { price, rowId, score })
      } else {
        const score = price > 0 ? 1 : 0
        if (!draft.colorless || score > draft.colorless.score || (score === draft.colorless.score && rowId < draft.colorless.rowId)) draft.colorless = { price, rowId, score }
      }
      if (row.line) {
        const line = matchLine(row.line, lines)
        if (line) draft.votes.set(line.key, (draft.votes.get(line.key) ?? 0) + 3)
      }
    }
    for (const row of profileRows) {
      const colorless = isColorless(row.color)
      const colorId = colorless ? (reliableCodeColors ? colorFromCode(name, row.code) : undefined) : normalizeColor(row.color).id
      if (!colorId) {
        pending.push(row)
        continue
      }
      addRow(row, profileModelCode(name, row.code, row.description, colorId), colorId)
    }
    for (const row of pending) {
      // Sin columna Color: un color explícito en el código o el nombre («…-4MT-NE», «riel negro») se respeta;
      // solo lo que de verdad no dice color se trata como neutro.
      const family = profileFamily(row.subtype, row.description)
      const explicit = family === 'reinforcement' ? undefined : explicitColor(row.code, row.description)
      let model = profileModelCode(name, row.code, row.description, explicit)
      if (!models.has(modelGroupKey(model))) {
        const candidate = strippedModelCandidates(row.code).find((stem) => models.has(modelGroupKey(stem)))
        if (candidate) model = candidate
      }
      addRow(row, model, explicit)
    }
    const mergedSuffixes = mergeColorSuffixModels(models, rowModel, brandReport.colorConflicts)
    if (mergedSuffixes) brandReport.warnings.push(`${mergedSuffixes} perfiles venían separados por el color en el código (BL, NO, NG, N…): quedaron unidos a su modelo.`)
    for (const draft of models.values()) {
      draft.names.sort((a, b) => a.rowId - b.rowId)
      draft.face = rule === 'proline' ? PROLINE_FACES[draft.code] : undefined
    }

    // Vínculos producto → perfil (códigos en el nombre y avisos con el ID de la lista).
    const findModel = (ref: string): ModelDraft | undefined => {
      const token = rule === 'proline' ? prolineToken(`PRO${ref.replace(/^pro/i, '')}`) : undefined
      const refKey = modelGroupKey(rule === 'proline' && /^pro/i.test(ref) && token ? token : ref)
      const direct = models.get(refKey)
      if (direct) return direct
      for (const draft of models.values()) {
        if (draft.skus.has(refKey)) return draft
        if (draft.key.startsWith(refKey) && !/\d/.test(draft.key.slice(refKey.length))) return draft
      }
      for (const draft of models.values()) for (const sku of draft.skus) if (sku.startsWith(refKey) && !/\d/.test(sku.slice(refKey.length))) return draft
      return undefined
    }
    for (const line of lines) {
      for (const product of line.products) {
        const refs = [...(product.name.match(/\(([^)]*)\)/g) ?? [])].join(' ')
        for (const match of refs.matchAll(CODE_REF)) {
          const draft = findModel(match[2])
          if (!draft) continue
          draft.votes.set(line.key, (draft.votes.get(line.key) ?? 0) + 2)
          if (/^ma/i.test(match[1])) {
            draft.links.frame++
            draft.linked.frame.add(product.id)
          } else {
            draft.links.sash++
            draft.linked.sash.add(product.id)
          }
        }
        for (const aviso of product.avisos) {
          const match = aviso.match(AVISO_REF)
          const draft = match ? rowModel.get(match[2]) : undefined
          if (!draft) continue
          draft.votes.set(line.key, (draft.votes.get(line.key) ?? 0) + 2)
          if (match![1].toLowerCase() === 'marco') {
            draft.links.frame++
            draft.linked.frame.add(product.id)
          } else {
            draft.links.sash++
            draft.linked.sash.add(product.id)
          }
        }
      }
    }
    // Datos verificados de Proline.
    if (rule === 'proline') {
      for (const line of lines) {
        for (const model of line.verified?.models ?? []) {
          const draft = models.get(modelGroupKey(model))
          if (draft) draft.votes.set(line.key, (draft.votes.get(line.key) ?? 0) + 100)
        }
      }
      for (const draft of models.values()) {
        const lineKey = PROLINE_REINFORCEMENT_LINE[draft.code]
        if (lineKey && lines.some((line) => line.key === lineKey)) draft.votes.set(lineKey, (draft.votes.get(lineKey) ?? 0) + 100)
      }
    }
    // Tokens distintivos del nombre de la línea en el código o la descripción.
    const tokenOwners = new Map<string, string[]>()
    for (const line of lines) for (const token of lineTokens(line.key)) tokenOwners.set(token, [...(tokenOwners.get(token) ?? []), line.key])
    for (const draft of models.values()) {
      if (draft.votes.size) continue
      const haystackCode = [...draft.skus, draft.key].join(' ')
      const haystackText = normalizeKey(draft.names.map((entry) => entry.text).join(' '))
      for (const [token, owners] of tokenOwners) {
        if (owners.length !== 1) continue
        const numeric = /^\d+$/.test(token)
        const hit = numeric
          ? token.length >= 3
            ? haystackCode.includes(token) || new RegExp(`(?<!\\d)${token}(?!\\d)`).test(haystackText)
            : new RegExp(`(?<!\\d)${token}(?!\\d)`).test(haystackText)
          : /\d/.test(token) && token.length >= 3
            ? haystackCode.includes(token) || new RegExp(`\\b${token}\\b`).test(haystackText)
            : new RegExp(`\\b${token}\\b`).test(haystackText)
        if (hit) draft.votes.set(owners[0], (draft.votes.get(owners[0]) ?? 0) + (numeric && token.length < 3 ? 1 : 2))
      }
    }

    const familyOf = (draft: ModelDraft): ProfileFamily => {
      const specific = draft.families.filter((family) => family !== 'other')
      // Si alguna fila lo reconoce como complemento (rótula, tapa, mosquitero…), manda eso.
      if (draft.names.some((entry) => isComplementProfile(entry.text))) return 'other'
      return (mode(specific) ?? 'other') as ProfileFamily
    }
    const assign = (candidates: LineDraft[]) => {
      for (const draft of models.values()) {
        let best: string | undefined
        let bestVotes = 0
        for (const [lineKey, votes] of draft.votes) {
          if (!candidates.some((line) => line.key === lineKey)) continue
          if (votes > bestVotes) {
            best = lineKey
            bestVotes = votes
          }
        }
        draft.lineKey = best
      }
    }
    assign(lines)
    // Las líneas que sólo aparecen en la lista se conservan si tienen marco u hoja propios.
    // Las de la carpeta, si tienen perfiles o al menos una ventana con pauta (marcas «solo geometría»).
    const keptLines = lines.filter((line) => {
      const owned = [...models.values()].filter((draft) => draft.lineKey === line.key)
      if (!line.fromFolder) return owned.some((draft) => ['frame', 'sash', 'door_sash'].includes(familyOf(draft)))
      return owned.length > 0 || line.products.some((product) => product.dm > 0 && !/^\((M|X)\)/.test(product.tipo))
    })
    assign(keptLines)
    if (!keptLines.length && models.size && !isGlassBrand) {
      // Marca con perfiles pero sin líneas: una línea con su nombre.
      const lineName = name
      keptLines.push({ key: normalizeKey(lineName), name: lineName, id: `${brandId}.${slug(lineName)}`, fromFolder: false, products: [] })
    }
    // Tipo de cada línea antes de repartir los comunes (para que no lo decidan ellos).
    const lineKinds = new Map(keptLines.map((line) => [line.key, lineKindFrom(line, [...models.values()].filter((draft) => draft.lineKey === line.key))]))
    const counts = new Map<string, number>()
    for (const draft of models.values()) if (draft.lineKey) counts.set(draft.lineKey, (counts.get(draft.lineKey) ?? 0) + 1)
    const largest = (list: LineDraft[]) => [...list].sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0) || b.products.length - a.products.length)[0]
    const homeFor = (hint: LineKind | undefined): LineDraft | undefined => {
      if (rule === 'proline' && hint !== 'sliding') {
        const pro6004 = keptLines.find((line) => line.key === 'PRO6004')
        if (pro6004) return pro6004
      }
      const ofKind = hint ? keptLines.filter((line) => lineKinds.get(line.key) === hint) : []
      return largest(ofKind.length ? ofKind : keptLines)
    }
    // Perfiles sin línea acreditada: comunes de la marca. Se guardan una vez (en una línea del tipo
    // que sugiere su nombre) y quedan disponibles para elegir en todas las líneas de la marca.
    let commonCount = 0
    for (const draft of models.values()) {
      if (draft.lineKey || !keptLines.length) continue
      const text = normalizeKey(draft.names.map((entry) => entry.text).join(' '))
      const hint: LineKind | undefined = /CORR|SLID|SLD|\bRIEL|TRASLAPO|GUIA|MONOR/.test(text)
        ? 'sliding'
        : /PUERTA|ABAT|PROYEC|DOBLE CONTACTO|\bDC\b|BATIENTE|INVERSOR|OSCILO/.test(text)
          ? 'casement'
          : undefined
      const home = homeFor(hint)
      if (!home) continue
      draft.lineKey = home.key
      draft.common = true
      commonCount++
    }
    if (commonCount) brandReport.warnings.push(`${commonCount} perfiles comunes (uniones, ángulos, rieles, junquillos…) sin línea acreditada: quedan disponibles para todas las líneas de la marca.`)

    // ── Perfiles de cada línea ──
    const brandLines: Line[] = []
    const brandProfiles: Profile[] = []
    const familyById = new Map<string, ProfileFamily>()
    const draftById = new Map<string, ModelDraft>()
    const seenColorsOf = new Map<string, string[]>()
    let neutralFills = 0
    for (const draftLine of keptLines) {
      const lineModels = [...models.values()].filter((draft) => draft.lineKey === draftLine.key)
      const kind = lineKinds.get(draftLine.key)!
      // Colores vistos en la línea (marco u hoja con precio; si no, todos): sirven para replicar precios neutros.
      const seen = new Set<string>()
      for (const draft of lineModels) {
        if (['frame', 'sash', 'door_sash'].includes(familyOf(draft))) for (const [colorId, variant] of draft.colored) if (variant.price > 0) seen.add(colorId)
      }
      if (!seen.size) for (const draft of lineModels) if (!draft.common) for (const colorId of draft.colored.keys()) seen.add(colorId)
      if (!seen.size) seen.add('blanco')
      const seenColors = sortColors([...seen].filter((colorId) => !METAL_FINISHES.has(colorId))).length ? sortColors([...seen].filter((colorId) => !METAL_FINISHES.has(colorId))) : sortColors(seen)
      seenColorsOf.set(draftLine.key, seenColors)
      for (const draft of lineModels) {
        const family = familyOf(draft)
        const role = roleFor(family, kind)
        const priceByColor: Record<string, number> = {}
        for (const [colorId, variant] of draft.colored) {
          priceByColor[colorId] = Math.round(variant.price)
          useColor(colorId)
        }
        if (draft.colorless) {
          const price = Math.round(draft.colorless.price)
          if (!draft.colored.size || family === 'reinforcement' || family === 'guide' || family === 'threshold') {
            for (const colorId of seenColors) if (!(priceByColor[colorId] > 0)) priceByColor[colorId] = price
          } else if (!priceByColor.blanco) priceByColor.blanco = price
        }
        // Riel o umbral de aluminio con un solo acabado metálico: vale para los colores de PVC sin riel propio.
        if (family === 'guide' || family === 'threshold') {
          const metal = Object.entries(priceByColor).find(([colorId, price]) => METAL_FINISHES.has(colorId) && price > 0)
          if (metal) {
            for (const colorId of seenColors) {
              if (priceByColor[colorId] > 0) continue
              priceByColor[colorId] = metal[1]
              neutralFills++
            }
          }
        }
        for (const colorId of Object.keys(priceByColor)) useColor(colorId)
        const firstName = draft.names[0]?.text ?? draft.code
        const face = draft.face ?? parseFace(family, firstName)
        const profile: Profile = {
          id: `${draftLine.id}.${slug(draft.code)}`,
          lineId: draftLine.id,
          code: draft.code,
          name: displayName(firstName, { stripColor: true, stripToken: rule === 'proline' ? draft.code : undefined }) || draft.code,
          role,
          ...(face ? { face } : {}),
          barLength: draft.barLength ?? 5800,
          priceByColor,
        }
        brandProfiles.push(profile)
        familyById.set(profile.id, family)
        draftById.set(profile.id, draft)
      }
    }
    if (neutralFills) brandReport.warnings.push('Los rieles o umbrales de aluminio con un solo acabado (mate) se cotizan con ese precio en los colores de PVC que no traen riel propio.')

    // ── Líneas y variantes de pauta ──
    interface LinePlan {
      draft: LineDraft
      kind: LineKind
      products: FolderProduct[]
      parent?: LinePlan
      variant?: SlidingVariant
    }
    const plans: LinePlan[] = []
    for (const draftLine of keptLines) {
      const kind = lineKinds.get(draftLine.key)!
      if (kind !== 'sliding') {
        plans.push({ draft: draftLine, kind, products: draftLine.products })
        continue
      }
      const candidates = brandProfiles.filter((profile) => profile.lineId === draftLine.id || draftById.get(profile.id)?.common)
      const usable = (role: ProfileRole) => candidates.filter((profile) => profile.role === role && compatible(role, profile, familyById.get(profile.id) ?? 'other', kind))
      const { base, extra } = slidingVariants(draftLine.products, usable('sliding_frame'), usable('sliding_sash'))
      const basePlan: LinePlan = { draft: draftLine, kind, products: base?.products ?? draftLine.products, variant: base }
      plans.push(basePlan)
      for (const variant of extra) {
        const label = variant.label
        plans.push({
          draft: { key: `${draftLine.key} · ${normalizeKey(label)}`, name: `${draftLine.name} · ${label}`, id: `${draftLine.id}-${slug(label)}`, fromFolder: draftLine.fromFolder, products: variant.products },
          kind,
          products: variant.products,
          parent: basePlan,
          variant,
        })
      }
    }

    for (const plan of plans) {
      const { draft: draftLine, kind } = plan
      const ownerId = plan.parent?.draft.id ?? draftLine.id
      const verified = plan.parent ? undefined : draftLine.verified
      const derived = derivePauta(kind, plan.products)
      let pauta = verified?.pauta ?? derived.pauta
      // El ancho y descuento de hoja corresponden a la hoja de la variante (no a la moda de toda la línea).
      if (!verified && plan.variant?.pair) pauta = { ...pauta, sashWidth: plan.variant.pair[0], sashDeduction: plan.variant.pair[1] }
      const doorPauta = verified?.doorPauta ?? derived.doorPauta
      const planProductIds = new Set(plan.products.map((product) => product.id))
      const own = brandProfiles.filter((profile) => profile.lineId === ownerId && !draftById.get(profile.id)?.common)
      const commons = brandProfiles.filter((profile) => draftById.get(profile.id)?.common)
      const siblings = brandProfiles.filter((profile) => profile.lineId !== ownerId && !draftById.get(profile.id)?.common)
      const ctx: PickContext = {
        kind,
        pauta,
        rails: plan.variant?.rails,
        frameToken: plan.variant?.frameToken,
        own,
        commons,
        siblings,
        familyOf: (profile) => familyById.get(profile.id) ?? 'other',
        links: (profile) => {
          const draft = draftById.get(profile.id)
          if (!draft) return { frame: 0, sash: 0 }
          return { frame: [...draft.linked.frame].filter((id) => planProductIds.has(id)).length, sash: [...draft.linked.sash].filter((id) => planProductIds.has(id)).length }
        },
        colors: seenColorsOf.get(plan.parent?.draft.key ?? draftLine.key) ?? [],
      }
      const roles: Partial<Record<ProfileRole, string>> = {}
      const rolesToPick: ProfileRole[] =
        kind === 'sliding'
          ? ['sliding_frame', 'sliding_sash', 'interlock', 'bead', 'guide', 'mullion', 'coupler']
          : ['frame', 'sash', 'door_sash', 'mullion', 'bead', 'french_mullion', 'threshold', 'coupler']
      // Riel, umbral y unión pueden venir de otra línea de la marca; marco, hoja, junquillo o traslapo
      // son de cada sistema y nunca se toman prestados.
      const borrowable = new Set<ProfileRole>(['guide', 'threshold', 'coupler'])
      for (const role of rolesToPick) {
        const found = pickProfile(role, ctx, borrowable.has(role))
        if (found) roles[role] = found.id
      }
      // Pauta coherente con la hoja elegida: si la hoja tiene otro ancho que la moda, se usa el par de sus productos.
      const sashDefault = brandProfiles.find((profile) => profile.id === (roles.sash ?? roles.sliding_sash))
      if (!verified && sashDefault && !plan.variant?.pair) {
        const widths = new Set([...nameNumbers(sashDefault.name), ...(sashDefault.face ? [sashDefault.face] : [])])
        if (!widths.has(pauta.sashWidth)) {
          const pair = mode(
            plan.products.filter((product) => !isDoorProduct(product) && widths.has(product.ah) && product.dh > 0 && product.ah > product.dh).map((product) => [product.ah, product.dh] as const),
            (value) => value.join('/'),
          )
          if (pair) pauta = { ...pauta, sashWidth: pair[0], sashDeduction: pair[1] }
        }
      }
      let sashInProfileId: string | undefined
      if (verified) {
        for (const [role, model] of Object.entries(verified.roles) as [ProfileRole, string][]) {
          const target = brandProfiles.find((profile) => modelGroupKey(profile.code) === modelGroupKey(model))
          if (target) roles[role] = target.id
        }
        const sashIn = verified.sashIn && brandProfiles.find((profile) => modelGroupKey(profile.code) === modelGroupKey(verified.sashIn!))
        if (sashIn) sashInProfileId = sashIn.id
      } else if (kind === 'casement' && roles.sash) {
        const current = brandProfiles.find((profile) => profile.id === roles.sash)
        const interior = own.find((profile) => profile.role === 'sash' && profile.id !== roles.sash && /\bINT/.test(normalizeKey(profile.name)) && !isComplementProfile(profile.name))
        if (current && interior && /\bEXT/.test(normalizeKey(current.name))) sashInProfileId = interior.id
      }

      // Colores que ofrece: los del marco y la hoja por defecto con precio (si no hay precios, los vistos).
      const defaults = [roles.frame ?? roles.sliding_frame, roles.sash ?? roles.sliding_sash, roles.door_sash]
        .map((id) => brandProfiles.find((profile) => profile.id === id))
        .filter((profile): profile is Profile => Boolean(profile))
      const offered = new Set<string>()
      for (const profile of defaults) for (const [colorId, price] of Object.entries(profile.priceByColor)) if (price > 0 && !METAL_FINISHES.has(colorId)) offered.add(colorId)
      const colorIds = offered.size ? sortColors(offered) : (seenColorsOf.get(plan.parent?.draft.key ?? draftLine.key) ?? ['blanco'])
      colorIds.forEach(useColor)

      // Tipologías que fabrica: solo equivalencias exactas con los productos del fabricante.
      const allowed = new Set<TypologyId>(kind === 'sliding' ? SLIDING_TYPOLOGIES : CASEMENT_TYPOLOGIES)
      const typologySet = new Set<TypologyId>()
      let approximate = 0
      for (const product of plan.products) {
        if (/^\((M|X)\)/.test(product.tipo)) continue
        const match = typologyMatch(product.typologyName) ?? typologyMatch(product.name)
        if (!match || !allowed.has(match.id)) continue
        if (match.exact) typologySet.add(match.id)
        else approximate++
      }
      if (!typologySet.size && plan.variant?.rails === 'mono') typologySet.add('sliding_mono')
      if (!typologySet.size && plan.variant?.rails === 'triple') typologySet.add('sliding_3_rail')
      if (plan.variant?.rails === 'mono') for (const id of [...typologySet]) if (id !== 'sliding_mono') typologySet.delete(id)
      // Compuestas que el motor arma con el travesaño de la línea (datos verificados: fijo + abatible…),
      // solo si la línea tiene los perfiles que piden (hoja de puerta, inversor, travesaño).
      if (typologySet.size) {
        for (const id of verified?.typologies ?? []) {
          if (allowed.has(id) && requiredRolesFor({ kind, typologyIds: [id] }).every((role) => roles[role])) typologySet.add(id)
        }
      }
      const typologyIds = typologySet.size ? [...typologySet] : DEFAULT_TYPOLOGIES[kind]

      const productCount = plan.products.length
      const variantNote = plan.parent ? `; variante ${plan.variant?.label}` : ''
      const source =
        verified?.source ??
        (derived.fromData
          ? `Pauta de la distribuidora (${productCount} ${productCount === 1 ? 'producto' : 'productos'}${variantNote}) · ${dateNote}`
          : `${TYPICAL_PAUTA_PREFIX} de ${kind === 'sliding' ? 'corredera' : 'practicable'}: revisar con el fabricante · ${dateNote}`)
      const parentLine = plan.parent ? brandLines.find((line) => line.id === plan.parent!.draft.id) : undefined
      const depthMatch = verified?.depth ?? parentLine?.depth ?? (() => {
        const match = draftLine.key.match(/(?<!\d)([5-9]\d)(?:\s*MM)?(?!\d)/)
        return match ? Number(match[1]) : undefined
      })()
      const baseDescription = verified?.description ?? parentLine?.description ?? `${kind === 'sliding' ? 'Corredera' : 'Practicable'}${depthMatch ? ` ${depthMatch} mm` : ''}`

      const line: Line = {
        id: draftLine.id,
        brandId,
        name: draftLine.name,
        kind,
        material: /ALUM/.test(draftLine.key) ? 'aluminum' : 'pvc',
        description: plan.parent ? `${baseDescription} · ${plan.variant?.label}` : baseDescription,
        ...(depthMatch ? { depth: depthMatch } : {}),
        ...(verified?.chambers ? { chambers: verified.chambers } : parentLine?.chambers ? { chambers: parentLine.chambers } : {}),
        pauta,
        ...(doorPauta ? { doorPauta } : {}),
        ...(verified?.sashInPauta ? { sashInPauta: verified.sashInPauta } : {}),
        profiles: roles,
        ...(sashInProfileId ? { sashInProfileId } : {}),
        colorIds,
        typologyIds,
        hardwareRules: [] as HardwareRule[],
        accessoryRules: [] as AccessoryRule[],
        source,
        completeness: 'partial',
      }
      brandLines.push(line)
      const ownProfiles = brandProfiles.filter((profile) => profile.lineId === line.id)
      const lineReport: LineImportReport = {
        id: line.id,
        name: line.name,
        kind,
        completeness: 'partial',
        pauta: pautaSummary(pauta),
        products: productCount,
        typologies: typologyIds.length,
        profiles: ownProfiles.length,
        profilesPriced: ownProfiles.filter((profile) => Object.values(profile.priceByColor).some((price) => price > 0)).length,
        rules: { fromBrand: [], fromGeneric: [], fromOtherCatalog: [] },
        ...(plan.parent ? { variantOf: plan.parent.draft.id } : {}),
        readiness: { state: 'geometry', headline: '', details: [], missing: [], readyColors: [] },
      }
      if (approximate) lineReport.readiness.details.push(`${approximate} productos del fabricante no tienen una plantilla equivalente (más hojas o rieles): no se publican como tipología.`)
      brandReport.lines.push(lineReport)
      deferredRules.push({ line, brandItems: items, report: lineReport, related: (plan.parent?.draft.verified ?? draftLine.verified)?.relatedLines })
    }

    // ── Refuerzos: Proline verificado, «PARA PROxx» y números compartidos ──
    const reinforcements = brandProfiles.filter((profile) => profile.role === 'reinforcement')
    const byCode = new Map(brandProfiles.map((profile) => [modelGroupKey(profile.code), profile]))
    const numericCore = (code: string) => (code.match(/\d{3,}/g) ?? []).sort((a, b) => b.length - a.length)[0]
    for (const profile of brandProfiles) {
      if (profile.role === 'reinforcement') continue
      const verifiedRef = rule === 'proline' ? PROLINE_REINFORCEMENT[profile.code] : undefined
      let target = verifiedRef ? byCode.get(modelGroupKey(verifiedRef)) : undefined
      if (!target) {
        const texts = (r: Profile) => normalizeKey(models.get(modelGroupKey(r.code))?.names.map((entry) => entry.text).join(' ') ?? r.name)
        target = reinforcements.find((r) => {
          const text = texts(r)
          if (rule === 'proline') {
            const forMatch = text.match(/PARA (?:PERFIL |PREFIL )?PRO\s?-?(\d+[A-Z]?)/) ?? text.match(/REFUERZO PRO (\d+)/)
            return forMatch ? prolineToken(`PRO${forMatch[1]}`) === profile.code : false
          }
          // «Refuerzo para AN100»: el código completo del perfil en la descripción del refuerzo.
          const fullCode = normalizeKey(profile.code)
          if (fullCode.length >= 4 && /\d/.test(fullCode) && new RegExp(`(?<![A-Z0-9])${fullCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Z0-9])`).test(text)) return true
          const core = numericCore(profile.code)
          if (!core || core.length < 4) return false
          return (numericCore(r.code) === core || new RegExp(`(?<!\\d)${core}(?!\\d)`).test(text)) && r.lineId === profile.lineId
        })
      }
      if (target) profile.reinforcementId = target.id
    }
    for (const line of brandLines) {
      const frameId = line.profiles.frame ?? line.profiles.sliding_frame
      const frame = brandProfiles.find((profile) => profile.id === frameId)
      if (!line.profiles.reinforcement && frame?.reinforcementId) line.profiles.reinforcement = frame.reinforcementId
    }

    // ── Totales de la marca ──
    catalog.lines.push(...brandLines)
    catalog.profiles.push(...brandProfiles)
    catalog.items.push(...items)
    catalog.glass.push(...glass)
    const kindOfBrand: Brand['kind'] = brandLines.length ? (glass.length ? 'mixed' : 'profiles') : glass.length ? 'glass' : 'hardware'
    if (!brandLines.length && !items.length && !glass.length) continue
    const enabled = !deprecated && RECOMMENDED_BRANDS.includes(key)
    catalog.brands.push({ id: brandId, name, kind: kindOfBrand, monogram: monogram(name), accent: accentFor(key) })
    catalog.brandSettings.push(
      rule === 'proline'
        ? prolineSettings(brandId)
        : { brandId, enabled, trim: 0, kerf: 4, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
    )
    Object.assign(brandReport, {
      enabled: rule === 'proline' ? true : enabled,
      kind: kindOfBrand,
      profiles: brandProfiles.length,
      profilesPriced: brandProfiles.filter((profile) => Object.values(profile.priceByColor).some((price) => price > 0)).length,
      items: items.length,
      itemsPriced: items.filter((entry) => entry.price > 0).length,
      glass: glass.length,
      glassPriced: glass.filter((entry) => entry.pricePerM2 > 0).length,
      colors: [...new Set(brandLines.flatMap((line) => line.colorIds))],
    })
    report.brands.push(brandReport)
  }

  // ── Reglas de herrajes y accesorios (la marca primero, luego Herrajes genéricos) ──
  const profileCode = new Map(catalog.profiles.map((profile) => [profile.id, profile.code]))
  const structuralCodes = (line: Line) =>
    [line.profiles.frame, line.profiles.sliding_frame, line.profiles.sash, line.profiles.sliding_sash]
      .map((id) => (id ? profileCode.get(id) : undefined))
      .filter((code): code is string => Boolean(code))
  for (const { line, brandItems, report: lineReport, related } of deferredRules) {
    const usable = (list: Item[]) => list.filter((entry) => entry.kind !== 'other')
    const brandLines = catalog.lines.filter((other) => other.brandId === line.brandId && other.id !== line.id)
    const siblings = brandLines.filter((other) => !other.name.startsWith(`${line.name} · `) && !line.name.startsWith(`${other.name} · `)).map((other) => other.name)
    const resolved = buildLineRules(line.kind, [usable(brandItems), usable(genericHardware)], line.id, {
      lineName: line.name.replace(/ · .*$/, ''),
      otherLineNames: siblings,
      relatedLineNames: related,
      ownCodes: structuralCodes(line),
      otherCodes: [...new Set(brandLines.flatMap(structuralCodes))],
      colorIds: line.colorIds,
    })
    line.hardwareRules = resolved.hardwareRules
    line.accessoryRules = resolved.accessoryRules
    for (const id of resolved.genericItemIds) genericItemIds.add(id)
    lineReport.rules = { fromBrand: resolved.fromBrand, fromGeneric: resolved.fromGeneric, fromOtherCatalog: resolved.fromOtherCatalog }
  }
  if (genericItemIds.size) {
    catalog.brands.push(GENERIC_BRAND)
    catalog.brandSettings.push({
      brandId: GENERIC_BRAND.id,
      enabled: true,
      trim: 0,
      kerf: 4,
      discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
    })
    catalog.items.push(...GENERIC_ITEMS.filter((entry) => genericItemIds.has(entry.id)))
    report.warnings.push(
      `${genericItemIds.size} herrajes genéricos con precio de referencia completan reglas que las marcas no traen (marca «${GENERIC_BRAND.name}»).`,
    )
  }

  catalog.colors = [...colorsById.values()]

  // ── Completitud honesta: se calcula al final, con perfiles, refuerzos, reglas y precios ya armados ──
  const index = readinessIndex(catalog)
  const doubtfulById = new Map(report.brands.flatMap((brand) => brand.doubtfulUnits.map((entry) => [entry.id, entry] as const)))
  for (const { line, report: lineReport } of deferredRules) {
    const readiness = lineReadiness(catalog, line, index)
    // Herrajes de sus reglas con unidad o envase deducido: el precio por unidad puede estar mal.
    const doubtful = [...new Set([...line.hardwareRules, ...line.accessoryRules].map((rule) => rule.itemId))]
      .map((id) => doubtfulById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    for (const entry of doubtful.slice(0, 3)) lineReport.readiness.details.push(`${entry.name}: ${entry.note}. Confirma el envase con el proveedor.`)
    line.completeness = readiness.level
    lineReport.completeness = readiness.level
    lineReport.readiness = {
      state: readiness.state,
      headline: readiness.headline,
      details: [...readiness.details, ...lineReport.readiness.details],
      missing: readiness.missing,
      readyColors: readiness.readyColors,
    }
    report.readiness[readiness.state]++
  }
  for (const brandReport of report.brands) {
    const notReady = brandReport.lines.filter((line) => line.readiness.state !== 'ready').length
    if (notReady) brandReport.warnings.push(`${notReady} de ${brandReport.lines.length} líneas no alcanzan para una ventana completa con precio: se cotizan igual y avisan qué falta.`)
    if (brandReport.doubtfulUnits.length) brandReport.warnings.push(`${brandReport.doubtfulUnits.length} herrajes o insumos con unidad o envase por confirmar (deducido, la lista no lo dice).`)
    if (brandReport.duplicates.length) brandReport.warnings.push(`${brandReport.duplicates.length} artículos venían repetidos con el mismo código, nombre y precio: quedó uno de cada uno.`)
    if (brandReport.colorConflicts.length) brandReport.warnings.push(`${brandReport.colorConflicts.length} filas con un color en el código distinto al de la columna: se conserva la columna y queda anotado.`)
    if (brandReport.discardedPrices.length) brandReport.warnings.push(`${brandReport.discardedPrices.length} precios de perfil fuera de rango quedaron en $0 (están en el reporte, no son faltas del origen).`)
    const glassDoubts = brandReport.glassNotes.filter((note) => /confirmar|interpretar|cámara/.test(note.note)).length
    if (glassDoubts) brandReport.warnings.push(`${glassDoubts} vidrios con composición o espesor por confirmar.`)
  }
  report.totals = { ...catalogStats(catalog), genericItemsUsed: genericItemIds.size }
  if (!catalog.lines.length) report.warnings.push('No se importó ninguna línea: revisa la carpeta de origen.')
  return { catalog, report }
}

// ── Escritura y lectura del catálogo base ─────────────────────────────────────

/** Escribe el catálogo base como JSON (crea la carpeta si no existe). */
export function writeBaseCatalog(catalog: Catalog, outFile: string = DEFAULT_BASE_FILE): string {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(catalog))
  return outFile
}

/** Escribe el reporte de importación junto al catálogo base. */
export function writeImportReport(report: ImportReport, outFile: string = DEFAULT_REPORT_FILE): string {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(report, null, 2))
  return outFile
}

/** Lee el catálogo base generado; null si no existe o está dañado. */
export function readBaseCatalog(file: string = DEFAULT_BASE_FILE): Catalog | null {
  if (!existsSync(file)) return null
  const parsed = readJson<Catalog>(file)
  return parsed && Array.isArray(parsed.lines) && Array.isArray(parsed.profiles) ? parsed : null
}

/** Catálogo base si existe; si no, el catálogo de ejemplo del repositorio. */
export function loadBaseCatalog(file: string = DEFAULT_BASE_FILE): { catalog: Catalog; source: 'base' | 'sample' } {
  const base = readBaseCatalog(file)
  return base ? { catalog: base, source: 'base' } : { catalog: SAMPLE_CATALOG, source: 'sample' }
}

/** Texto del reporte para consola (español, cifras con separador de miles). */
export function formatImportReport(report: ImportReport): string {
  const n = (value: number) => value.toLocaleString('es-CL')
  const t = report.totals
  const lines: string[] = []
  lines.push(`Catálogo base desde ${report.sourceDir}`)
  if (report.priceListDate) lines.push(`Lista de precios del ${report.priceListDate}`)
  lines.push(
    `Archivos: ${n(report.files.read)} leídos, ${n(report.files.duplicates.length)} duplicados omitidos${
      report.files.duplicates.length ? ` (${report.files.duplicates.map((d) => `${d.file} = ${d.sameAs}`).join('; ')})` : ''
    }`,
  )
  const r = report.rows
  lines.push(
    `Filas: ${n(r.total)} en total, ${n(r.unique)} únicas · descartadas: ${n(r.deprecated)} «no usar», ${n(r.virtual)} comodines, ${n(r.junk)} basura · precios: ${n(r.zeroPrice)} en cero, ${n(r.placeholderPrice)} de relleno → 0, ${n(r.outlierPrice)} fuera de rango → 0`,
  )
  lines.push('')
  lines.push(`Marcas ${n(t.brands)} · líneas ${n(t.lines)} (${n(t.linesByKind.casement)} practicables, ${n(t.linesByKind.sliding)} correderas; ${n(t.linesByCompleteness.verified)} verificadas, ${n(t.linesByCompleteness.complete)} completas, ${n(t.linesByCompleteness.partial)} parciales)`)
  lines.push(`Para cotizar: ${n(report.readiness.ready)} listas, ${n(report.readiness.warnings)} cotizan con avisos, ${n(report.readiness.geometry)} solo medidas`)
  lines.push(`Perfiles ${n(t.profiles)}: ${n(t.profilesPriced)} con precio, ${n(t.profilesUnpriced)} sin precio`)
  lines.push(`Herrajes y accesorios ${n(t.items)}: ${n(t.itemsPriced)} con precio, ${n(t.itemsUnpriced)} sin precio (${n(t.genericItemsUsed)} genéricos de respaldo)`)
  lines.push(`Vidrios ${n(t.glass)}: ${n(t.glassPriced)} con precio m², ${n(t.glassUnpriced)} sin precio · colores ${n(t.colors)}`)
  lines.push('')
  for (const brand of report.brands) {
    lines.push(
      `${brand.enabled ? '●' : '○'} ${brand.name} — ${brand.lines.length} líneas · ${n(brand.profiles)} perfiles (${n(brand.profilesPriced)} con precio) · ${n(brand.items)} ítems (${n(brand.itemsPriced)} con precio)${brand.glass ? ` · ${n(brand.glass)} vidrios (${n(brand.glassPriced)} con precio)` : ''}`,
    )
    for (const line of brand.lines) {
      lines.push(`    ${line.name} · ${line.kind === 'sliding' ? 'corredera' : 'practicable'} · ${line.pauta} · ${line.typologies} tipologías · ${line.profiles} perfiles · ${line.completeness} — ${line.readiness.headline}`)
    }
    for (const warning of brand.warnings) lines.push(`    aviso: ${warning}`)
  }
  for (const warning of report.warnings) lines.push(`Aviso: ${warning}`)
  return lines.join('\n')
}
