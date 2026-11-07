/**
 * Texto enriquecido restringido (AST) para secciones de texto libre. Sólo párrafos, títulos (h2/h3),
 * listas simples (sin anidar), negrita/cursiva, saltos de línea y marcadores de la lista blanca. Sin
 * HTML, Markdown→HTML, enlaces, estilos ni expresiones. Profundidad fija: no hay recursión.
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L } from './limits'
import { docText } from './fields'
import { PLACEHOLDER_KEYS, isPlaceholderKey, splitPlaceholders, type PlaceholderKey } from './placeholders'
import { sanitizeDocText, truncateText } from './safety'
import type { DocZodParams } from './issues'

export const RichTextNodeTextSchema = z.strictObject({
  type: z.literal('text'),
  text: docText({ max: L.richTextRunMax, multiline: false, placeholders: false, required: true }),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
})

export const RichTextNodePlaceholderSchema = z.strictObject({
  type: z.literal('placeholder'),
  key: z.enum(PLACEHOLDER_KEYS),
})

export const RichTextNodeBreakSchema = z.strictObject({ type: z.literal('line_break') })

export const RichInlineSchema = z.discriminatedUnion('type', [RichTextNodeTextSchema, RichTextNodePlaceholderSchema, RichTextNodeBreakSchema])

const inlines = (max: number) => z.array(RichInlineSchema).min(1).max(max)

export const RichParagraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  align: z.enum(['start', 'center']).optional(),
  children: inlines(L.richTextInlineMax),
})

export const RichHeadingSchema = z.strictObject({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  children: inlines(40),
})

const listItem = z.strictObject({ children: inlines(L.richTextInlineMax) })

export const RichBulletListSchema = z.strictObject({
  type: z.literal('bullet_list'),
  items: z.array(listItem).min(1).max(L.richTextListItemsMax),
})

export const RichOrderedListSchema = z.strictObject({
  type: z.literal('ordered_list'),
  items: z.array(listItem).min(1).max(L.richTextListItemsMax),
})

export const RichBlockSchema = z.discriminatedUnion('type', [RichParagraphSchema, RichHeadingSchema, RichBulletListSchema, RichOrderedListSchema])

export const RichTextSchema = z
  .strictObject({ blocks: z.array(RichBlockSchema).max(L.richTextBlocksMax) })
  .superRefine((doc, ctx) => {
    const total = richTextCharCount(doc)
    if (total > L.richTextTotalCharsMax) {
      const params: DocZodParams = { docCode: 'too_long', docParams: { max: L.richTextTotalCharsMax } }
      ctx.addIssue({ code: 'custom', message: 'too_long', params })
    }
  })

export type RichInline = z.infer<typeof RichInlineSchema>
export type RichBlock = z.infer<typeof RichBlockSchema>
export type RichText = z.infer<typeof RichTextSchema>

export function emptyRichText(): RichText {
  return { blocks: [] }
}

function blockInlines(block: RichBlock): RichInline[][] {
  return block.type === 'paragraph' || block.type === 'heading' ? [block.children] : block.items.map((i) => i.children)
}

/** Caracteres de texto visibles (sin contar marcadores). */
export function richTextCharCount(doc: { blocks: readonly RichBlock[] }): number {
  let n = 0
  for (const b of doc.blocks) for (const line of blockInlines(b)) for (const node of line) if (node.type === 'text') n += node.text.length
  return n
}

/** Marcadores usados en el documento. */
export function richTextPlaceholders(doc: { blocks: readonly RichBlock[] }): PlaceholderKey[] {
  const out: PlaceholderKey[] = []
  for (const b of doc.blocks) for (const line of blockInlines(b)) for (const node of line) if (node.type === 'placeholder') out.push(node.key)
  return out
}

/** Texto plano (para resúmenes, vistas previas y búsqueda). Marcadores como `{key}` o su valor. */
export function richTextToPlain(doc: { blocks: readonly RichBlock[] }, values?: Partial<Record<PlaceholderKey, string>>): string {
  const line = (nodes: readonly RichInline[]) =>
    nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'line_break' ? '\n' : values ? (values[n.key] ?? '') : `{${n.key}}`)).join('')
  return doc.blocks
    .map((b) => {
      if (b.type === 'paragraph' || b.type === 'heading') return line(b.children)
      return b.items.map((item, i) => `${b.type === 'ordered_list' ? `${i + 1}.` : '-'} ${line(item.children)}`).join('\n')
    })
    .join('\n\n')
}

/**
 * Texto editable de un documento enriquecido: lo mismo que acepta `richTextFromPlain`, con negritas,
 * cursivas, títulos y listas. Al ida y vuelta no se pierde nada de lo que el taller puede escribir.
 */
export function richTextToSource(doc: { blocks: readonly RichBlock[] }): string {
  const line = (nodes: readonly RichInline[]) =>
    nodes
      .map((n) => {
        if (n.type === 'line_break') return '\n'
        if (n.type === 'placeholder') return `{${n.key}}`
        return n.bold ? `**${n.text}**` : n.italic ? `*${n.text}*` : n.text
      })
      .join('')
  return doc.blocks
    .map((b) => {
      if (b.type === 'heading') return `${'#'.repeat(b.level)} ${line(b.children)}`
      if (b.type === 'paragraph') return line(b.children)
      return b.items.map((item, i) => `${b.type === 'ordered_list' ? `${i + 1}.` : '-'} ${line(item.children)}`).join('\n')
    })
    .join('\n\n')
}

/** Marcas **negrita** y *cursiva* / _cursiva_ dentro de una línea → nodos. */
function parseMarks(text: string): RichInline[] {
  const out: RichInline[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g
  let last = 0
  const pushText = (t: string, marks: { bold?: boolean; italic?: boolean } = {}) => {
    for (const seg of splitPlaceholders(t)) {
      if (seg.type === 'placeholder') out.push({ type: 'placeholder', key: seg.key })
      else {
        const clean = seg.text.replace(/[{}]/g, '')
        if (clean.length === 0) continue
        out.push({ type: 'text', text: truncateText(clean, L.richTextRunMax), ...(marks.bold ? { bold: true } : {}), ...(marks.italic ? { italic: true } : {}) })
      }
    }
  }
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) pushText(text.slice(last, start))
    if (m[1] !== undefined) pushText(m[1], { bold: true })
    else pushText(m[2] ?? m[3] ?? '', { italic: true })
    last = start + m[0].length
  }
  if (last < text.length) pushText(text.slice(last))
  return out
}

function inlineLines(lines: string[]): RichInline[] {
  const out: RichInline[] = []
  lines.forEach((ln, i) => {
    if (i > 0) out.push({ type: 'line_break' })
    out.push(...parseMarks(ln))
  })
  // Sin saltos colgando al inicio/fin.
  while (out[0]?.type === 'line_break') out.shift()
  while (out[out.length - 1]?.type === 'line_break') out.pop()
  return out.slice(0, L.richTextInlineMax)
}

/**
 * Texto plano con Markdown mínimo (el de los textos v4: párrafos, `- ` listas, `1. ` listas, `#`
 * títulos, `**negrita**`, `*cursiva*`) → AST. Los `{marcadores}` conocidos pasan a nodos; las llaves
 * sueltas se quitan. Limpia caracteres invisibles. No interpreta HTML: si viene, queda como texto y
 * el esquema lo rechazará.
 */
export function richTextFromPlain(input: string): RichText {
  const text = sanitizeDocText(input, { multiline: true })
  const blocks: RichBlock[] = []
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    if (lines.length === 0) continue
    let i = 0
    while (i < lines.length && blocks.length < L.richTextBlocksMax) {
      const ln = lines[i]
      const heading = /^(#{1,3})\s+(.+)$/.exec(ln)
      if (heading) {
        const children = inlineLines([heading[2]]).filter((n) => n.type !== 'line_break').slice(0, 40)
        if (children.length) blocks.push({ type: 'heading', level: heading[1].length <= 2 ? 2 : 3, children })
        i++
        continue
      }
      const bullet = /^[-•*·]\s+(.+)$/
      const ordered = /^\d{1,3}[.)]\s+(.+)$/
      const kind = bullet.test(ln) ? 'bullet_list' : ordered.test(ln) ? 'ordered_list' : null
      if (kind) {
        const re = kind === 'bullet_list' ? bullet : ordered
        const items: { children: RichInline[] }[] = []
        while (i < lines.length && re.test(lines[i])) {
          const children = inlineLines([re.exec(lines[i])![1]])
          if (children.length && items.length < L.richTextListItemsMax) items.push({ children })
          i++
        }
        if (items.length) blocks.push({ type: kind, items })
        continue
      }
      const para: string[] = []
      while (i < lines.length && !/^(#{1,3})\s+/.test(lines[i]) && !bullet.test(lines[i]) && !ordered.test(lines[i])) {
        para.push(lines[i])
        i++
      }
      const children = inlineLines(para)
      if (children.length) blocks.push({ type: 'paragraph', children })
    }
  }
  return { blocks }
}

/**
 * Reparación tolerante de un AST que llega de fuera (IA/importación): descarta nodos desconocidos,
 * convierte strings sueltos en párrafos, pasa `{marcadores}` incrustados a nodos y recorta largos.
 * El resultado debe validarse igualmente con `RichTextSchema`.
 */
export function coerceRichText(input: unknown): RichText {
  if (typeof input === 'string') return richTextFromPlain(input)
  if (!input || typeof input !== 'object') return emptyRichText()
  const rawBlocks = Array.isArray(input) ? input : (input as { blocks?: unknown }).blocks
  if (!Array.isArray(rawBlocks)) return emptyRichText()
  const blocks: RichBlock[] = []
  let budget = L.richTextTotalCharsMax
  const coerceInlines = (raw: unknown, max: number): RichInline[] => {
    if (typeof raw === 'string') return parseMarks(sanitizeDocText(raw)).slice(0, max)
    if (!Array.isArray(raw)) return []
    const out: RichInline[] = []
    for (const node of raw) {
      if (out.length >= max || budget <= 0) break
      if (typeof node === 'string') {
        out.push(...parseMarks(sanitizeDocText(node)))
        continue
      }
      if (!node || typeof node !== 'object') continue
      const n = node as Record<string, unknown>
      if (n.type === 'line_break') out.push({ type: 'line_break' })
      else if (n.type === 'placeholder' && isPlaceholderKey(n.key)) out.push({ type: 'placeholder', key: n.key })
      else if (typeof n.text === 'string') {
        const marks = { bold: n.bold === true, italic: n.italic === true }
        for (const part of parseMarks(sanitizeDocText(n.text))) {
          if (part.type === 'text') {
            const text = truncateText(part.text, Math.max(0, Math.min(L.richTextRunMax, budget)))
            if (!text) continue
            budget -= text.length
            out.push({ type: 'text', text, ...(marks.bold || part.bold ? { bold: true } : {}), ...(marks.italic || part.italic ? { italic: true } : {}) })
          } else out.push(part)
        }
      }
    }
    while (out[0]?.type === 'line_break') out.shift()
    while (out[out.length - 1]?.type === 'line_break') out.pop()
    return out.slice(0, max)
  }
  for (const raw of rawBlocks) {
    if (blocks.length >= L.richTextBlocksMax || budget <= 0) break
    if (typeof raw === 'string') {
      blocks.push(...richTextFromPlain(raw).blocks.slice(0, L.richTextBlocksMax - blocks.length))
      continue
    }
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    if (b.type === 'bullet_list' || b.type === 'ordered_list') {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((it: unknown) => ({ children: coerceInlines(it && typeof it === 'object' && !Array.isArray(it) ? (it as { children?: unknown }).children : it, L.richTextInlineMax) }))
        .filter((it) => it.children.length > 0)
        .slice(0, L.richTextListItemsMax)
      if (items.length) blocks.push({ type: b.type, items })
    } else if (b.type === 'heading') {
      const children = coerceInlines(b.children ?? b.text, 40).filter((n) => n.type !== 'line_break')
      if (children.length) blocks.push({ type: 'heading', level: b.level === 3 ? 3 : 2, children })
    } else {
      const children = coerceInlines(b.children ?? b.text, L.richTextInlineMax)
      if (children.length) blocks.push({ type: 'paragraph', ...(b.align === 'center' ? { align: 'center' as const } : {}), children })
    }
  }
  return { blocks }
}
