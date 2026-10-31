/**
 * Con el catálogo real generado por el importador (.data/catalog/base.json, fuera del
 * repositorio). Si el archivo no existe, la prueba se omite.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Catalog } from '@framezen/engine'
import type { Quote } from '@framezen/shared'
import { bootstrap, type Bootstrapped } from '../src/bootstrap'
import { findRepoRoot } from '../src/config'
import { silentLogger } from '../src/lib/logger'
import { Agent, item, sampleDesign } from './helpers'

const source = join(findRepoRoot(), '.data/catalog/base.json')

describe.skipIf(!existsSync(source))('catálogo real (base.json)', () => {
  let boot: Bootstrapped

  beforeAll(async () => {
    boot = await bootstrap({ database: { memory: true }, logger: silentLogger, catalogSource: source, mailer: { send: async () => {} } })
  })
  afterAll(async () => {
    await boot?.database.close()
  })

  it('siembra desde el archivo, activa 3 marcas y cotiza con precio', async () => {
    const base = await boot.deps.catalogs.getBase()
    expect(base.source).toBe(`file:${source}`)
    expect(base.data.brands.length).toBeGreaterThan(3)

    const agent = new Agent(boot.app)
    const signup = await agent.post('/api/auth/signup', { name: 'Ana', email: 'ana@real.cl', password: 'clave-segura-123', company: 'Taller Real' })
    expect(signup.status).toBe(201)
    const brands = (await agent.get('/api/catalog/brands')).body
    expect(brands.items.filter((b: { enabled: boolean }) => b.enabled)).toHaveLength(3)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    expect(catalog.lines.length).toBeGreaterThan(0)
    expect(catalog.lines.length).toBeLessThan(base.data.lines.length)

    const design = await sampleDesign(agent, { width: 1500, height: 1200 })
    const quote = await agent.post<Quote>('/api/quotes', { items: [item(design)] })
    expect(quote.status).toBe(201)
    expect(quote.body.totals!.total).toBeGreaterThan(0)
  })
})
