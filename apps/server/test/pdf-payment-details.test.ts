/**
 * Datos de pago en el PDF real: salen después del total en las 5 plantillas, solo si el taller lo
 * eligió, y el total sigue apareciendo una sola vez.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DEFAULT_PAYMENTS, pdfPaymentDetails, QUOTE_PRESET_IDS, type PaymentSettings } from '@dekopen/shared'
import { buildSampleQuoteDoc, type QuoteDocDataV5 } from '@dekopen/documents'
import { computeLayout } from '@dekopen/engine'
import { ChromiumPdfRenderer, PdfUnavailableError } from '../src/services/pdf/browser'
import { renderQuoteDocument } from '../src/services/pdf/render'

const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 60_000 })
afterAll(() => renderer.close())

const squash = (text: string) => text.replace(/\s+/g, '')

async function pdfText(pdf: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true, verbosity: 0 })
  const doc = await task.promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
  }
  await task.destroy()
  return squash(pages.join(' '))
}

const FULL: PaymentSettings = {
  ...DEFAULT_PAYMENTS,
  showInPdf: true,
  accounts: [
    { id: 'a', holder: 'Aberturas SpA', rut: '76.543.210-3', bank: 'Banco Uno', type: 'corriente', number: '000123456', email: 'pagos@taller.test' },
    { id: 'b', holder: 'Aberturas SpA', rut: '76.543.210-3', bank: 'Banco Dos', type: 'vista', number: '999888777', email: '' },
  ],
  instructions: 'Avísanos al transferir',
  links: [{ id: 'l', label: 'Pagar con tarjeta', url: 'https://pago.ejemplo.test/x' }],
  deposit: { mode: 'milestones', value: 0, milestones: [{ id: 'm1', label: 'Al aceptar', pct: 40 }, { id: 'm2', label: 'Contra entrega', pct: 60 }] },
}

function doc(payments: PaymentSettings): QuoteDocDataV5 {
  const data = buildSampleQuoteDoc({ layout: computeLayout, items: 4 }) as QuoteDocDataV5
  // Sin forma de pago escrita: el plan sale de Ajustes.
  const details = pdfPaymentDetails(payments)
  return { ...data, prefs: { ...data.prefs, paymentTerms: '' }, ...(details ? { paymentDetails: details } : {}) }
}

describe('datos de pago en el PDF', () => {
  it('sin la opción o sin datos no hay nada que imprimir', () => {
    expect(pdfPaymentDetails(undefined)).toBeNull()
    expect(pdfPaymentDetails({ ...FULL, showInPdf: false })).toBeNull()
    expect(pdfPaymentDetails({ ...DEFAULT_PAYMENTS, showInPdf: true })).toBeNull()
    // Un enlace que no es https o una cuenta a medias tampoco cuentan.
    expect(pdfPaymentDetails({ ...DEFAULT_PAYMENTS, showInPdf: true, links: [{ id: 'x', label: 'Pagar', url: 'javascript:alert(1)' }], accounts: [{ ...FULL.accounts[0]!, number: '' }] })).toBeNull()
  })

  for (const preset of QUOTE_PRESET_IDS) {
    it(`${preset}: salen tras el total y el total sigue siendo uno`, { timeout: 90_000 }, async () => {
      const data = doc(FULL)
      const { html } = renderQuoteDocument(data, preset)
      expect(html).toContain('class="dkd-bank')
      expect(renderQuoteDocument(doc(DEFAULT_PAYMENTS), preset).html).not.toContain('class="dkd-bank')
      const pdf = await renderer.render(html).catch((error) => {
        if (error instanceof PdfUnavailableError && error.reason === 'launch') return null
        throw error
      })
      if (!pdf) return console.warn('Chromium no disponible; se omite la prueba real.')
      const text = await pdfText(pdf)
      const total = data.totals.total
      const money = (n: number) => squash(`$${n.toLocaleString('es-CL').replace(/,/g, '.')}`)
      const at = text.indexOf(money(total))
      expect(text.split(money(total)).length - 1, `${preset}: veces que aparece el total`).toBe(1)
      for (const seen of ['BancoUno', 'BancoDos', '000123456', '999888777', 'Avísanosaltransferir', 'pago.ejemplo.test/x', 'Alaceptar', 'Contraentrega']) {
        expect(text.indexOf(seen), `${preset}: ${seen} tras el total`).toBeGreaterThan(at)
      }
      // El último hito absorbe el redondeo: la suma da el total exacto.
      const first = Math.round(total * 0.4)
      expect(text).toContain(money(first))
      expect(text).toContain(money(total - first))
    })
  }
})
