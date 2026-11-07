import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { computeLayout } from '@dekopen/engine'
import { renderDocumentHtml, renderDocumentHtmlAsync, renderStaticMarkupInSlices } from '../src/render'
import { CATALOG_TEMPLATES, CatalogDocument, QUOTE_TEMPLATES, QuoteDocument, SAMPLE_CATALOG_DOC, buildSampleQuoteDoc } from '../src/sales'
import { WORKSHOP_DOCUMENTS, WorkshopDocument, sampleWorkshopData, workshopLabelCount } from '../src/workshop'

/**
 * Los ids de useId llevan un prefijo por tramo: se reemplazan por ID0, ID1… en orden de aparición
 * (mismo orden en ambos documentos) para comparar el resto byte a byte.
 */
function normalizeIds(html: string): string {
  const ids = [...new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]
  const pairs = ids.map((id, i) => [id, `ID${i}`] as const).sort((a, b) => b[0].length - a[0].length)
  let out = html
  for (const [id, placeholder] of pairs) out = out.split(id).join(placeholder)
  return out
}

/** Ningún id repetido (los tramos no pueden chocar entre sí). */
function duplicateIds(html: string): string[] {
  const seen = new Set<string>()
  const dup: string[] = []
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(id)) dup.push(id)
    seen.add(id)
  }
  return dup
}

const data = sampleWorkshopData()
const quote = buildSampleQuoteDoc({ layout: computeLayout })

const cases: [string, ReactElement][] = [
  ...WORKSHOP_DOCUMENTS.map((d) => [`taller: ${d.kind}`, <WorkshopDocument kind={d.kind} data={data} />] as [string, ReactElement]),
  ['taller: etiquetas en rollo sin vidrio', <WorkshopDocument kind="labels" data={data} labelFormat="roll" includeGlass={false} />],
  ...QUOTE_TEMPLATES.map((t) => [`cotización: ${t.id}`, <QuoteDocument data={quote} template={t.id} />] as [string, ReactElement]),
  ...CATALOG_TEMPLATES.map((t) => [`catálogo: ${t.id}`, <CatalogDocument data={SAMPLE_CATALOG_DOC} template={t.id} />] as [string, ReactElement]),
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('render por tramos', () => {
  it.each(cases)('%s: el mismo marcado que el render de una vez, sin ids repetidos', async (_name, element) => {
    const whole = renderToStaticMarkup(element)
    const sliced = await renderStaticMarkupInSlices(element, { sliceMs: 0, yieldToHost: async () => undefined })
    expect(duplicateIds(sliced)).toEqual([])
    expect(normalizeIds(sliced)).toBe(normalizeIds(whole))
  })

  it('nunca llama fuera de React a un componente con hooks (sin «Invalid hook call» en consola)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    for (const [, element] of cases) await renderStaticMarkupInSlices(element, { sliceMs: 0, yieldToHost: async () => undefined })
    expect(errors).not.toHaveBeenCalled()
  })

  it('cede el hilo entre hojas: las etiquetas de una OT grande no congelan el servidor', async () => {
    const big = sampleWorkshopData({ windows: data.windows.map((w) => ({ ...w, qty: w.qty * 6 })) })
    const labels = workshopLabelCount(big)
    expect(labels).toBeGreaterThan(1000)
    const element = <WorkshopDocument kind="labels" data={big} />
    let yields = 0
    const sliced = await renderStaticMarkupInSlices(element, { sliceMs: 0, yieldToHost: async () => void yields++ })
    // Al menos una pausa por hoja de 10 etiquetas: ninguna hoja se arma junto con la siguiente sin ceder el hilo.
    expect(yields).toBeGreaterThanOrEqual(Math.ceil(labels / 10))
    expect((sliced.match(/class="fzw-label"/g) ?? []).length).toBe(labels)

    // Con el ceder real (setImmediate), los temporizadores corren mientras se arma el documento.
    let ticks = 0
    let running = true
    const tick = () => {
      ticks++
      if (running) setImmediate(tick)
    }
    setImmediate(tick)
    const html = await renderDocumentHtmlAsync(element, { title: 'Etiquetas', sliceMs: 5 })
    running = false
    expect(ticks).toBeGreaterThan(3)
    expect(normalizeIds(html)).toBe(normalizeIds(renderDocumentHtml(element, { title: 'Etiquetas' })))
    // Arma más de 1000 etiquetas tres veces (~1,7 s sola); con toda la suite en paralelo supera los 5 s por defecto.
  }, 30_000)
})
