import { afterAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { buildSampleQuoteDoc } from '@dekopen/documents'
import { computeLayout } from '@dekopen/engine'
import { ChromiumPdfRenderer, PdfUnavailableError, pdfTimeoutFor } from '../src/services/pdf/browser'
import { renderQuoteDocument } from '../src/services/pdf/render'

const real = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 45_000 })
let chromiumOk = true

afterAll(async () => {
  await real.close()
})

/** Cuenta páginas de un PDF (objetos /Type /Page). */
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('Chromium real (playwright-core)', () => {
  it('genera un PDF Carta de la cotización con fuentes embebidas y reutiliza el navegador', async () => {
    const data = buildSampleQuoteDoc({ layout: computeLayout, items: 4 })
    const { html } = renderQuoteDocument(data, 'esencial')
    let pdf: Buffer
    try {
      pdf = await real.render(html)
    } catch (error) {
      if (error instanceof PdfUnavailableError && error.reason === 'launch') {
        chromiumOk = false
        console.warn('Chromium no disponible en esta máquina; se omite la prueba real.')
        return
      }
      throw error
    }
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(20_000)
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(1)
    // Fuentes incrustadas en el PDF: TrueType/CFF (FontFile2/3) o, en Skia reciente (m156+), las
    // fuentes variables como Type3 con subconjunto («AAAAAA+Instrument-Sans»).
    expect(pdf.toString('latin1')).toMatch(/FontFile2|FontFile3|\/Subtype\s*\/Type3/)
    // …y es la de los documentos, no una de respaldo del sistema.
    expect(pdf.toString('latin1')).toMatch(/\/FontName\s*\/[A-Z]{6}\+(Literata|SourceSans)/)
    // Tamaño Carta (612 × 792 pt) por el @page del documento.
    expect(pdf.toString('latin1')).toMatch(/MediaBox\s*\[0 0 612 792\]/)

    // Varias a la vez: misma instancia, en cola.
    const docs = (['galeria', 'compacta', 'editorial'] as const).map((t) => renderQuoteDocument(data, t).html)
    const pdfs = await Promise.all(docs.map((d) => real.render(d)))
    for (const p of pdfs) expect(p.subarray(0, 5).toString()).toBe('%PDF-')
    expect(real.launches).toBe(1)
  }, 90_000)

  it('si el navegador se cierra, lo vuelve a abrir solo', async () => {
    if (!chromiumOk) return
    await real.close()
    const pdf = await real.render('<!doctype html><html><body><p>Hola</p></body></html>')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(real.launches).toBe(2)
  }, 60_000)
})

describe('navegador simulado', () => {
  /** Navegador falso cuyo setContent nunca termina (documento colgado). */
  function hangingBrowser(closed: { count: number }): Browser {
    const page = { setContent: () => new Promise(() => {}), evaluate: async () => undefined, pdf: async () => Buffer.from('%PDF-') }
    const context = { newPage: async () => page, close: async () => undefined }
    return { newContext: async () => context, on: () => undefined, close: async () => void closed.count++ } as unknown as Browser
  }

  it('documento colgado con el navegador sano: cierra solo su contexto, no reinicia ni reintenta, y responde no disponible', async () => {
    const closed = { count: 0 }
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 80, launch: async () => hangingBrowser(closed) })
    const error = await renderer.render('<p>x</p>').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PdfUnavailableError)
    expect((error as PdfUnavailableError).reason).toBe('timeout')
    // Reiniciar cortaría los demás PDF en curso, y reintentar con el mismo plazo solo duplicaría la espera.
    expect(renderer.launches).toBe(1)
    expect(closed.count).toBe(0)
  })

  it('navegador trabado (ni el contexto cierra): lo reinicia y reintenta una vez', async () => {
    const closed = { count: 0 }
    const stuck = (): Browser => {
      const page = { setContent: () => new Promise(() => {}), evaluate: async () => undefined, pdf: async () => Buffer.from('%PDF-') }
      const context = { newPage: async () => page, close: () => new Promise(() => {}) }
      return { newContext: async () => context, on: () => undefined, isConnected: () => true, close: async () => void closed.count++ } as unknown as Browser
    }
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 60, contextCloseMs: 30, launch: async () => stuck() })
    const error = await renderer.render('<p>x</p>').catch((e: unknown) => e)
    expect((error as PdfUnavailableError).reason).toBe('timeout')
    expect(renderer.launches).toBe(2)
    expect(closed.count).toBe(2)
  })

  it('un documento pesado que pasa su plazo no corta a los demás PDF en curso', async () => {
    let browserClosed = 0
    const contextsClosed: string[] = []
    const browser = {
      newContext: async () => {
        let doc = ''
        const page = {
          setContent: async (html: string) => {
            doc = html
            // El pesado nunca termina; el liviano tarda un poco más que el plazo del pesado.
            await (html.includes('pesado') ? new Promise(() => {}) : new Promise((r) => setTimeout(r, 120)))
          },
          evaluate: async () => undefined,
          pdf: async () => Buffer.from(`%PDF-${doc}`),
        }
        return { newPage: async () => page, close: async () => void contextsClosed.push(doc) }
      },
      on: () => undefined,
      isConnected: () => true,
      close: async () => void browserClosed++,
    } as unknown as Browser
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 1_000, launch: async () => browser })
    const heavy = renderer.render('<p>pesado</p>', { timeoutMs: 50 }).catch((e: unknown) => e)
    const light = renderer.render('<p>liviano</p>')
    expect((await light).toString()).toBe('%PDF-<p>liviano</p>')
    expect(((await heavy) as PdfUnavailableError).reason).toBe('timeout')
    expect(browserClosed).toBe(0)
    expect(renderer.launches).toBe(1)
    expect(contextsClosed.sort()).toEqual(['<p>liviano</p>', '<p>pesado</p>'])
  })

  it('navegador caído con dos PDF en curso: el segundo no cierra el navegador que relanzó el primero', async () => {
    const GONE = 'Target page, context or browser has been closed'
    const browsers: { closed: boolean; closes: number }[] = []
    const launch = async (): Promise<Browser> => {
      const n = browsers.length
      const state = { closed: false, closes: 0 }
      browsers.push(state)
      const browser = {
        newContext: async () => {
          if (state.closed) throw new Error(GONE)
          const page = {
            setContent: async (html: string) => {
              if (n === 0) {
                // El primer navegador se cae: a cada documento le llega el error en otro momento.
                await new Promise((r) => setTimeout(r, html.includes('a') ? 10 : 60))
                state.closed = true
                throw new Error(GONE)
              }
              await new Promise((r) => setTimeout(r, 100))
              if (state.closed) throw new Error(GONE)
            },
            evaluate: async () => undefined,
            pdf: async () => Buffer.from('%PDF-1.7'),
          }
          return { newPage: async () => page, close: async () => undefined }
        },
        on: () => undefined,
        isConnected: () => !state.closed,
        close: async () => {
          state.closed = true
          state.closes++
        },
      }
      return browser as unknown as Browser
    }
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 2_000, launch })
    const results = await Promise.allSettled([renderer.render('<p>a</p>'), renderer.render('<p>b</p>')])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(renderer.launches).toBe(2)
    expect(browsers[1].closes).toBe(0)
  })

  it('el plazo crece con el tamaño del HTML (con tope)', async () => {
    expect(pdfTimeoutFor(40_000, 30_000)).toBe(30_000)
    expect(pdfTimeoutFor(10_000_000, 30_000)).toBe(48_000)
    expect(pdfTimeoutFor(500_000_000, 30_000)).toBe(120_000)
    const timeouts: number[] = []
    const page = { setContent: async (_html: string, opts: { timeout: number }) => void timeouts.push(opts.timeout), evaluate: async () => undefined, pdf: async () => Buffer.from('%PDF-') }
    const browser = { newContext: async () => ({ newPage: async () => page, close: async () => undefined }), on: () => undefined, close: async () => undefined } as unknown as Browser
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, timeoutMs: 30_000, launch: async () => browser })
    await renderer.render('<p>chico</p>')
    await renderer.render(`<p>${'x'.repeat(10_000_000)}</p>`)
    expect(timeouts[0]).toBe(30_000)
    expect(timeouts[1]).toBeGreaterThan(47_000)
  })

  it('Chromium no instalado: no disponible y no reintenta en cada pedido', async () => {
    let attempts = 0
    const renderer = new ChromiumPdfRenderer({
      idleMs: 0,
      launch: async () => {
        attempts++
        throw new Error("Executable doesn't exist at /nope/chrome")
      },
    })
    const first = await renderer.render('<p>x</p>').catch((e: unknown) => e)
    expect(first).toBeInstanceOf(PdfUnavailableError)
    expect((first as PdfUnavailableError).reason).toBe('launch')
    expect((first as Error).message).toMatch(/Imprimir/)
    await renderer.render('<p>y</p>').catch(() => undefined)
    expect(attempts).toBe(1)
    expect(renderer.status().lastLaunchError).toMatch(/Executable/)
  })

  it('cola con concurrencia limitada y tope de espera', async () => {
    let active = 0
    let peak = 0
    const page = {
      setContent: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
      },
      evaluate: async () => undefined,
      pdf: async () => Buffer.from('%PDF-1.7'),
    }
    const browser = { newContext: async () => ({ newPage: async () => page, close: async () => undefined }), on: () => undefined, close: async () => undefined } as unknown as Browser
    const renderer = new ChromiumPdfRenderer({ idleMs: 0, concurrency: 2, maxQueue: 3, launch: async () => browser })
    const results = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => renderer.render(`<p>${i}</p>`)))
    expect(peak).toBe(2)
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    const busy = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(busy).toHaveLength(2)
    expect((busy[0].reason as PdfUnavailableError).reason).toBe('busy')
  })
})
