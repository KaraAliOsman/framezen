/**
 * Archivos de oficina (Word, Excel, PowerPoint y sus equivalentes abiertos). Todos son un zip con
 * XML adentro: se saca el texto y las imágenes que traen pegadas, que en una cotización suelen ser
 * el plano. Las celdas salen separadas por tabulador, así el modelo las lee como tabla.
 */
import { unzipSync } from 'fflate'
import { ATTACHMENT_LIMITS, type AttachmentKind, type TurnAttachment } from '@dekopen/shared'
import { blobToDataUrl } from './image'
import { ReadProblem, type ReadResult } from './types'

type Zip = Record<string, Uint8Array>

const MAX_EMBEDDED_IMAGES = 4
/** Más chico que esto es un logo o un ícono, no un plano. */
const MIN_EMBEDDED_BYTES = 20_000
const decoder = new TextDecoder()

function xml(zip: Zip, path: string): Document | null {
  const bytes = zip[path]
  if (!bytes) return null
  const doc = new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml')
  return doc.getElementsByTagName('parsererror').length ? null : doc
}

const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name)
const attr = (el: Element, name: string) => el.getAttribute(name) ?? Array.from(el.attributes).find((a) => a.localName === name)?.value ?? null

// ── Word ─────────────────────────────────────────────────────────────────────

function wordText(node: Element): string {
  let out = ''
  for (const child of Array.from(node.children)) {
    const name = child.localName
    if (name === 't') out += child.textContent ?? ''
    else if (name === 'tab') out += '\t'
    else if (name === 'br') out += '\n'
    else {
      out += wordText(child)
      if (name === 'p') out += '\n'
      else if (name === 'tc') out = `${out.replace(/\n$/, '')}\t`
      else if (name === 'tr') out = `${out.replace(/\t$/, '')}\n`
    }
  }
  return out
}

function readDocx(zip: Zip): string {
  const body = xml(zip, 'word/document.xml')
  return body?.documentElement ? wordText(body.documentElement) : ''
}

// ── Excel ────────────────────────────────────────────────────────────────────

function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break
    n = n * 26 + ch.charCodeAt(0) - 64
  }
  return Math.max(0, n - 1)
}

function sharedStrings(zip: Zip): string[] {
  const doc = xml(zip, 'xl/sharedStrings.xml')
  if (!doc) return []
  return elements(doc, 'si').map((si) =>
    elements(si, 't')
      // la guía fonética repite el texto
      .filter((t) => t.parentElement?.localName !== 'rPh')
      .map((t) => t.textContent ?? '')
      .join(''),
  )
}

function readXlsx(zip: Zip): string {
  const book = xml(zip, 'xl/workbook.xml')
  const rels = xml(zip, 'xl/_rels/workbook.xml.rels')
  if (!book || !rels) return ''
  const targets = new Map(elements(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']))
  const strings = sharedStrings(zip)
  const out: string[] = []
  for (const sheet of elements(book, 'sheet')) {
    if (sheet.getAttribute('state') === 'hidden') continue
    const target = targets.get(attr(sheet, 'id'))
    if (!target) continue
    const doc = xml(zip, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    if (!doc) continue
    const rows: string[] = []
    for (const row of elements(doc, 'row')) {
      const cells: string[] = []
      for (const cell of Array.from(row.children).filter((c) => c.localName === 'c')) {
        const type = cell.getAttribute('t')
        const raw = Array.from(cell.children).find((c) => c.localName === 'v')?.textContent ?? ''
        const value = type === 's' ? (strings[Number(raw)] ?? '') : type === 'inlineStr' ? elements(cell, 't').map((t) => t.textContent ?? '').join('') : raw
        cells[columnIndex(cell.getAttribute('r') ?? '')] = value
      }
      const line = Array.from(cells, (c) => c ?? '').join('\t').trimEnd()
      if (line) rows.push(line)
    }
    if (rows.length) out.push(`[Hoja ${sheet.getAttribute('name') ?? ''}]\n${rows.join('\n')}`)
  }
  return out.join('\n\n')
}

// ── PowerPoint ───────────────────────────────────────────────────────────────

function readPptx(zip: Zip): string {
  const slides = Object.keys(zip)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]))
  return slides
    .map((path, i) => {
      const doc = xml(zip, path)
      const lines = doc ? elements(doc, 'p').map((p) => elements(p, 't').map((t) => t.textContent ?? '').join('')).filter(Boolean) : []
      return lines.length ? `[Lámina ${i + 1}]\n${lines.join('\n')}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// ── OpenDocument ─────────────────────────────────────────────────────────────

function readOpenDocument(zip: Zip): string {
  const doc = xml(zip, 'content.xml')
  if (!doc) return ''
  const rows = elements(doc, 'table-row')
  if (rows.length) {
    return rows
      .map((row) =>
        Array.from(row.children)
          .filter((c) => c.localName === 'table-cell')
          .map((c) => c.textContent ?? '')
          .join('\t')
          .trimEnd(),
      )
      .filter(Boolean)
      .join('\n')
  }
  return [...elements(doc, 'h'), ...elements(doc, 'p')]
    .map((p) => p.textContent ?? '')
    .filter(Boolean)
    .join('\n')
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const READERS: Record<string, { read(zip: Zip): string; kind: AttachmentKind }> = {
  docx: { read: readDocx, kind: 'document' },
  xlsx: { read: readXlsx, kind: 'spreadsheet' },
  xlsm: { read: readXlsx, kind: 'spreadsheet' },
  pptx: { read: readPptx, kind: 'document' },
  odt: { read: readOpenDocument, kind: 'document' },
  odp: { read: readOpenDocument, kind: 'document' },
  ods: { read: readOpenDocument, kind: 'spreadsheet' },
}

async function embeddedImages(zip: Zip): Promise<string[]> {
  const found = Object.entries(zip)
    .filter(([path, bytes]) => /(^|\/)(media|Pictures)\/[^/]+\.(png|jpe?g)$/i.test(path) && bytes.length >= MIN_EMBEDDED_BYTES)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_EMBEDDED_IMAGES)
  const out: string[] = []
  for (const [path, bytes] of found) {
    const type = path.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg'
    const url = await blobToDataUrl(new Blob([bytes.slice()], { type })).catch(() => null)
    if (url) out.push(url)
  }
  return out
}

export async function readOffice(file: File, extension: string): Promise<ReadResult> {
  const reader = READERS[extension]!
  let zip: Zip
  try {
    zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new ReadProblem('unreadable')
  }
  const full = reader.read(zip).trim()
  const images = await embeddedImages(zip)
  const text = full.slice(0, ATTACHMENT_LIMITS.fileChars)
  if (!text && !images.length) throw new ReadProblem('empty')
  const attachment: TurnAttachment = {
    name: file.name,
    kind: reader.kind,
    ...(text ? { text } : {}),
    ...(images.length ? { images } : {}),
    ...(text.length < full.length ? { truncated: true } : {}),
  }
  return { attachment, ...(images[0] ? { preview: images[0] } : {}) }
}
