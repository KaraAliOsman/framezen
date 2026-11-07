/**
 * Fuentes de los documentos en el navegador: las familias de la lista cerrada de plantillas
 * (`DOC_FONTS` de @dekopen/shared), con subconjuntos latin y latin-ext (ğ ş İ ı del turco, ß, ç…).
 * Vite sólo emite los archivos como URLs: el navegador descarga una familia cuando un documento la
 * usa (unicode-range + font-display swap). El PDF del servidor incrusta las mismas familias.
 *
 * Contrato para otros equipos (vista previa de cotizaciones, portal): `documentTemplateFontCss()`.
 */
import { DOC_FONTS, type DocFontId } from '@dekopen/shared'
import hankenLatin from '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url'
import hankenExt from '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-ext-wght-normal.woff2?url'
import publicSansLatin from '@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2?url'
import publicSansExt from '@fontsource-variable/public-sans/files/public-sans-latin-ext-wght-normal.woff2?url'
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2?url'
import archivoExt from '@fontsource-variable/archivo/files/archivo-latin-ext-standard-normal.woff2?url'
import sourceSansLatin from '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url'
import sourceSansExt from '@fontsource-variable/source-sans-3/files/source-sans-3-latin-ext-wght-normal.woff2?url'
import overpassLatin from '@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2?url'
import overpassExt from '@fontsource-variable/overpass/files/overpass-latin-ext-wght-normal.woff2?url'
import schibstedLatin from '@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?url'
import schibstedExt from '@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-ext-wght-normal.woff2?url'
import interTightLatin from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url'
import interTightExt from '@fontsource-variable/inter-tight/files/inter-tight-latin-ext-wght-normal.woff2?url'
import instrumentLatin from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'
import instrumentExt from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-ext-wght-normal.woff2?url'
import sourceSerifLatin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url'
import sourceSerifExt from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-normal.woff2?url'
import literataLatin from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataExt from '@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2?url'
import jetbrains400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url'
import jetbrains400Ext from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff2?url'
import jetbrains500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url'
import jetbrains500Ext from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2?url'

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

interface Face {
  /** Peso fijo (estáticas) o rango (variables). */
  weight: string
  /** Rango de ancho en familias con eje `wdth`. */
  stretch?: string
  latin: string
  ext: string
  variable?: boolean
}

const v = (latin: string, ext: string, weight: string): Face[] => [{ weight, latin, ext, variable: true }]

const FACES: Record<DocFontId, Face[]> = {
  'hanken-grotesk': v(hankenLatin, hankenExt, '100 900'),
  'public-sans': v(publicSansLatin, publicSansExt, '100 900'),
  archivo: [{ weight: '100 900', stretch: '62% 125%', latin: archivoLatin, ext: archivoExt, variable: true }],
  'source-sans-3': v(sourceSansLatin, sourceSansExt, '200 900'),
  overpass: v(overpassLatin, overpassExt, '100 900'),
  'schibsted-grotesk': v(schibstedLatin, schibstedExt, '400 900'),
  'inter-tight': v(interTightLatin, interTightExt, '100 900'),
  'instrument-sans': v(instrumentLatin, instrumentExt, '400 700'),
  'source-serif-4': v(sourceSerifLatin, sourceSerifExt, '200 900'),
  literata: v(literataLatin, literataExt, '200 900'),
  'jetbrains-mono': [
    { weight: '400', latin: jetbrains400, ext: jetbrains400Ext },
    { weight: '500', latin: jetbrains500, ext: jetbrains500Ext },
  ],
}

function absolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

function faceCss(family: string, face: Face, url: string, range: string): string {
  const src = face.variable ? `url("${url}") format('woff2-variations'), url("${url}") format('woff2')` : `url("${url}") format('woff2')`
  return `@font-face { font-family: '${family}'; font-style: normal; font-display: swap; font-weight: ${face.weight};${face.stretch ? ` font-stretch: ${face.stretch};` : ''} src: ${src}; unicode-range: ${range}; }`
}

let cached: string | null = null

/** @font-face de todas las fuentes de documentos (URLs absolutas: sirven también en un iframe). */
export function documentTemplateFontCss(): string {
  if (cached) return cached
  const blocks: string[] = []
  for (const id of Object.keys(FACES) as DocFontId[]) {
    const family = DOC_FONTS[id].family
    for (const face of FACES[id]) {
      blocks.push(faceCss(family, face, absolute(face.latin), LATIN))
      blocks.push(faceCss(family, face, absolute(face.ext), LATIN_EXT))
    }
  }
  // El punto medio de Overpass no tiene avance: ese carácter sale de Public Sans (como en el PDF).
  blocks.push(faceCss(DOC_FONTS.overpass.family, { weight: '100 900', latin: publicSansLatin, ext: publicSansExt, variable: true }, absolute(publicSansLatin), 'U+00B7'))
  cached = blocks.join('\n')
  return cached
}

/** Familias CSS de un par de fuentes (para muestras «Aa» en el editor). */
export function fontFamilyCss(id: DocFontId): string {
  const info = DOC_FONTS[id]
  return `'${info.family}', ${info.generic}`
}
