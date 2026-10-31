/**
 * Nombres de archivo humanos para los PDF: «Cotizacion-412-Casa-Perez.pdf».
 * El nombre ASCII va en `filename` (todos los navegadores) y el de tildes en `filename*`.
 */

const MARKS = /[\u0300-\u036f]/g

/** «Casa Pérez · Concepción» → «Casa-Perez-Concepcion» (ASCII, máx. `max` caracteres). */
export function fileSlug(text: string | null | undefined, max = 48): string {
  const ascii = (text ?? '')
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length <= max) return ascii
  const cut = ascii.slice(0, max)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > max * 0.6 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, '')
}

/** Versión con tildes (para `filename*`), sin caracteres prohibidos en nombres de archivo. */
export function fileTitle(text: string | null | undefined, max = 60): string {
  const clean = (text ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/[·•]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return clean.length > max ? clean.slice(0, max).replace(/-+$/g, '') : clean
}

export interface PdfFileName {
  /** ASCII seguro: «Cotizacion-412-Casa-Perez.pdf». */
  ascii: string
  /** Con tildes: «Cotización-412-Casa-Pérez.pdf». */
  unicode: string
}

function join(parts: (string | number | undefined | null | false)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== false && String(p).length > 0)
    .join('-')
}

/** Arma ambos nombres a partir de partes legibles (la última suele ser el título de la obra). */
export function pdfFileName(parts: { label: string; labelAscii: string; number?: string | number; title?: string | null }): PdfFileName {
  const ascii = join([parts.labelAscii, parts.number, fileSlug(parts.title)]) || 'Documento'
  const unicode = join([parts.label, parts.number, fileTitle(parts.title)]) || 'Documento'
  return { ascii: `${ascii}.pdf`, unicode: `${unicode}.pdf` }
}

/** Letra de revisión para el nombre: 1 → A (no se muestra), 2 → B… */
export function revisionSuffix(revision: number): string | undefined {
  if (!revision || revision < 2) return undefined
  let n = revision
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** «Cotizacion-412-Casa-Perez.pdf» (o «Cotizacion-412B-…» desde la segunda versión). */
export function quoteFileName(quote: { number: number; title?: string | null; revision?: number }): PdfFileName {
  const number = `${quote.number}${revisionSuffix(quote.revision ?? 0) ?? ''}`
  return pdfFileName({ label: 'Cotización', labelAscii: 'Cotizacion', number, title: quote.title })
}

/**
 * «OT-38-Cortes-Casa-Perez.pdf» (mismo orden que workshopDocumentFileName de la web, más la
 * obra); la OT misma es «OT-38-Casa-Perez.pdf».
 */
export function workshopFileName(base: string, workOrder: { number: number | string; title?: string | null }): PdfFileName {
  const doc = base === 'OT' ? undefined : base
  const ascii = join(['OT', workOrder.number, doc ? fileSlug(doc) : undefined, fileSlug(workOrder.title)])
  const unicode = join(['OT', workOrder.number, doc ? fileTitle(doc) : undefined, fileTitle(workOrder.title)])
  return { ascii: `${ascii}.pdf`, unicode: `${unicode}.pdf` }
}

/** «Catalogo-Ventanas-del-Sur.pdf». */
export function catalogFileName(orgName: string): PdfFileName {
  return pdfFileName({ label: 'Catálogo', labelAscii: 'Catalogo', title: orgName })
}

/** Cabecera Content-Disposition con ambos nombres (RFC 6266 / 5987). */
export function contentDisposition(name: PdfFileName, disposition: 'inline' | 'attachment' = 'attachment'): string {
  const ascii = name.ascii.replace(/["\\]/g, '')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name.unicode).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}`
}
