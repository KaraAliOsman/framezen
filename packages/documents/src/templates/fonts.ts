/**
 * Archivos de fuente de la lista cerrada (`DOC_FONTS`) para incrustar en el PDF o cargar en la vista
 * previa: subconjuntos `latin` y `latin-ext` (ñ, ç, ß, İ ı Ş ş Ğ ğ…), eje de peso en las variables y
 * solo los pesos que usa el tema en las estáticas. El paquete no lee archivos: devuelve rutas de
 * paquete que el servidor resuelve en `node_modules` (y convierte a data URL) o que la web importa.
 */
import { DOC_FONTS, nearestFontWeight, type DocFontId, type DocTheme } from '@dekopen/shared'

export interface DocFontFile {
  id: DocFontId
  /** Familia CSS (la de `fontStack`). */
  family: string
  /** Ruta de paquete (`@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2`). */
  file: string
  /** `100 900` en variables; un peso en estáticas. */
  weight: string
  /** Rango de ancho en familias con eje `wdth` (`62% 125%`). */
  stretch?: string
  style: 'normal' | 'italic'
  subset: 'latin' | 'latin-ext'
  unicodeRange: string
  variable: boolean
}

const RANGES: Record<DocFontFile['subset'], string> = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
}

const SUBSETS: DocFontFile['subset'][] = ['latin', 'latin-ext']

function variableFiles(id: DocFontId, style: 'normal' | 'italic'): DocFontFile[] {
  const info = DOC_FONTS[id]
  return SUBSETS.map((subset) => ({
    id,
    family: info.family,
    file: `${info.package}/files/${id}-${subset}-${info.axis === 'standard' ? 'standard' : 'wght'}-${style}.woff2`,
    weight: `${info.weightRange[0]} ${info.weightRange[1]}`,
    ...(info.stretch ? { stretch: `${info.stretch[0]}% ${info.stretch[1]}%` } : {}),
    style,
    subset,
    unicodeRange: RANGES[subset],
    variable: true,
  }))
}

/**
 * Caracteres que una familia resuelve mal y se toman de Public Sans (cara declarada después, por eso
 * gana para ese carácter). Overpass marca el punto medio como carácter sin avance y se pega a la
 * palabra siguiente; Hanken Grotesk no trae el signo de la lira turca.
 */
const GLYPH_PATCHES: Partial<Record<DocFontId, { subset: DocFontFile['subset']; range: string }>> = {
  overpass: { subset: 'latin', range: 'U+00B7' },
  'hanken-grotesk': { subset: 'latin-ext', range: 'U+20BA' },
}

function glyphPatch(id: DocFontId): DocFontFile[] {
  const patch = GLYPH_PATCHES[id]
  if (!patch) return []
  const donor = DOC_FONTS['public-sans']
  return [{ id, family: DOC_FONTS[id].family, file: `${donor.package}/files/public-sans-${patch.subset}-wght-normal.woff2`, weight: '100 900', style: 'normal', subset: patch.subset, unicodeRange: patch.range, variable: true }]
}

function staticFiles(id: DocFontId, weight: number, style: 'normal' | 'italic'): DocFontFile[] {
  const info = DOC_FONTS[id]
  return SUBSETS.map((subset) => ({
    id,
    family: info.family,
    file: `${info.package}/files/${id}-${subset}-${weight}-${style}.woff2`,
    weight: String(weight),
    style,
    subset,
    unicodeRange: RANGES[subset],
    variable: false,
  }))
}

/** Archivos de cada familia en su peso regular (catálogo de referencia para la web). */
export const DOC_FONT_FILES: Readonly<Record<DocFontId, DocFontFile[]>> = Object.fromEntries(
  (Object.keys(DOC_FONTS) as DocFontId[]).map((id) => [id, DOC_FONTS[id].variable ? variableFiles(id, 'normal') : staticFiles(id, nearestFontWeight(id, 400), 'normal')]),
) as Record<DocFontId, DocFontFile[]>

/**
 * Archivos que necesita un tema: titulares en su peso y texto en 400 y 600 (las cifras van en la misma
 * familia del texto, con numerales tabulares). Las variables cubren todos los pesos con un archivo por subconjunto. Con `italic`, la cursiva del
 * texto (si la familia la trae).
 */
export function docFontFiles(theme: Pick<DocTheme, 'fonts' | 'headingWeight'>, options: { italic?: boolean } = {}): DocFontFile[] {
  const wanted = new Map<DocFontId, { weights: Set<number>; italic: boolean }>()
  const add = (id: DocFontId, weights: number[], italic = false) => {
    const entry = wanted.get(id) ?? { weights: new Set<number>(), italic: false }
    for (const w of weights) entry.weights.add(nearestFontWeight(id, w))
    entry.italic ||= italic
    wanted.set(id, entry)
  }
  add(theme.fonts.heading as DocFontId, [theme.headingWeight])
  add(theme.fonts.body as DocFontId, [400, 600], !!options.italic)
  const out: DocFontFile[] = []
  for (const [id, entry] of wanted) {
    const info = DOC_FONTS[id]
    if (!info) continue
    if (info.variable) {
      out.push(...variableFiles(id, 'normal'), ...glyphPatch(id))
      if (entry.italic && info.italic) out.push(...variableFiles(id, 'italic'))
    } else {
      for (const w of [...entry.weights].sort()) out.push(...staticFiles(id, w, 'normal'))
      if (entry.italic && info.italic) out.push(...staticFiles(id, nearestFontWeight(id, 400), 'italic'))
    }
  }
  return out
}

function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, '')}")`
}

/**
 * Reglas `@font-face` para los archivos (las URL las resuelve quien llama: data URL en el servidor,
 * URL de Vite en la web). Archivos sin URL se omiten (queda la familia de respaldo).
 */
export function docFontFaceRules(files: readonly DocFontFile[], urlOf: (file: DocFontFile) => string | undefined): string {
  const rules: string[] = []
  for (const f of files) {
    const url = urlOf(f)
    if (!url) continue
    const src = f.variable ? `${cssUrl(url)} format('woff2-variations'), ${cssUrl(url)} format('woff2')` : `${cssUrl(url)} format('woff2')`
    rules.push(`@font-face { font-family: '${f.family}'; font-style: ${f.style}; font-display: block; font-weight: ${f.weight};${f.stretch ? ` font-stretch: ${f.stretch};` : ''} src: ${src}; unicode-range: ${f.unicodeRange}; }`)
  }
  return rules.join('\n')
}
