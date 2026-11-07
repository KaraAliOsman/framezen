/**
 * Lee cualquier archivo en el navegador y deja lo que el asistente necesita: texto, imágenes
 * reducidas o ambos. El archivo original nunca sale del equipo. Lo pesado (PDF, Office) se carga
 * recién cuando alguien adjunta uno.
 *
 * El orden importa: primero lo que se conoce por extensión y, si no, se mira el contenido. Un .dxf o
 * un archivo sin extensión que resulta ser texto se lee como texto.
 */
import { ATTACHMENT_LIMITS, type TurnAttachment } from '@dekopen/shared'
import { blobToDataUrl } from './image'
import { ReadProblem, type ReadResult } from './types'

export const MAX_FILE_BYTES = 60 * 1024 * 1024

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'avif', 'svg'])
const PHOTO_FORMATS = new Set(['heic', 'heif', 'tif', 'tiff', 'raw', 'cr2', 'nef', 'dng'])
const LEGACY_OFFICE = new Set(['doc', 'xls', 'ppt', 'xlsb'])
const CAD = new Set(['dwg', 'skp', 'rvt', 'ifc', '3dm', 'step', 'stp'])
const MEDIA = new Set(['mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm'])
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz'])
const SHEET_TEXT = new Set(['csv', 'tsv'])
const OFFICE = new Set(['docx', 'xlsx', 'xlsm', 'pptx', 'odt', 'ods', 'odp'])

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

const hasPdfMagic = (bytes: Uint8Array) => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46

/** Texto del archivo, o null si es binario. */
export function decodeText(bytes: Uint8Array): string | null {
  const sample = bytes.subarray(0, 8192)
  let odd = 0
  for (const byte of sample) {
    if (byte === 0) return null
    if (byte < 9 || (byte > 13 && byte < 32)) odd++
  }
  if (sample.length && odd / sample.length > 0.02) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Planillas y textos guardados en Windows.
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** RTF: quita los comandos y deja el texto. */
function stripRtf(text: string): string {
  return text
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .trim()
}

async function readText(file: File, extension: string): Promise<ReadResult> {
  const decoded = decodeText(new Uint8Array(await file.arrayBuffer()))
  if (decoded === null) throw new ReadProblem('unreadable')
  const full = (extension === 'rtf' ? stripRtf(decoded) : decoded).trim()
  if (!full) throw new ReadProblem('empty')
  const text = full.slice(0, ATTACHMENT_LIMITS.fileChars)
  const attachment: TurnAttachment = {
    name: file.name,
    kind: SHEET_TEXT.has(extension) ? 'spreadsheet' : 'text',
    text,
    ...(text.length < full.length ? { truncated: true } : {}),
  }
  return { attachment }
}

export async function readAttachment(file: File): Promise<ReadResult> {
  if (file.size > MAX_FILE_BYTES) throw new ReadProblem('too_big')
  if (file.size === 0) throw new ReadProblem('empty')
  const extension = extensionOf(file.name)
  if (LEGACY_OFFICE.has(extension)) throw new ReadProblem('legacy_office')
  if (CAD.has(extension)) throw new ReadProblem('cad')
  if (MEDIA.has(extension) || file.type.startsWith('audio/') || file.type.startsWith('video/')) throw new ReadProblem('media')
  if (ARCHIVE.has(extension)) throw new ReadProblem('archive')
  if (PHOTO_FORMATS.has(extension)) {
    // Safari abre HEIC; si este navegador no puede, se dice cómo salir del paso.
    const url = await blobToDataUrl(file).catch(() => null)
    if (!url) throw new ReadProblem('photo_format')
    return { attachment: { name: file.name, kind: 'image', images: [url] }, preview: url }
  }
  if (IMAGE.has(extension) || file.type.startsWith('image/')) {
    const url = await blobToDataUrl(file).catch(() => null)
    if (!url) throw new ReadProblem('unreadable')
    return { attachment: { name: file.name, kind: 'image', images: [url] }, preview: url }
  }
  if (OFFICE.has(extension)) {
    const { readOffice } = await import('./office')
    return readOffice(file, extension)
  }
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (extension === 'pdf' || file.type === 'application/pdf' || hasPdfMagic(head)) {
    const { readPdf } = await import('./pdf')
    return readPdf(file)
  }
  return readText(file, extension)
}

/** Acota el turno completo: lo que sobra se recorta y queda marcado para que el modelo lo sepa. */
export function fitTurn(list: readonly TurnAttachment[]): TurnAttachment[] {
  let chars: number = ATTACHMENT_LIMITS.turnChars
  let images: number = ATTACHMENT_LIMITS.images
  const out: TurnAttachment[] = []
  for (const file of list) {
    const text = file.text?.slice(0, Math.max(0, chars))
    const pics = file.images?.slice(0, Math.max(0, images))
    chars -= text?.length ?? 0
    images -= pics?.length ?? 0
    const cut = (text?.length ?? 0) < (file.text?.length ?? 0) || (pics?.length ?? 0) < (file.images?.length ?? 0)
    if (!text?.trim() && !pics?.length) continue
    const { text: _text, images: _images, ...rest } = file
    out.push({ ...rest, ...(text ? { text } : {}), ...(pics?.length ? { images: pics } : {}), ...(cut ? { truncated: true } : {}) })
  }
  return out
}
