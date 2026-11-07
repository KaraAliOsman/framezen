/**
 * Regla dura del producto, comprobada sobre el PDF de verdad: el total aparece una sola vez, después de
 * todas las ventanas; nunca en portada, carta, resumen, cabecera, pie ni índice. Lo que puede seguirlo
 * (forma de pago, garantía, condiciones, aceptación) va después y ese es el orden por defecto.
 * Se renderiza con el mismo camino que el servidor (Chromium) y se lee el texto del PDF con pdf.js.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { QUOTE_PRESET_IDS, type QuotePresetId } from '@dekopen/shared'
import { buildSampleQuoteDoc, type QuoteDocDataV5 } from '@dekopen/documents'
import { computeLayout } from '@dekopen/engine'
import { ChromiumPdfRenderer, PdfUnavailableError } from '../src/services/pdf/browser'
import { renderQuoteDocument } from '../src/services/pdf/render'

const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 60_000 })
afterAll(() => renderer.close())

async function pageTexts(pdf: Buffer): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true, verbosity: 0 })
  const doc = await task.promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' '))
  }
  await task.destroy()
  return pages
}

const occurrences = (text: string, needle: string) => text.split(needle).length - 1
/** Sin espacios: el PDF puede partir una cifra en varios trozos de texto. */
const squash = (text: string) => text.replace(/\s+/g, '')

function renderOr(html: string): Promise<Buffer | null> {
  return renderer.render(html).catch((error) => {
    if (error instanceof PdfUnavailableError && error.reason === 'launch') return null
    throw error
  })
}

const RETIRED_FONTS = /Fraunces|Cormorant|DMSerif|DM-Serif|Bricolage|IBMPlex|IBM-Plex|Manrope/
const EXPECTED_FONT: Record<QuotePresetId, RegExp> = {
  atelier: /Hanken/,
  corporativa: /PublicSans|Public-Sans/,
  obra: /Archivo/,
  hogar: /Literata/,
  memoria: /Overpass/,
}

describe('el total nunca aparece antes de su cierre en el PDF', () => {
  for (const preset of QUOTE_PRESET_IDS) {
    for (const items of [1, 4, 12, 40]) {
      it(`${preset} con ${items} ventanas`, { timeout: 90_000 }, async () => {
        const data = buildSampleQuoteDoc({ layout: computeLayout, items }) as QuoteDocDataV5
        const { html } = renderQuoteDocument(data, preset)
        const pdf = await renderOr(html)
        if (!pdf) return console.warn('Chromium no disponible; se omite la prueba real.')
        const pages = await pageTexts(pdf)
        const money = (data.totals.total.toLocaleString('es-CL') as string).replace(/,/g, '.')
        const needle = squash(`$${money}`)
        const hits = pages.map((p) => occurrences(squash(p), needle))
        expect(hits.reduce((a, b) => a + b, 0), `${preset}: veces que aparece ${needle}`).toBe(1)
        const at = hits.findIndex((n) => n > 0)
        // Va después de la última ventana, y las condiciones y la firma después de él.
        const lastRef = data.items[data.items.length - 1].ref
        const lastItemPage = pages.findLastIndex((p) => new RegExp(`\\b${lastRef}\\b`).test(p))
        expect(lastItemPage, `${preset}: última ventana`).toBeLessThanOrEqual(at)
        const text = squash(pages.join(' '))
        for (const after of ['Nocubregolpes', 'Firmadelcliente']) expect(text.indexOf(after), `${preset}: ${after} tras el total`).toBeGreaterThan(text.indexOf(needle))
        // Ningún rótulo de total antes del cierre.
        for (const [i, text] of pages.entries()) {
          if (i !== at) expect(text, `${preset} hoja ${i + 1}`).not.toMatch(/Total con IVA|Total neto|Precio final/i)
        }
        // Portada sin un solo monto.
        if (html.includes('data-dk-page="cover"')) expect(pages[0], `${preset} portada`).not.toMatch(/\$\s?\d/)
        const raw = pdf.toString('latin1')
        expect(raw).not.toMatch(RETIRED_FONTS)
        expect(raw).toMatch(EXPECTED_FONT[preset])
      })
    }
  }
})
