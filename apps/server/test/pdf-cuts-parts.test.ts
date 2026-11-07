import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDesign, type Catalog } from '@dekopen/engine'
import type { Quote, WorkOrder } from '@dekopen/shared'
import { setPdfRenderer, type PdfRenderer } from '../src/services/pdf'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

class FakeRenderer implements PdfRenderer {
  async render(): Promise<Buffer> {
    return Buffer.from('%PDF-1.7\n%%EOF\n')
  }
  async close() {}
}

const bodyOf = (html: unknown) => {
  const text = String(html)
  return text.slice(text.indexOf('<body>'))
}

let server: TestServer

beforeAll(async () => {
  server = await startServer()
  setPdfRenderer(server.deps, new FakeRenderer())
})
afterAll(async () => {
  await server?.close()
})

async function slidingQuote(company: string) {
  const ctx = await signup(server, { company })
  const sample = await sampleDesign(ctx.agent)
  const catalog = (await ctx.agent.get('/api/catalog')).body as Catalog
  const line = catalog.lines.find((l) => l.kind === 'sliding' && l.typologyIds.includes('sliding_4'))!
  const code = (id: string | undefined) => catalog.profiles.find((p) => p.id === id)!.code
  const frame = code(line.profiles.sliding_frame)
  const sash = code(line.profiles.sliding_sash)
  const design = createDesign('sliding_4', { lineId: line.id, width: 3000, height: 1500, colorId: line.colorIds[0] ?? sample.colorId, glassId: sample.glassId })
  const quote = await ctx.agent.post<Quote>('/api/quotes', { title: 'Casa Corredera', items: [item(design, { ref: 'V1' })] })
  expect(quote.status).toBe(201)
  return { ...ctx, quote: quote.body, frame, sash }
}

describe('cortes por tipo de pieza', () => {
  it('GET /api/quotes/:id/cuts/pdf arma los cortes sin crear OT', async () => {
    const { agent, quote } = await slidingQuote('Taller Sin OT')
    const pdf = await agent.request('GET', `/api/quotes/${quote.id}/cuts/pdf`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toContain('application/pdf')
    expect(pdf.headers.get('content-disposition')).toContain(`filename="Cotizacion-${quote.number}-Cortes-Casa-Corredera.pdf"`)
    const body = bodyOf((await agent.request('GET', `/api/quotes/${quote.id}/cuts/pdf?format=html`)).body)
    expect(body).toContain('data-document="cuts"')
    expect(body).toContain(`Cotización N° ${quote.number}`)
    expect(body).not.toContain('OT N°')
    const orders = await agent.get<{ items: WorkOrder[] }>(`/api/work-orders?quoteId=${quote.id}`)
    expect(orders.body.items).toEqual([])
    expect((await agent.request('GET', '/api/quotes/nope/cuts/pdf')).status).toBe(404)
  })

  it('?parts= filtra la cotización y la OT: solo hojas, sin marcos', async () => {
    const { agent, quote, frame, sash } = await slidingQuote('Taller Filtro')
    const html = async (url: string) => bodyOf((await agent.request('GET', url)).body)
    const all = await html(`/api/quotes/${quote.id}/cuts/pdf?format=html`)
    const sashes = await html(`/api/quotes/${quote.id}/cuts/pdf?format=html&parts=sash`)
    expect(all).toContain(frame)
    expect(all).toContain(sash)
    expect(sashes).toContain(sash)
    expect(sashes).not.toContain(frame)
    expect(sashes).toContain('Optimización de cortes · Hojas')

    const named = await agent.request('GET', `/api/quotes/${quote.id}/cuts/pdf?parts=sash,bead`)
    expect(named.headers.get('content-disposition')).toContain('Cortes-Hojas-Junquillos')

    const order = await agent.request('GET', `/api/quotes/${quote.id}/cuts/pdf?format=html&doc=cut-order&parts=frame`)
    const orderBody = bodyOf(order.body)
    expect(orderBody).toContain('data-document="cut-order"')
    expect(orderBody).toContain(frame)
    expect(orderBody).not.toContain(sash)

    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.id })
    expect(wo.status).toBe(201)
    const fromOrder = await html(`/api/work-orders/${wo.body.id}/pdf?doc=cuts&format=html&parts=sash`)
    expect(fromOrder).toContain(sash)
    expect(fromOrder).not.toContain(frame)
    // Lo que no se entiende se ignora: salen todos los cortes.
    expect(await html(`/api/work-orders/${wo.body.id}/pdf?doc=cuts&format=html&parts=nada`)).toContain(frame)
  })
})
