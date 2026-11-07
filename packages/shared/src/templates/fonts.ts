/**
 * Tipografías de documento: lista CERRADA de familias instaladas en `node_modules` (paquetes
 * @fontsource-variable 5.3.x con subconjuntos `latin` y `latin-ext`: ñ, ç, ß y el turco ğ ş İ ı). El
 * renderizador las incrusta como data URLs (Chromium sin red); una plantilla sólo puede nombrar estos
 * ids, nunca una URL ni un `font-family` arbitrario.
 *
 * Criterio de la lista: grotescas y romanas de texto de uso corporativo, con pesos reales y cifras
 * tabulares verificadas en el archivo (`tnum` o dígitos de ancho fijo: la cifra de una planilla se
 * alinea). Las familias retiradas en v6 siguen en `RETIRED_DOC_FONTS` para leer datos guardados.
 *
 * `instrument-sans` y `jetbrains-mono` se resuelven desde el `node_modules` raíz (los declara
 * apps/web); el resto los declara `packages/documents/package.json`.
 */

export const DOC_FONT_IDS = [
  'hanken-grotesk',
  'public-sans',
  'archivo',
  'source-sans-3',
  'overpass',
  'schibsted-grotesk',
  'inter-tight',
  'instrument-sans',
  'source-serif-4',
  'literata',
  'jetbrains-mono',
] as const

export type DocFontId = (typeof DOC_FONT_IDS)[number]
export type DocFontRole = 'heading' | 'body' | 'mono'
export type DocFontCategory = 'sans' | 'serif' | 'mono'

export interface DocFontInfo {
  id: DocFontId
  /** Nombre CSS de la familia tal como lo declara fontsource. */
  family: string
  /** Paquete npm instalado. */
  package: string
  category: DocFontCategory
  variable: boolean
  /** Rango de pesos disponible (variable: eje `wght`; estática: pesos con archivo). */
  weightRange: readonly [number, number]
  /** Pesos estáticos disponibles (sólo fuentes no variables). */
  staticWeights?: readonly number[]
  italic: boolean
  /** Roles permitidos en un tema. */
  roles: readonly DocFontRole[]
  /** Familia genérica de respaldo. */
  generic: 'sans-serif' | 'serif' | 'monospace'
  /** Ejes del archivo variable: `standard` trae peso y ancho (por defecto, sólo peso). */
  axis?: 'wght' | 'standard'
  /** Rango de ancho (%), en las familias con eje `wdth`. */
  stretch?: readonly [number, number]
}

const sans = { category: 'sans', generic: 'sans-serif' } as const
const serif = { category: 'serif', generic: 'serif' } as const
const mono = { category: 'mono', generic: 'monospace', roles: ['mono'] } as const
const text = ['heading', 'body'] as const

export const DOC_FONTS: Readonly<Record<DocFontId, DocFontInfo>> = {
  'hanken-grotesk': { id: 'hanken-grotesk', family: 'Hanken Grotesk Variable', package: '@fontsource-variable/hanken-grotesk', ...sans, variable: true, weightRange: [100, 900], italic: true, roles: text },
  'public-sans': { id: 'public-sans', family: 'Public Sans Variable', package: '@fontsource-variable/public-sans', ...sans, variable: true, weightRange: [100, 900], italic: true, roles: text },
  archivo: { id: 'archivo', family: 'Archivo Variable', package: '@fontsource-variable/archivo', ...sans, variable: true, weightRange: [100, 900], italic: true, roles: text, axis: 'standard', stretch: [62, 125] },
  'source-sans-3': { id: 'source-sans-3', family: 'Source Sans 3 Variable', package: '@fontsource-variable/source-sans-3', ...sans, variable: true, weightRange: [200, 900], italic: true, roles: text },
  overpass: { id: 'overpass', family: 'Overpass Variable', package: '@fontsource-variable/overpass', ...sans, variable: true, weightRange: [100, 900], italic: true, roles: text },
  'schibsted-grotesk': { id: 'schibsted-grotesk', family: 'Schibsted Grotesk Variable', package: '@fontsource-variable/schibsted-grotesk', ...sans, variable: true, weightRange: [400, 900], italic: true, roles: text },
  'inter-tight': { id: 'inter-tight', family: 'Inter Tight Variable', package: '@fontsource-variable/inter-tight', ...sans, variable: true, weightRange: [100, 900], italic: true, roles: text },
  'instrument-sans': { id: 'instrument-sans', family: 'Instrument Sans Variable', package: '@fontsource-variable/instrument-sans', ...sans, variable: true, weightRange: [400, 700], italic: true, roles: text },
  'source-serif-4': { id: 'source-serif-4', family: 'Source Serif 4 Variable', package: '@fontsource-variable/source-serif-4', ...serif, variable: true, weightRange: [200, 900], italic: true, roles: text },
  literata: { id: 'literata', family: 'Literata Variable', package: '@fontsource-variable/literata', ...serif, variable: true, weightRange: [200, 900], italic: true, roles: text },
  'jetbrains-mono': { id: 'jetbrains-mono', family: 'JetBrains Mono', package: '@fontsource/jetbrains-mono', ...mono, variable: false, weightRange: [100, 800], staticWeights: [100, 200, 300, 400, 500, 600, 700, 800], italic: true },
}

/**
 * Familias retiradas de la lista → la vigente más cercana. Sólo para leer temas ya guardados: ninguna
 * operación, plantilla nueva ni respuesta de la IA puede volver a elegirlas.
 */
export const RETIRED_DOC_FONTS: Readonly<Record<string, DocFontId>> = {
  fraunces: 'literata',
  'cormorant-garamond': 'literata',
  'dm-serif-display': 'literata',
  'ibm-plex-serif': 'source-serif-4',
  'ibm-plex-sans': 'public-sans',
  'ibm-plex-mono': 'jetbrains-mono',
  manrope: 'hanken-grotesk',
  'bricolage-grotesque': 'archivo',
  'libre-franklin': 'public-sans',
}

/** Id vigente para un id guardado (el mismo si no está retirado). */
export function currentDocFontId(id: unknown): unknown {
  return typeof id === 'string' && Object.hasOwn(RETIRED_DOC_FONTS, id) ? RETIRED_DOC_FONTS[id] : id
}

export const DOC_HEADING_FONT_IDS = DOC_FONT_IDS.filter((id) => DOC_FONTS[id].roles.includes('heading'))
export const DOC_BODY_FONT_IDS = DOC_FONT_IDS.filter((id) => DOC_FONTS[id].roles.includes('body'))
export const DOC_MONO_FONT_IDS = DOC_FONT_IDS.filter((id) => DOC_FONTS[id].roles.includes('mono'))

export function isDocFontId(value: unknown): value is DocFontId {
  return typeof value === 'string' && Object.hasOwn(DOC_FONTS, value)
}

export function fontAllows(id: DocFontId, role: DocFontRole): boolean {
  return DOC_FONTS[id].roles.includes(role)
}

/** Pesos de titular que el tema puede pedir. */
export const DOC_HEADING_WEIGHTS = [300, 400, 500, 600, 700, 800] as const
export type DocHeadingWeight = (typeof DOC_HEADING_WEIGHTS)[number]

/** Peso disponible más cercano para una familia (los estáticos sólo tienen ciertos pesos). */
export function nearestFontWeight(id: DocFontId, weight: number): DocHeadingWeight {
  const info = DOC_FONTS[id]
  const available = DOC_HEADING_WEIGHTS.filter((w) =>
    info.staticWeights ? info.staticWeights.includes(w) : w >= info.weightRange[0] && w <= info.weightRange[1],
  )
  const pool = available.length ? available : [400 as const]
  return pool.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), pool[0])
}

export function fontSupportsWeight(id: DocFontId, weight: number): boolean {
  return nearestFontWeight(id, weight) === weight
}

/** Pila CSS segura (sólo nombres de esta lista + genérico); la compila el renderizador. */
export function fontStack(id: DocFontId): string {
  const info = DOC_FONTS[id]
  return `'${info.family}', ${info.generic}`
}

export interface DocFontPair {
  id: string
  heading: DocFontId
  body: DocFontId
  mono: DocFontId
}

/**
 * Pares curados (la UI los ofrece como atajos; `setFontPair` acepta un `pairId` o familias sueltas).
 * Los nombres de fuentes son nombres propios: no se traducen.
 */
export const DOC_FONT_PAIRS = [
  { id: 'hanken', heading: 'hanken-grotesk', body: 'hanken-grotesk', mono: 'jetbrains-mono' },
  { id: 'public-source-serif', heading: 'public-sans', body: 'source-serif-4', mono: 'jetbrains-mono' },
  { id: 'public', heading: 'public-sans', body: 'public-sans', mono: 'jetbrains-mono' },
  { id: 'archivo', heading: 'archivo', body: 'archivo', mono: 'jetbrains-mono' },
  { id: 'literata-source-sans', heading: 'literata', body: 'source-sans-3', mono: 'jetbrains-mono' },
  { id: 'overpass', heading: 'overpass', body: 'overpass', mono: 'jetbrains-mono' },
  { id: 'schibsted', heading: 'schibsted-grotesk', body: 'schibsted-grotesk', mono: 'jetbrains-mono' },
  { id: 'source-serif-hanken', heading: 'source-serif-4', body: 'hanken-grotesk', mono: 'jetbrains-mono' },
  { id: 'inter-tight', heading: 'inter-tight', body: 'inter-tight', mono: 'jetbrains-mono' },
  { id: 'instrument', heading: 'instrument-sans', body: 'instrument-sans', mono: 'jetbrains-mono' },
] as const satisfies readonly DocFontPair[]

export type DocFontPairId = (typeof DOC_FONT_PAIRS)[number]['id']
export const DOC_FONT_PAIR_IDS = DOC_FONT_PAIRS.map((p) => p.id) as unknown as readonly [DocFontPairId, ...DocFontPairId[]]

export function fontPairById(id: string): DocFontPair | undefined {
  return DOC_FONT_PAIRS.find((p) => p.id === id)
}

/** Nombre legible de un par ("Fraunces + Libre Franklin"). */
export function fontPairLabel(pair: Pick<DocFontPair, 'heading' | 'body'>): string {
  const name = (id: DocFontId) => DOC_FONTS[id].family.replace(/ Variable$/, '')
  return pair.heading === pair.body ? name(pair.heading) : `${name(pair.heading)} + ${name(pair.body)}`
}

/** Tipografías v4 (`DocumentPrefs.font`) → par equivalente. */
export const LEGACY_DOC_FONT_PAIRS: Readonly<Record<'instrument' | 'serif' | 'grotesk', DocFontPairId>> = {
  instrument: 'instrument',
  serif: 'literata-source-sans',
  grotesk: 'inter-tight',
}
