import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Catalog, Profile } from '@dekopen/engine'
import type { Quote } from '@dekopen/shared'
import { item, sampleDesign, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})

const pricedProfile = (catalog: Catalog): { profile: Profile; colorId: string } => {
  for (const profile of catalog.profiles) {
    const colorId = Object.keys(profile.priceByColor).find((c) => profile.priceByColor[c] > 0)
    if (colorId) return { profile, colorId }
  }
  const profile = catalog.profiles[0]
  return { profile, colorId: catalog.lines.find((l) => l.id === profile.lineId)!.colorIds[0] }
}

describe('catálogo de la organización', () => {
  it('muestra sólo las marcas activas y permite activar otra', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog & { updatedAt: string }>('/api/catalog')).body
    expect(catalog.updatedAt).toBeTruthy()
    const brands = (await agent.get('/api/catalog/brands')).body
    const enabled = new Set(brands.items.filter((b: { enabled: boolean }) => b.enabled).map((b: { brand: { id: string } }) => b.brand.id))
    expect(catalog.lines.length).toBeGreaterThan(0)
    for (const line of catalog.lines) expect(enabled.has(line.brandId)).toBe(true)
    expect(brands.items[0].counts).toBeDefined()

    const disabled = brands.items.find((b: { enabled: boolean; counts: { lines: number } }) => !b.enabled && b.counts.lines > 0)
    if (disabled) {
      const res = await agent.patch(`/api/catalog/brands/${disabled.brand.id}`, { enabled: true, settings: { discounts: { profiles: 12 }, kerf: 3 } })
      expect(res.status).toBe(200)
      expect(res.body.enabled).toBe(true)
      expect(res.body.settings.discounts.profiles).toBe(12)
      expect(res.body.settings.kerf).toBe(3)
      const after = (await agent.get<Catalog>('/api/catalog')).body
      expect(after.lines.some((l) => l.brandId === disabled.brand.id)).toBe(true)
      expect(after.brandSettings.find((s) => s.brandId === disabled.brand.id)?.discounts.profiles).toBe(12)
      await agent.patch(`/api/catalog/brands/${disabled.brand.id}`, { enabled: false })
      expect((await agent.get<Catalog>('/api/catalog')).body.lines.some((l) => l.brandId === disabled.brand.id)).toBe(false)
    }
    expect((await agent.patch('/api/catalog/brands/no-existe', { enabled: true })).status).toBe(404)
  })

  it('aplica precios propios por color y los puede quitar', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const { profile, colorId } = pricedProfile(catalog)
    const original = profile.priceByColor[colorId]
    const glass = catalog.glass[0]

    const put = await agent.put('/api/catalog/prices', {
      overrides: [
        { kind: 'profile', id: profile.id, colorId, price: 98_765 },
        { kind: 'glass', id: glass.id, price: 43_210 },
        { kind: 'item', id: 'no-existe', price: 1 },
      ],
    })
    expect(put.status).toBe(200)
    expect(put.body.overrides).toHaveLength(2)
    expect(put.body.ignored).toBe(1)

    const after = (await agent.get<Catalog>('/api/catalog')).body
    expect(after.profiles.find((p) => p.id === profile.id)!.priceByColor[colorId]).toBe(98_765)
    expect(after.glass.find((g) => g.id === glass.id)!.pricePerM2).toBe(43_210)

    // Otra organización no ve esos precios.
    const other = await signup(server)
    const otherCatalog = (await other.agent.get<Catalog>('/api/catalog')).body
    const otherProfile = otherCatalog.profiles.find((p) => p.id === profile.id)
    if (otherProfile) expect(otherProfile.priceByColor[colorId]).toBe(original)

    const removed = await agent.put('/api/catalog/prices', { remove: [{ kind: 'profile', id: profile.id, colorId }] })
    expect(removed.body.overrides).toHaveLength(1)
    const reverted = (await agent.get<Catalog>('/api/catalog')).body
    expect(reverted.profiles.find((p) => p.id === profile.id)!.priceByColor[colorId]).toBe(original)
    expect((await agent.get('/api/catalog/prices')).body.overrides).toHaveLength(1)
  })

  it('los precios propios cambian los totales de las cotizaciones', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent, { width: 1500, height: 1200 })
    const quote = await agent.post<Quote>('/api/quotes', { items: [item(design)] })
    const before = quote.body.totals!.total
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const glass = catalog.glass.find((g) => g.id === design.glassId)!
    await agent.put('/api/catalog/prices', { overrides: [{ kind: 'glass', id: glass.id, price: glass.pricePerM2 * 3 + 50_000 }] })
    // El borrador guardado queda al día sin abrirlo (lista, Inicio y ficha del cliente) y sin
    // cambiar de versión (no choca con el autoguardado de un editor abierto).
    const repriced = await agent.get<Quote>(`/api/quotes/${quote.body.id}`)
    expect(repriced.body.totals!.total).toBeGreaterThan(before)
    expect(repriced.body.version).toBe(quote.body.version)
    expect(repriced.body.updatedAt).toBe(quote.body.updatedAt)
    const row = (await agent.get('/api/quotes')).body.items.find((q: { id: string }) => q.id === quote.body.id)
    expect(row.total).toBe(repriced.body.totals!.total)
    const saved = await agent.put<Quote>(`/api/quotes/${quote.body.id}`, { version: quote.body.version, title: 'Recalcular' })
    expect(saved.status).toBe(200)
    expect(saved.body.totals!.total).toBe(repriced.body.totals!.total)
  })

  it('el área mínima de un vidrio y la pauta propia también ponen al día los borradores', async () => {
    const { agent } = await signup(server)
    const design = await sampleDesign(agent, { width: 400, height: 400 })
    const quote = await agent.post<Quote>('/api/quotes', { items: [item(design)] })
    const before = quote.body.totals!.total
    const glassRes = await agent.patch(`/api/catalog/glass/${design.glassId}`, { minArea: 5 })
    expect(glassRes.status).toBe(200)
    const afterGlass = (await agent.get<Quote>(`/api/quotes/${quote.body.id}`)).body.totals!.total
    expect(afterGlass).toBeGreaterThan(before)
    // Vuelve a la de fábrica: vuelve el precio de antes.
    await agent.patch(`/api/catalog/glass/${design.glassId}`, { minArea: null })
    expect((await agent.get<Quote>(`/api/quotes/${quote.body.id}`)).body.totals!.total).toBe(before)
  })

  it('importa un CSV «MisPrecios» como precios propios', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const { profile, colorId } = pricedProfile(catalog)
    const line = catalog.lines.find((l) => l.id === profile.lineId)!
    const brand = catalog.brands.find((b) => b.id === line.brandId)!
    const color = catalog.colors.find((c) => c.id === colorId)!
    const hardware = catalog.items.find((i) => i.code && i.brandId === brand.id) ?? catalog.items.find((i) => i.code)!
    const hardwareBrand = catalog.brands.find((b) => b.id === hardware.brandId)!

    const csv =
      '﻿ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
      `1;${brand.name};Perfil · Marco;${profile.code};${profile.name};${line.name};${color.name};$;CLP;45678,50\r\n` +
      `2;${hardwareBrand.name};Herraje · Manilla;${hardware.code};${hardware.name};;;$;CLP;12345,00\r\n` +
      `3;${brand.name};Herraje · Otro;ZZ-NO-EXISTE-999;Pieza que no está;;;$;CLP;999,00\r\n` +
      `4;${brand.name};Herraje · Otro;${hardware.code};${hardware.name};;;$;CLP;0,00\r\n`

    const res = await agent.post('/api/catalog/import-csv', csv, { 'content-type': 'text/csv; charset=utf-8' })
    expect(res.status).toBe(200)
    expect(res.body.rows).toBe(4)
    expect(res.body.matched).toBe(2)
    expect(res.body.unmatched).toBe(1)
    expect(res.body.skipped).toBe(1)
    expect(res.body.unmatchedSample[0].code).toBe('ZZ-NO-EXISTE-999')
    expect(res.body.message).toMatch(/actualizamos 2 precios/)

    const after = (await agent.get<Catalog>('/api/catalog')).body
    expect(after.profiles.find((p) => p.id === profile.id)!.priceByColor[colorId]).toBe(45_679)
    expect(after.items.find((i) => i.id === hardware.id)!.price).toBe(12_345)

    // También acepta JSON { csv }.
    const json = await agent.post('/api/catalog/import-csv', { csv })
    expect(json.status).toBe(200)
    const empty = await agent.post('/api/catalog/import-csv', 'nada útil aquí', { 'content-type': 'text/plain' })
    expect(empty.status).toBe(400)
  })
})
