/**
 * PDF: el texto se saca directo y las páginas sin texto (escaneos, fotos) van como imagen para que
 * el modelo las lea. Un PDF corto también va como imagen aunque tenga texto: suele ser un plano, y
 * lo que importa está en el dibujo.
 */
import { ATTACHMENT_LIMITS, type TurnAttachment } from '@dekopen/shared'
import { canvasToDataUrl, fitCanvas, MAX_EDGE } from './image'
import { ReadProblem, type ReadResult } from './types'

const MAX_TEXT_PAGES = 200
const MAX_PAGE_IMAGES = 8
/** Con hasta estas páginas, todas van también como imagen. */
const SHORT_PDF_PAGES = 4
/** Menos que esto en una página es una página sin texto real. */
const SCANNED_CHARS = 30
/** Separación horizontal que indica otra columna (en puntos). */
const COLUMN_GAP = 14

interface TextItem {
  str: string
  width: number
  transform: number[]
}

/** Une los fragmentos respetando filas y columnas: las tablas de medidas siguen siendo tablas. */
export function joinPageText(items: readonly TextItem[]): string {
  let out = ''
  let lastY: number | null = null
  let lastEnd = 0
  for (const item of items) {
    if (!item.str) continue
    const x = item.transform[4]
    const y = item.transform[5]
    if (lastY !== null) {
      if (Math.abs(y - lastY) > 2) out += '\n'
      else if (x - lastEnd > COLUMN_GAP) out += '\t'
      else if (x - lastEnd > 1 && !out.endsWith(' ')) out += ' '
    }
    out += item.str
    lastY = y
    lastEnd = x + item.width
  }
  return out.trim()
}

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export async function readPdf(file: File): Promise<ReadResult> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  let doc
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  } catch (error) {
    throw new ReadProblem((error as { name?: string }).name === 'PasswordException' ? 'locked' : 'unreadable')
  }
  try {
    const pages: string[] = []
    const wanted: number[] = []
    const total = doc.numPages
    let chars = 0
    let lastRead = 0
    for (let n = 1; n <= Math.min(total, MAX_TEXT_PAGES); n++) {
      const page = await doc.getPage(n)
      const text = joinPageText((await page.getTextContent()).items as TextItem[])
      page.cleanup()
      if (text.length < SCANNED_CHARS || total <= SHORT_PDF_PAGES) wanted.push(n)
      if (text) {
        if (chars + text.length > ATTACHMENT_LIMITS.fileChars) break
        pages.push(`[Página ${n}]\n${text}`)
        chars += text.length
      }
      lastRead = n
    }

    const images: string[] = []
    for (const n of wanted.slice(0, MAX_PAGE_IMAGES)) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(3, MAX_EDGE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = fitCanvas(viewport.width, viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      await page.render({ canvasContext: ctx, viewport }).promise
      images.push(canvasToDataUrl(canvas))
      page.cleanup()
    }

    // Lo que no se alcanzó a leer se dice: el modelo tiene que poder avisarlo.
    const scannedLeft = wanted.length > images.length
    const attachment: TurnAttachment = {
      name: file.name,
      kind: 'pdf',
      pages: total,
      readPages: lastRead,
      ...(pages.length ? { text: pages.join('\n\n') } : {}),
      ...(images.length ? { images } : {}),
      ...(lastRead < total || scannedLeft ? { truncated: true } : {}),
    }
    if (!attachment.text && !attachment.images) throw new ReadProblem('empty')
    return { attachment, ...(images[0] ? { preview: images[0] } : {}) }
  } finally {
    await doc.destroy()
  }
}
