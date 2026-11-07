/**
 * Revisión adversarial de documentos (PDF/HTML), plantillas y portal (v5).
 * Cada prueba fija un problema real encontrado en la revisión de seguridad.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Quote, WorkOrder } from '@dekopen/shared'
import { setPdfRenderer, type PdfRenderer } from '../src/services/pdf'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

class FakeRenderer implements PdfRenderer {
  htmls: string[] = []
  async render(html: string): Promise<Buffer> {
    this.htmls.push(html)
    return Buffer.from('%PDF-1.7\n%%EOF\n')
  }
  async close() {}
  get last(): string {
    return this.htmls[this.htmls.length - 1] ?? ''
  }
}

const bodyOf = (html: string) => html.slice(html.indexOf('<body>'))

let server: TestServer
let renderer: FakeRenderer

beforeAll(async () => {
  server = await startServer()
  renderer = new FakeRenderer()
  setPdfRenderer(server.deps, renderer)
})
afterAll(async () => {
  await server?.close()
})

const PAYLOAD = '</style><img src=x onerror=alert(1)><style>'

describe('documentos de taller: el pie de página va dentro de <style> y no puede cerrarlo', () => {
  it('un título de obra con </style> no inyecta HTML en el PDF ni en ?format=html', async () => {
    const { agent } = await signup(server, { company: `Taller ${PAYLOAD}` })
    const design = await sampleDesign(agent)
    const quote = await agent.post<Quote>('/api/quotes', { title: `Obra ${PAYLOAD}`, items: [item(design, { ref: 'V1' })] })
    expect(quote.status).toBe(201)
    const wo = await agent.post<WorkOrder>('/api/work-orders', { quoteId: quote.body.id })
    expect(wo.status).toBe(201)

    for (const doc of ['work-order', 'cuts', 'materials', 'glass', 'purchase', 'assembly', 'costs']) {
      const pdf = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=${doc}`)
      expect(pdf.status, doc).toBe(200)
      const body = bodyOf(renderer.last)
      expect(body, doc).not.toContain('<img src=x')
      expect(body, doc).not.toMatch(/<\/style>\s*<img/i)

      const html = await agent.request('GET', `/api/work-orders/${wo.body.id}/pdf?doc=${doc}&format=html`)
      expect(html.status, doc).toBe(200)
      expect(bodyOf(String(html.body)), doc).not.toContain('<img src=x')
    }
  })
})

describe('plantillas: el tope por tipo también vale al restaurar', () => {
  it('borrar → crear → restaurar no permite pasar de MAX_TEMPLATES_PER_KIND', async () => {
    const { agent, me } = await signup(server)
    const { MAX_TEMPLATES_PER_KIND, insertTemplate } = await import('../src/services/templates')
    const { getDocPreset } = await import('@dekopen/shared')
    for (let i = 0; i < MAX_TEMPLATES_PER_KIND - 1; i++) {
      await insertTemplate(server.deps.db, { orgId: me.org.id, userId: me.user.id, template: { ...getDocPreset('hogar'), name: `T${i}` }, now: new Date() })
    }
    const last = await agent.post<{ id: string }>('/api/templates', { kind: 'quote', fromPresetId: 'hogar' })
    expect(last.status).toBe(201)
    expect((await agent.post('/api/templates', { kind: 'quote', fromPresetId: 'hogar' })).status).toBe(400)
    expect((await agent.delete(`/api/templates/${last.body.id}`)).status).toBe(200)
    expect((await agent.post('/api/templates', { kind: 'quote', fromPresetId: 'hogar' })).status).toBe(201)
    const restored = await agent.post(`/api/templates/${last.body.id}/restore`, {})
    expect(restored.status).toBe(400)
    expect(restored.body.error.code).toBe('too_many')
    const list = await agent.get<{ templates: unknown[] }>('/api/templates?kind=quote')
    expect(list.body.templates.length).toBeLessThanOrEqual(MAX_TEMPLATES_PER_KIND)
  })
})
