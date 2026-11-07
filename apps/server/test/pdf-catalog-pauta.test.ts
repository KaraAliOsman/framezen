import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Catalog, Line } from '@dekopen/engine'
import type { Quote } from '@dekopen/shared'
import { applyLineOverride, buildEffectiveCatalog, type OrgCatalogState } from '../src/services/catalog'
import { setPdfRenderer } from '../src/services/pdf'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer
const htmls: string[] = []

beforeAll(async () => {
  server = await startServer()
  setPdfRenderer(server.deps, {
    render: async (html) => {
      htmls.push(html)
      return Buffer.from('%PDF-1.7')
    },
    close: async () => {},
  })
})
afterAll(async () => {
  await server?.close()
})

type LinePatchResponse = { line: Line & { factory?: { pauta: Line['pauta'] } }; override: Record<string, unknown> | null; factory: { pauta: Line['pauta'] }; updatedAt: string }

describe('pauta propia por línea (override de la organización)', () => {
  it('applyLineOverride mezcla por campo y refuerzo, y guarda la de fábrica', () => {
    const line = { id: 'l', pauta: { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20, reinforcement: { frame: 114, sash: 146 } } } as Line
    expect(applyLineOverride(line, undefined)).toBe(line)
    expect(applyLineOverride(line, {})).toBe(line)
    const next = applyLineOverride(line, { pauta: { weld: 2.5, reinforcement: { sash: 140 } }, doorPauta: { sashWidth: 110 } })
    expect(next.pauta).toMatchObject({ weld: 2.5, frameDeduction: 44, reinforcement: { frame: 114, sash: 140 } })
    expect(next.doorPauta).toEqual({ sashWidth: 110 })
    expect(next.factory?.pauta.weld).toBe(3)
    // El catálogo efectivo lo aplica.
    const base = { colors: [], brands: [], lines: [line], profiles: [], items: [], glass: [], brandSettings: [] } as Catalog
    const state: OrgCatalogState = { enabledBrandIds: [], brandSettings: [], priceOverrides: [], custom: { lines: { l: { pauta: { weld: 2 } } } } as never, updatedAt: new Date() }
    expect(buildEffectiveCatalog(base, state, { onlyEnabled: false }).lines[0].pauta.weld).toBe(2)
  })

  it('PATCH /api/catalog/lines/:id ajusta, cambia los cortes y vuelve a la de fábrica', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent, { width: 1200, height: 1000 })
    const quote = await agent.post<Quote>('/api/quotes', { title: 'Obra pauta', items: [item(design)] })
    const before = quote.body.totals!.total

    const lineId = design.lineId
    const res = await agent.patch<LinePatchResponse>(`/api/catalog/lines/${encodeURIComponent(lineId)}`, {
      pauta: { frameDeduction: 30, weld: 2.5, reinforcement: { frame: 100 } },
      doorPauta: { sashWidth: 112 },
    })
    expect(res.status).toBe(200)
    expect(res.body.line.pauta).toMatchObject({ frameDeduction: 30, weld: 2.5 })
    expect(res.body.line.pauta.reinforcement?.frame).toBe(100)
    expect(res.body.line.doorPauta?.sashWidth).toBe(112)
    expect(res.body.override).toMatchObject({ pauta: { frameDeduction: 30, weld: 2.5, reinforcement: { frame: 100 } }, doorPauta: { sashWidth: 112 } })
    const factory = res.body.factory.pauta

    // El catálogo efectivo (GET /api/catalog) ya trae la pauta ajustada y la original.
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const effective = catalog.lines.find((l) => l.id === lineId) as Line & { factory?: { pauta: Line['pauta'] } }
    expect(effective.pauta.frameDeduction).toBe(30)
    expect(effective.factory?.pauta.frameDeduction).toBe(factory.frameDeduction)

    // El motor del servidor usa la pauta nueva al guardar.
    const saved = await agent.put<Quote>(`/api/quotes/${quote.body.id}`, { version: quote.body.version, title: 'Obra pauta (recalculada)' })
    expect(saved.status).toBe(200)
    expect(saved.body.totals!.total).not.toBe(before)

    // Un campo en null vuelve a la de fábrica; un valor igual al de fábrica no se guarda.
    const partial = await agent.patch<LinePatchResponse>(`/api/catalog/lines/${encodeURIComponent(lineId)}`, { pauta: { weld: null, frameDeduction: factory.frameDeduction } })
    expect(partial.body.override).toMatchObject({ pauta: { reinforcement: { frame: 100 } } })
    expect((partial.body.override as { pauta: Record<string, unknown> }).pauta.weld).toBeUndefined()
    expect((partial.body.override as { pauta: Record<string, unknown> }).pauta.frameDeduction).toBeUndefined()

    // Todo en null: sin ajuste.
    const reset = await agent.patch<LinePatchResponse>(`/api/catalog/lines/${encodeURIComponent(lineId)}`, { pauta: null, doorPauta: null })
    expect(reset.body.override).toBeNull()
    expect(reset.body.line.factory).toBeUndefined()
    expect(reset.body.line.pauta).toEqual(factory)
    const after = await agent.put<Quote>(`/api/quotes/${quote.body.id}`, { version: saved.body.version, title: 'Obra pauta' })
    expect(after.body.totals!.total).toBe(before)

    const activity = await agent.get('/api/activity?kind=catalog.pauta_updated')
    const texts: string[] = activity.body.items.map((e: { text: string }) => e.text)
    expect(texts[0]).toMatch(/volvió a la pauta de fábrica de /)
    expect(texts[texts.length - 1]).toMatch(/ajustó la pauta y la pauta de puertas de /)
  })

  it('valida con mensajes claros y aísla entre empresas', async () => {
    const a = await signup(server)
    const b = await signup(server)
    const lineId = (await a.agent.get<Catalog>('/api/catalog')).body.lines[0].id
    const bad = await a.agent.patch(`/api/catalog/lines/${encodeURIComponent(lineId)}`, { pauta: { frameDeduction: -5 } })
    expect(bad.status).toBe(400)
    expect(bad.body.error.message).toMatch(/negativas/)
    const tooBig = await a.agent.patch(`/api/catalog/lines/${encodeURIComponent(lineId)}`, { pauta: { weld: 50 } })
    expect(tooBig.status).toBe(400)
    expect(tooBig.body.error.message).toMatch(/20 mm/)
    expect((await a.agent.patch('/api/catalog/lines/no-existe', { pauta: { weld: 2 } })).status).toBe(404)

    await a.agent.patch(`/api/catalog/lines/${encodeURIComponent(lineId)}`, { pauta: { weld: 1.5 } })
    const otherLine = (await b.agent.get<Catalog>('/api/catalog')).body.lines.find((l) => l.id === lineId)
    if (otherLine) expect(otherLine.pauta.weld).not.toBe(1.5)
  })

  it('el catálogo PDF refleja la pauta y precios propios', async () => {
    const { agent } = await signup(server, { company: 'Fábrica Austral' })
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const line = catalog.lines[0]
    expect((await agent.request('GET', `/api/catalog/pdf?lines=${encodeURIComponent(line.id)}&template=vitrina`)).status).toBe(200)
    const before = htmls[htmls.length - 1]
    await agent.patch(`/api/catalog/lines/${encodeURIComponent(line.id)}`, { pauta: { frameDeduction: 10 } })
    expect((await agent.request('GET', `/api/catalog/pdf?lines=${encodeURIComponent(line.id)}&template=vitrina`)).status).toBe(200)
    const after = htmls[htmls.length - 1]
    expect(after).toContain('fzd-catalog--vitrina')
    expect(after).toContain(line.name)
    // La pauta distinta cambia el dibujo (luz de vidrio) del folleto.
    expect(after).not.toBe(before)
  })
})
