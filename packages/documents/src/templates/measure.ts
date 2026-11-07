/**
 * Estimación determinista de altos (px) para la paginación de respaldo. No reemplaza la medición:
 * en el navegador y en Chromium se mide el DOM real. Las constantes salen de medir las plantillas en
 * Chromium con las fuentes incrustadas y quedan un poco por encima (mejor una hoja holgada que un
 * bloque desbordado).
 */
import type { RichBlock, RichInline, RichText } from '@dekopen/shared'
import type { DocFontId } from '@dekopen/shared'
import { FONT_WIDTH } from './theme'

export interface TextMetrics {
  /** Tamaño de letra (px). */
  size: number
  /** Interlineado (múltiplo). */
  lineHeight: number
  /** Ancho medio del carácter en em. */
  charWidth: number
}

export function metricsFor(font: DocFontId, size: number, lineHeight: number): TextMetrics {
  return { size, lineHeight, charWidth: FONT_WIDTH[font] ?? 0.52 }
}

/** Caracteres que caben en una línea de `width` px. */
export function charsPerLine(width: number, m: TextMetrics): number {
  return Math.max(8, Math.floor(width / (m.size * m.charWidth)))
}

/** Líneas que ocupa un texto plano (respeta saltos de línea). */
export function lineCount(text: string | undefined, width: number, m: TextMetrics): number {
  if (!text) return 0
  const cpl = charsPerLine(width, m)
  let lines = 0
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      lines += 0.5
      continue
    }
    // Corte por palabras: una línea llena pierde en promedio media palabra.
    lines += Math.max(1, Math.ceil((line.length * 1.04) / cpl))
  }
  return lines
}

/** Alto (px) de un texto plano. */
export function textHeight(text: string | undefined, width: number, m: TextMetrics): number {
  return Math.ceil(lineCount(text, width, m) * m.size * m.lineHeight)
}

function inlineChars(nodes: readonly RichInline[], values?: Partial<Record<string, string>>): { chars: number; breaks: number } {
  let chars = 0
  let breaks = 0
  for (const n of nodes) {
    if (n.type === 'text') chars += n.text.length
    else if (n.type === 'line_break') breaks++
    else chars += (values?.[n.key] ?? '').length || 8
  }
  return { chars, breaks }
}

/** Alto (px) de un bloque de texto enriquecido. */
export function richBlockHeight(block: RichBlock, width: number, m: TextMetrics, values?: Partial<Record<string, string>>): number {
  const cpl = charsPerLine(width, m)
  const lh = m.size * m.lineHeight
  const linesOf = (nodes: readonly RichInline[], indent = 0) => {
    const { chars, breaks } = inlineChars(nodes, values)
    const per = Math.max(8, cpl - indent)
    return Math.max(1, Math.ceil((chars * 1.04) / per)) + breaks
  }
  if (block.type === 'paragraph') return Math.ceil(linesOf(block.children) * lh)
  if (block.type === 'heading') return Math.ceil(linesOf(block.children) * lh * 1.15 + 4)
  return Math.ceil(block.items.reduce((acc, item) => acc + linesOf(item.children, 3) * lh + 2, 0))
}

/** Separación entre bloques de texto enriquecido (px). */
export const RICH_GAP = 6

export function richTextHeight(doc: RichText | undefined, width: number, m: TextMetrics, values?: Partial<Record<string, string>>): number {
  if (!doc || doc.blocks.length === 0) return 0
  return doc.blocks.reduce((acc, b, i) => acc + richBlockHeight(b, width, m, values) + (i ? RICH_GAP : 0), 0)
}

/** Divide bloques de texto enriquecido en tramos que no pasen de `maxHeight` (para fluir entre hojas). */
export function chunkRichBlocks(blocks: readonly RichBlock[], width: number, m: TextMetrics, maxHeight: number, values?: Partial<Record<string, string>>): RichBlock[][] {
  const out: RichBlock[][] = []
  let current: RichBlock[] = []
  let used = 0
  for (const block of blocks) {
    const h = richBlockHeight(block, width, m, values) + (current.length ? RICH_GAP : 0)
    if (current.length && used + h > maxHeight) {
      out.push(current)
      current = []
      used = 0
    }
    current.push(block)
    used += h
  }
  if (current.length) out.push(current)
  return out
}
