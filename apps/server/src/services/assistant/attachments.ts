/**
 * Archivos adjuntos a un turno. El navegador manda lo extraído (texto e imágenes reducidas). Aquí se
 * limpia, se comprueba que las imágenes lo sean de verdad y se arma lo que ve el modelo.
 *
 * El contenido de un archivo es de terceros: va marcado como dato y nunca como parte del pedido.
 * Lo leído queda guardado con el mensaje para poder seguir hablando del archivo, y nunca vuelve al
 * navegador: `publicParts` lo quita de todo lo que sale.
 */
import { ATTACHMENT_LIMITS, type MessagePart, type TurnAttachment } from '@dekopen/shared'
import sharp from 'sharp'
import { HttpError } from '../../lib/errors'
import { imageMessage, type ChatMessageParam, type ContentPart } from '../ai/client'

type AttachmentPart = Extract<MessagePart, { type: 'attachment' }>

/** Las imágenes de los últimos 2 mensajes con archivos siguen llegando al modelo. */
const IMAGE_ROWS = 2
/** Texto de un archivo de un mensaje antiguo que sigue en el historial. */
const OLD_FILE_CHARS = 12_000

function cleanName(name: string): string {
  const clean = Array.from(name, (ch) => (ch < ' ' || ch === '<' || ch === '>' || ch === '"' ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.slice(0, ATTACHMENT_LIMITS.nameMax) || 'archivo'
}

function invalid(): HttpError {
  return new HttpError(400, 'invalid_attachment', 'No pude leer uno de los archivos.')
}

async function checkedImage(dataUrl: string): Promise<string> {
  try {
    // Valida el formato de la data URL igual que al enviarla al modelo.
    imageMessage('', dataUrl)
    await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')).metadata()
    return dataUrl
  } catch {
    throw invalid()
  }
}

/** Partes de mensaje de los archivos de un turno. Rechaza lo que no sea una imagen real. */
export async function attachmentParts(list: readonly TurnAttachment[]): Promise<AttachmentPart[]> {
  const parts: AttachmentPart[] = []
  for (const file of list) {
    const images = await Promise.all((file.images ?? []).map(checkedImage))
    const text = file.text?.trim()
    parts.push({
      type: 'attachment',
      name: cleanName(file.name),
      kind: file.kind,
      ...(file.pages ? { pages: file.pages } : {}),
      ...(file.readPages ? { readPages: file.readPages } : {}),
      ...(file.truncated ? { truncated: true } : {}),
      content: { ...(text ? { text } : {}), ...(images.length ? { images } : {}) },
    })
  }
  return parts
}

/** Lo que sale al navegador: sin el contenido leído. */
export function publicParts(parts: readonly MessagePart[]): MessagePart[] {
  return parts.map((part) => {
    if (part.type !== 'attachment' || !part.content) return part
    const { content: _content, ...rest } = part
    return rest
  })
}

const isAttachment = (part: MessagePart): part is AttachmentPart => part.type === 'attachment'

/** Mensajes cuyas imágenes siguen yendo al modelo (lo más antiguo queda solo como nota). */
export function recentAttachmentRows(rows: readonly { id: string; role: string; parts: MessagePart[] | null }[]): Set<string> {
  const keep = new Set<string>()
  for (let i = rows.length - 1; i >= 0 && keep.size < IMAGE_ROWS; i--) {
    const row = rows[i]!
    if (row.role === 'user' && row.parts?.some((part) => isAttachment(part) && part.content?.images?.length)) keep.add(row.id)
  }
  return keep
}

function fileBlock(part: AttachmentPart, recent: boolean): string {
  const text = part.content?.text ?? ''
  const shown = recent ? text : text.slice(0, OLD_FILE_CHARS)
  const pages = part.pages ? ` pages="${part.pages}"${part.readPages ? ` read="${part.readPages}"` : ''}` : ''
  const partial = part.truncated || shown.length < text.length ? ' partial="true"' : ''
  const images = part.content?.images?.length ?? 0
  const note = !recent && images ? ' note="its images are no longer visible; ask the user to attach it again if you need them"' : ''
  const head = `name="${part.name}" kind="${part.kind}"${pages}${partial}${note}`
  return shown ? `<attached_file ${head}>\n${shown}\n</attached_file>` : `<attached_file ${head} />`
}

/** Mensaje de la persona para el modelo: su texto, los archivos como dato y las imágenes. */
export function userMessageParam(text: string, parts: readonly MessagePart[], recent: boolean): ChatMessageParam {
  const files = parts.filter(isAttachment)
  if (!files.length) return { role: 'user', content: text }
  const blocks = files.map((file) => fileBlock(file, recent)).join('\n\n')
  const body = text ? `${blocks}\n\n${text}` : blocks
  const withImages = recent ? files.filter((file) => file.content?.images?.length) : []
  if (!withImages.length) return { role: 'user', content: body }
  const content: ContentPart[] = [{ type: 'text', text: body }]
  // Cada grupo va rotulado: sin esto el modelo no sabe de qué archivo es cada imagen.
  for (const file of withImages) {
    content.push({ type: 'text', text: `Images of "${file.name}":` })
    for (const url of file.content!.images!) content.push({ type: 'image_url', image_url: { url } })
  }
  return { role: 'user', content }
}
