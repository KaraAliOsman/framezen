/**
 * Fuentes de los documentos. El paquete no lee archivos: la web pasa URLs de
 * fontsource (import ... from '<archivo>?url') y el servidor pasa data URLs
 * leídas de node_modules con las rutas de DOCUMENT_FONT_FILES.
 */

export type DocFontFamily = 'instrument' | 'fraunces' | 'interTight' | 'mono' | 'monoMedium'

export interface DocFontSource {
  url: string
  /** Rango unicode opcional (si se pasan varios subconjuntos). */
  unicodeRange?: string
  style?: 'normal' | 'italic'
}

export type DocumentFontUrls = Partial<Record<DocFontFamily, string | DocFontSource | DocFontSource[]>>

/**
 * Archivos recomendados (subconjunto latino: cubre ñ, tildes, €, «», —). JetBrains Mono (códigos de
 * catálogo en los documentos de taller) usa los mismos pesos que la app web (400 y 500), para que
 * el PDF se vea igual que la pantalla. Instrument Sans no trae «²»: lo pone Inter Tight (ver
 * FONT_STACKS), así nunca depende de las fuentes del sistema del servidor.
 */
export const DOCUMENT_FONT_FILES: Record<DocFontFamily, string> = {
  instrument: '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2',
  fraunces: '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2',
  interTight: '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2',
  mono: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  monoMedium: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2',
}

const FAMILY: Record<DocFontFamily, { name: string; weight: string; stretch?: string; variable?: boolean }> = {
  instrument: { name: 'Instrument Sans Variable', weight: '400 700', stretch: '75% 100%', variable: true },
  fraunces: { name: 'Fraunces Variable', weight: '100 900', variable: true },
  interTight: { name: 'Inter Tight Variable', weight: '100 900', variable: true },
  mono: { name: 'JetBrains Mono', weight: '400' },
  monoMedium: { name: 'JetBrains Mono', weight: '500' },
}

function toSources(value: string | DocFontSource | DocFontSource[]): DocFontSource[] {
  if (typeof value === 'string') return [{ url: value }]
  return Array.isArray(value) ? value : [value]
}

function cssUrl(url: string): string {
  return `url("${url.replace(/"/g, '%22')}")`
}

/** Declaraciones @font-face para Instrument Sans, Fraunces, Inter Tight y JetBrains Mono. */
export function documentFontFaces(urls: DocumentFontUrls): string {
  const blocks: string[] = []
  for (const family of Object.keys(FAMILY) as DocFontFamily[]) {
    const value = urls[family]
    if (!value) continue
    const meta = FAMILY[family]
    for (const source of toSources(value)) {
      const lines = [
        `font-family: '${meta.name}'`,
        `font-style: ${source.style ?? 'normal'}`,
        `font-display: swap`,
        `font-weight: ${meta.weight}`,
        meta.stretch ? `font-stretch: ${meta.stretch}` : '',
        meta.variable ? `src: ${cssUrl(source.url)} format('woff2-variations'), ${cssUrl(source.url)} format('woff2')` : `src: ${cssUrl(source.url)} format('woff2')`,
        source.unicodeRange ? `unicode-range: ${source.unicodeRange}` : '',
      ].filter(Boolean)
      blocks.push(`@font-face { ${lines.join('; ')}; }`)
    }
  }
  return blocks.join('\n')
}
