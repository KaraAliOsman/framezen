/**
 * Texto libre de las plantillas (AST acotado de @dekopen/shared) ↔ texto con marcas simples para el
 * editor: `## Título`, `- viñeta`, `1. numerada`, `**negrita**`, `*cursiva*` y `{client.name}`.
 * El AST siempre sale de `richTextFromPlain` (nunca HTML): lo que no calza queda como texto.
 */
import { richTextFromPlain, type RichBlock, type RichInline, type RichText } from '@dekopen/shared'

function inline(nodes: readonly RichInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'line_break') return '\n'
      if (n.type === 'placeholder') return `{${n.key}}`
      let text = n.text
      if (n.italic) text = `*${text}*`
      if (n.bold) text = `**${text}**`
      return text
    })
    .join('')
}

function block(b: RichBlock): string {
  switch (b.type) {
    case 'paragraph':
      return inline(b.children)
    case 'heading':
      return `${b.level === 2 ? '##' : '###'} ${inline(b.children)}`
    case 'bullet_list':
      return b.items.map((item) => `- ${inline(item.children)}`).join('\n')
    case 'ordered_list':
      return b.items.map((item, i) => `${i + 1}. ${inline(item.children)}`).join('\n')
  }
}

export function richTextToMarkup(doc: RichText | undefined | null): string {
  if (!doc) return ''
  return doc.blocks.map(block).join('\n\n')
}

export function markupToRichText(text: string): RichText {
  return richTextFromPlain(text)
}

/** Envuelve la selección de un textarea con una marca (`**`, `*`) o antepone un prefijo de línea. */
export function applyMark(value: string, start: number, end: number, mark: 'bold' | 'italic' | 'bullet' | 'ordered' | 'heading'): { value: string; start: number; end: number } {
  if (mark === 'bold' || mark === 'italic') {
    const token = mark === 'bold' ? '**' : '*'
    const selected = value.slice(start, end)
    const next = `${value.slice(0, start)}${token}${selected}${token}${value.slice(end)}`
    return { value: next, start: start + token.length, end: end + token.length }
  }
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndRaw = value.indexOf('\n', end)
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const prefixed = lines.map((ln, i) => {
    const bare = ln.replace(/^(#{1,3}\s+|[-•*·]\s+|\d{1,3}[.)]\s+)/, '')
    if (mark === 'heading') return `## ${bare}`
    if (mark === 'bullet') return `- ${bare}`
    return `${i + 1}. ${bare}`
  })
  const replaced = prefixed.join('\n')
  const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd)
  return { value: next, start: lineStart, end: lineStart + replaced.length }
}

/** Inserta un marcador en la posición del cursor. */
export function insertAt(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}
