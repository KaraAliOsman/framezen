import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import type { Catalog } from '@dekopen/engine'
import type { CatalogColorsResponse, TextureCommitResponse, TexturePreviewResponse, TextureResolveResponse } from '@dekopen/shared'
import { subscriptions, aiUsage } from '../src/db/schema'
import { createMockAi } from '../src/services/ai/mock'
import { estimateGrain, seamScore, toLinear } from '../src/services/textures/image'
import { TextureRejected, processTexture, sanitizeTextureSource } from '../src/services/textures/pipeline'
import { TextureDraftStore } from '../src/services/textures/drafts'
import { signup, startServer, type TestServer } from './helpers'
import { softWoodImage, woodImage } from './texture-fixtures'

let server: TestServer
let woodJpeg: Buffer
let woodPng: Buffer

const rawSharp = (img: { width: number; height: number; data: Uint8Array }) => sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } })
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`

beforeAll(async () => {
  server = await startServer()
  woodJpeg = await rawSharp(woodImage(900, 700, 24)).jpeg({ quality: 90 }).toBuffer()
  woodPng = await rawSharp(woodImage(600, 600, 0, { seed: 3 })).png().toBuffer()
})
afterAll(async () => {
  await server.close()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function tileGrain(tile: Buffer) {
  const { data, info } = await sharp(tile).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const img = { width: info.width, height: info.height, data: new Uint8Array(data) }
  return { grain: estimateGrain(toLinear(img)), seam: seamScore(img), width: info.width, height: info.height }
}

describe('pipeline de texturas (sharp)', () => {
  it('limpia la foto: orientación EXIF aplicada, sin metadatos, sRGB y transparencia sobre blanco', async () => {
    const rotated = await rawSharp(woodImage(400, 300, 0)).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const src = await sanitizeTextureSource(rotated)
    expect([src.width, src.height]).toEqual([300, 400])
    expect(src.original).toMatchObject({ mime: 'image/jpeg', width: 300, height: 400 })
    const meta = await sharp(src.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation ?? 1).toBe(1)
    expect(meta.space).toBe('srgb')

    const transparent = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } }).png().toBuffer()
    const flat = await sanitizeTextureSource(transparent)
    const stats = await sharp(flat.bytes).stats()
    expect(stats.channels[0]!.mean).toBeGreaterThan(245)
  })

  it('una foto de madera con veta suave se clasifica como veta (no «Liso»)', async () => {
    const soft = await rawSharp(softWoodImage(800, 800)).jpeg({ quality: 88 }).toBuffer()
    const out = await processTexture(await sanitizeTextureSource(soft))
    expect(out.analysis.finishDetected).toBe('woodgrain')
    expect(out.finish).toBe('woodgrain')
    expect(out.scaleMm).toBe(900)
  })

  it('endereza la veta, entrega tesela continua de 512 px liviana y miniatura de 128', async () => {
    const out = await processTexture(await sanitizeTextureSource(woodJpeg))
    expect(out.analysis.grainAngleDeg).toBeGreaterThan(20)
    expect(out.analysis.grainAngleDeg).toBeLessThan(28)
    expect(out.analysis.autoRotated).toBe(true)
    expect(out.finish).toBe('woodgrain')
    expect(out.scaleMm).toBe(900)
    expect(out.tile.length).toBeLessThan(180 * 1024)
    const tile = await tileGrain(out.tile)
    expect([tile.width, tile.height]).toEqual([512, 512])
    expect(Math.abs(tile.grain.angleDeg)).toBeLessThan(3)
    expect(tile.seam).toBeLessThan(1.6)
    expect((await sharp(out.thumb).metadata()).width).toBe(128)
    expect((await sharp(out.before).metadata()).width).toBe(256)
    expect(out.hex).toMatch(/^#[0-9A-F]{6}$/)
    expect(out.analysis.palette.dark < out.analysis.palette.light).toBe(true)
  })

  it('respeta el giro manual, el acabado, la escala y el recorte pedidos', async () => {
    const src = await sanitizeTextureSource(woodPng)
    const turned = await processTexture(src, { rotationDeg: 90, finish: 'metallic', scaleMm: 450, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } })
    expect(turned.analysis.rotatedDeg).toBe(90)
    expect(turned.analysis.autoRotated).toBe(false)
    expect(turned.finish).toBe('metallic')
    expect(turned.scaleMm).toBe(450)
    expect(turned.analysis.crop).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })
    expect(Math.abs((await tileGrain(turned.tile)).grain.angleDeg)).toBeGreaterThan(80)
    const mirror = await processTexture(src, { seam: 'mirror' })
    expect(mirror.analysis.seam).toBe('mirror')
    expect((await tileGrain(mirror.tile)).seam).toBeLessThan(1.6)
  })

  it('rechaza lo que no es una foto válida, sin decodificar de más', async () => {
    const reason = async (bytes: Buffer) => {
      try {
        await sanitizeTextureSource(bytes)
        return 'ok'
      } catch (error) {
        return error instanceof TextureRejected ? error.reason : `otro: ${String(error)}`
      }
    }
    expect(await reason(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBe('format')
    expect(await reason(Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00'))).toBe('format')
    expect(await reason(Buffer.from('<html><script>fetch("/api/me")</script></html>'))).toBe('format')
    expect(await reason(Buffer.alloc(0))).toBe('format')
    // JPEG cortado por la mitad: no se acepta una foto incompleta.
    expect(await reason(woodJpeg.subarray(0, Math.floor(woodJpeg.length / 2)))).toBe('decode')
    // Bomba de descompresión: 25 MP que pesan pocos KB.
    const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer()
    expect(bomb.length).toBeLessThan(200_000)
    expect(await reason(bomb)).toBe('too_many_pixels')
    expect(await reason(await sharp({ create: { width: 40, height: 40, channels: 3, background: '#808080' } }).png().toBuffer())).toBe('too_small')
    expect(await reason(Buffer.alloc(10 * 1024 * 1024 + 1, 1))).toBe('too_large')
    // APNG (chunk acTL antes de IDAT) y WebP animado (bandera VP8X).
    const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#808080' } }).png().toBuffer()
    const actl = Buffer.alloc(20)
    actl.writeUInt32BE(8, 0)
    actl.write('acTL', 4, 'ascii')
    expect(await reason(Buffer.concat([png.subarray(0, 33), actl, png.subarray(33)]))).toBe('animated')
    const webp = Buffer.alloc(40)
    webp.write('RIFF', 0, 'ascii')
    webp.writeUInt32LE(32, 4)
    webp.write('WEBPVP8X', 8, 'ascii')
    webp.writeUInt32LE(10, 16)
    webp[20] = 0x02
    webp.writeUIntLE(199, 24, 3)
    webp.writeUIntLE(199, 27, 3)
    expect(await reason(webp)).toBe('animated')
  })

  it('un políglota (JPEG con HTML pegado al final) se recodifica y el agregado desaparece', async () => {
    const polyglot = Buffer.concat([woodJpeg, Buffer.from('<script>alert(document.cookie)</script>')])
    const src = await sanitizeTextureSource(polyglot)
    const out = await processTexture(src)
    for (const bytes of [src.bytes, out.tile, out.thumb, out.before]) expect(bytes.includes(Buffer.from('<script>'))).toBe(false)
  })

  it('borradores: solo la misma persona de la misma organización, con vencimiento', () => {
    let t = 0
    const store = new TextureDraftStore({ ttlMs: 1000, perUser: 2, now: () => t })
    const src = { bytes: Buffer.alloc(1), width: 1, height: 1, original: { mime: 'image/png' as const, width: 1, height: 1, byteSize: 1, sha256: 'x' } }
    const a = store.create({ orgId: 'o1', userId: 'u1', source: src })
    expect(store.get(a.id, 'o1', 'u1')).not.toBeNull()
    expect(store.get(a.id, 'o2', 'u1')).toBeNull()
    expect(store.get(a.id, 'o1', 'u2')).toBeNull()
    store.create({ orgId: 'o1', userId: 'u1', source: src })
    store.create({ orgId: 'o1', userId: 'u1', source: src })
    expect(store.get(a.id, 'o1', 'u1')).toBeNull() // el más viejo se descartó (máx. 2 por persona)
    const b = store.create({ orgId: 'o1', userId: 'u3', source: src })
    t = 5000
    expect(store.get(b.id, 'o1', 'u3')).toBeNull()
  })
})

describe('API /api/textures', () => {
  it('sube con vista previa, ajusta, guarda creando el color propio y lo deja en el catálogo', async () => {
    const { agent } = await signup(server)
    const preview = await agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/jpeg', woodJpeg), preview: true, name: 'Roble rústico' })
    expect(preview.status).toBe(200)
    expect(preview.body.draft.id).toMatch(/^txd_/)
    expect(preview.body.preview).toMatchObject({ finish: 'woodgrain', name: 'Roble rústico', scaleMm: 900, warnings: [] })
    expect(preview.body.preview.tileDataUrl).toMatch(/^data:image\/webp;base64,/)
    expect(preview.body.preview.analysis.autoRotated).toBe(true)
    // Nada guardado todavía.
    expect((await agent.get('/api/textures')).body.total).toBe(0)

    const adjusted = await agent.post<TexturePreviewResponse>(`/api/textures/drafts/${preview.body.draft.id}`, { rotationDeg: 0, scaleMm: 700 })
    expect(adjusted.status).toBe(200)
    expect(adjusted.body.preview).toMatchObject({ scaleMm: 700, analysis: { rotatedDeg: 0, autoRotated: false } })

    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const line = catalog.lines[0]!
    const commit = await agent.post<TextureCommitResponse>(`/api/textures/drafts/${preview.body.draft.id}/commit`, {
      scaleMm: 750,
      color: { lineIds: [line.id, 'linea-que-no-existe'], priceFactor: 1.1 },
    })
    expect(commit.status).toBe(201)
    const texture = commit.body.texture
    expect(texture).toMatchObject({ name: 'Roble rústico', mime: 'image/webp', width: 512, height: 512, meta: { finish: 'woodgrain', scaleMm: 750, seamless: true, pipelineRevision: 1 } })
    expect(texture.thumbId).toBeTruthy()
    expect(commit.body.color).toMatchObject({ id: 'custom-roble-rustico', name: 'Roble rústico', source: 'custom', lineIds: [line.id], priceFactor: 1.1, archived: false })
    expect(commit.body.color!.texture).toEqual({ kind: 'upload', assetId: texture.id, scaleMm: 750, finish: 'woodgrain' })
    // El borrador ya no existe.
    expect((await agent.post(`/api/textures/drafts/${preview.body.draft.id}`, {})).status).toBe(410)

    // El catálogo efectivo trae el color en su línea, con precio por factor y su textura.
    const after = (await agent.get<Catalog>('/api/catalog')).body
    expect(after.colors.find((c) => c.id === 'custom-roble-rustico')?.texture).toMatchObject({ kind: 'upload', assetId: texture.id })
    expect(after.lines.find((l) => l.id === line.id)!.colorIds).toContain('custom-roble-rustico')
    const ref = line.colorIds[0]!
    const priced = after.profiles.find((p) => p.lineId === line.id && p.role !== 'reinforcement' && (p.priceByColor[ref] ?? 0) > 0)
    if (priced) expect(priced.priceByColor['custom-roble-rustico']).toBe(Math.round(priced.priceByColor[ref]! * 1.1))

    // Lista, detalle con data URL, imagen con cabeceras seguras y caché, resolución en lote.
    const list = await agent.get('/api/textures')
    expect(list.body).toMatchObject({ total: 1, items: [{ id: texture.id }] })
    expect(list.body.builtin).toContain('golden_oak')
    const detail = await agent.get(`/api/textures/${texture.id}`)
    expect(detail.body.dataUrl).toMatch(/^data:image\/webp;base64,/)
    expect(detail.body.thumbDataUrl).toMatch(/^data:image\/webp;base64,/)
    const image = await agent.request('GET', `/api/textures/${texture.id}/image?variant=thumb`)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(image.headers.get('x-content-type-options')).toBe('nosniff')
    expect(image.headers.get('content-security-policy')).toMatch(/default-src 'none'/)
    const etag = (await agent.request('GET', `/api/textures/${texture.id}/image`)).headers.get('etag')!
    expect((await agent.request('GET', `/api/textures/${texture.id}/image`, undefined, { 'if-none-match': etag })).status).toBe(304)
    const resolved = await agent.get<TextureResolveResponse>(`/api/textures/resolve?ids=${texture.id},nada,${texture.thumbId}`)
    expect(Object.keys(resolved.body.textures)).toEqual([texture.id])
    expect(resolved.body.textures[texture.id]).toMatchObject({ name: 'Roble rústico', scaleMm: 750, finish: 'woodgrain' })

    // Cambios, borrado con deshacer (avisa colores afectados) y restauración.
    const renamed = await agent.patch(`/api/textures/${texture.id}`, { name: 'Roble del proveedor', angleDeg: 2.5, scaleMm: 820 })
    expect(renamed.body).toMatchObject({ name: 'Roble del proveedor', meta: { scaleMm: 820, angleDeg: 2.5 } })
    const removed = await agent.delete(`/api/textures/${texture.id}`)
    expect(removed.body).toEqual({ ok: true, colors: 1, undo: { method: 'POST', path: `/api/textures/${texture.id}/restore` } })
    expect((await agent.get(`/api/textures/${texture.id}`)).status).toBe(404)
    expect((await agent.post(`/api/textures/${texture.id}/restore`)).body).toMatchObject({ id: texture.id })
    expect((await agent.get('/api/textures')).body.total).toBe(1)

    // La actividad lo registra.
    const activity = await agent.get('/api/activity')
    const kinds = (activity.body.items ?? activity.body).map((e: { kind: string }) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['texture.uploaded', 'catalog.color_created', 'texture.deleted']))
  })

  it('subida directa (API/asistente): guarda de una vez y deduplica la misma foto', async () => {
    const { agent } = await signup(server)
    const first = await agent.post<TextureCommitResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng), finish: 'woodgrain' })
    expect(first.status).toBe(201)
    expect(first.body.duplicate).toBe(false)
    expect(first.body.texture.name).toBe('Madera media')
    const again = await agent.post<TextureCommitResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng), finish: 'woodgrain' })
    expect(again.body).toMatchObject({ duplicate: true, texture: { id: first.body.texture.id } })
  })

  it('archivos peligrosos o falsos: 4xx con motivo, nunca un 500', async () => {
    const { agent } = await signup(server)
    const svg = await agent.post('/api/textures', { dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` })
    expect(svg.status).toBe(400)
    const html = await agent.post('/api/textures', { dataUrl: dataUrl('image/png', Buffer.from('<html><body><script>alert(1)</script></body></html>')) })
    expect(html.status).toBe(415)
    expect(html.body).toMatchObject({ error: { code: 'asset_unsupported' }, reason: 'format' })
    // Extensión/tipo equivocado: manda el contenido (un JPEG declarado PNG se procesa como JPEG).
    const wrong = await agent.post<TextureCommitResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodJpeg) })
    expect(wrong.status).toBe(201)
    expect(wrong.body.texture.meta.source).toMatchObject({ mime: 'image/jpeg' })
    const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer()
    const big = await agent.post('/api/textures', { dataUrl: dataUrl('image/png', bomb) })
    expect(big.status).toBe(413)
    expect(big.body).toMatchObject({ error: { code: 'asset_too_large' }, reason: 'too_many_pixels' })
    // Un cuerpo de más de 15 MB se corta mientras llega.
    const huge = await agent.request('POST', '/api/textures', `{"dataUrl":"data:image/png;base64,${'A'.repeat(16 * 1024 * 1024)}"}`, { 'content-type': 'application/json' })
    expect(huge.status).toBe(413)
    // Sin JSON (formulario de otro sitio): rechazado.
    expect((await agent.request('POST', '/api/textures', 'dataUrl=x', { 'content-type': 'text/plain' })).status).toBe(415)
  })

  it('aísla organizaciones: texturas, borradores y colores ajenos no existen', async () => {
    const a = await signup(server)
    const b = await signup(server)
    const preview = await a.agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng), preview: true })
    const commit = await a.agent.post<TextureCommitResponse>(`/api/textures/drafts/${preview.body.draft.id}/commit`, {})
    const id = commit.body.texture.id
    const preview2 = await a.agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/jpeg', woodJpeg), preview: true })

    expect((await b.agent.get(`/api/textures/${id}`)).status).toBe(404)
    expect((await b.agent.request('GET', `/api/textures/${id}/image`)).status).toBe(404)
    expect((await b.agent.patch(`/api/textures/${id}`, { name: 'mío' })).status).toBe(404)
    expect((await b.agent.delete(`/api/textures/${id}`)).status).toBe(404)
    expect((await b.agent.post(`/api/textures/${id}/restore`)).status).toBe(404)
    expect((await b.agent.get<TextureResolveResponse>(`/api/textures/resolve?ids=${id}`)).body.textures).toEqual({})
    expect((await b.agent.get('/api/textures')).body.total).toBe(0)
    expect((await b.agent.post(`/api/textures/drafts/${preview2.body.draft.id}`, {})).status).toBe(410)
    expect((await b.agent.post(`/api/textures/drafts/${preview2.body.draft.id}/commit`, {})).status).toBe(410)
    const stolen = await b.agent.post('/api/catalog/colors', { name: 'Robado', hex: '#996633', texture: { kind: 'upload', assetId: id } })
    expect(stolen.status).toBe(400)
    expect(stolen.body.error.field).toBe('texture')
    expect((await server.agent().get('/api/textures')).status).toBe(401)
  })

  it('plan sin texturas propias: 402 al subir (límite suave), lo ya subido sigue disponible', async () => {
    const { agent, me } = await signup(server)
    const saved = await agent.post<TextureCommitResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng) })
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    const blocked = await agent.post('/api/textures', { dataUrl: dataUrl('image/png', woodPng), preview: true })
    expect(blocked.status).toBe(402)
    expect(blocked.body).toMatchObject({ error: { code: 'plan_required' }, feature: 'texture_upload', plan: 'pro', upgrade: '/ajustes/plan' })
    expect((await agent.get('/api/textures')).body.total).toBe(1)
    expect((await agent.get(`/api/textures/${saved.body.texture.id}`)).status).toBe(200)
    expect((await agent.patch(`/api/textures/${saved.body.texture.id}`, { name: 'Sigue siendo mía' })).status).toBe(200)
    // Los colores propios son de todos los planes.
    expect((await agent.post('/api/catalog/colors', { name: 'Verde musgo', hex: '#4A5D3A' })).status).toBe(201)
  })

  it('IA de visión opcional: nombra en el idioma de la persona, cobra créditos y nunca rompe la subida', async () => {
    const { agent, me } = await signup(server)
    vi.stubEnv('AI_API_KEY', 'sk-texturas-prueba')
    vi.stubEnv('AI_BASE_URL', 'https://proveedor.mock/v1')
    vi.stubEnv('AI_MODEL', 'modelo-simulado')
    const mock = createMockAi([
      { json: true, content: JSON.stringify({ name: 'Roble miel <b>rústico</b>', finish: 'woodgrain', scaleMm: 850, confidence: 0.8, similar: ['golden_oak', 'no_existe'] }), usage: { prompt_tokens: 1200, completion_tokens: 60 } },
      { json: true, content: 'esto no es JSON' },
    ])
    vi.stubGlobal('fetch', mock.fetch)
    const preview = await agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/jpeg', woodJpeg), preview: true, useAi: true }, { 'accept-language': 'en-US' })
    expect(preview.status).toBe(200)
    expect(preview.body.creditsUsed).toBeGreaterThan(0)
    expect(preview.body.preview.ai).toMatchObject({ name: 'Roble miel brústico/b', finish: 'woodgrain', scaleMm: 850, similarBuiltin: ['golden_oak'] })
    expect(preview.body.preview.name).toBe('Roble miel brústico/b')
    const sent = mock.requests[0]!.body
    expect(sent.thinking).toEqual({ type: 'disabled' })
    expect(JSON.stringify(sent.messages)).toContain('English')
    expect(JSON.stringify(sent.messages)).toMatch(/data:image\/webp;base64,/)
    // Ajustar no vuelve a cobrar.
    const adjusted = await agent.post<TexturePreviewResponse>(`/api/textures/drafts/${preview.body.draft.id}`, { useAi: true, scaleMm: 800 })
    expect(adjusted.body.creditsUsed).toBe(0)
    expect(mock.requests).toHaveLength(1)
    // Respuesta inválida de la IA: aviso suave, sin cobro, la subida sigue.
    const usageBefore = await server.deps.db.select().from(aiUsage).where(eq(aiUsage.orgId, me.org.id))
    const bad = await agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng), preview: true, useAi: true })
    expect(bad.status).toBe(200)
    expect(bad.body.preview.warnings).toContain('ai_failed')
    expect(bad.body.creditsUsed).toBe(0)
    expect(await server.deps.db.select().from(aiUsage).where(eq(aiUsage.orgId, me.org.id))).toHaveLength(usageBefore.length)
    // Plan sin IA: ni siquiera se consulta.
    await server.deps.db.update(subscriptions).set({ plan: 'taller', status: 'active' }).where(eq(subscriptions.orgId, me.org.id))
    expect(mock.remaining()).toBe(0)
  })

  it('sin clave de IA: aviso «no disponible» y nombre descriptivo', async () => {
    const { agent } = await signup(server)
    const res = await agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/png', woodPng), preview: true, useAi: true }, { 'accept-language': 'de-DE' })
    expect(res.body.preview.warnings).toContain('ai_unavailable')
    expect(res.body.preview.name).toBe('Holz mittel')
  })
})

describe('API /api/catalog/colors', () => {
  it('crea, edita, archiva con deshacer y pone texturas propias a colores base', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const line = catalog.lines[0]!
    const baseColor = catalog.colors.find((c) => line.colorIds.includes(c.id))!
    const created = await agent.post('/api/catalog/colors', {
      name: baseColor.name,
      hex: '#8a5a2b',
      code: 'RB',
      texture: { kind: 'builtin', id: 'golden_oak', scaleMm: 900 },
      lineIds: [line.id],
      priceFactor: 1.2,
      priceBaseColorId: baseColor.id,
    })
    expect(created.status).toBe(201)
    const id = created.body.color.id as string
    expect(id.startsWith('custom-')).toBe(true)
    expect(catalog.colors.some((c) => c.id === id)).toBe(false)
    expect(created.body.color).toMatchObject({ hex: '#8A5A2B', code: 'RB', lineIds: [line.id], priceFactor: 1.2, priceBaseColorId: baseColor.id })

    // Mismo nombre otra vez: otro id, sin choques.
    const twin = await agent.post('/api/catalog/colors', { name: baseColor.name, hex: '#8A5A2B' })
    expect(twin.body.color.id).not.toBe(id)

    const patched = await agent.patch(`/api/catalog/colors/${id}`, { name: 'Roble del taller', priceFactor: null, code: null, lineIds: [] })
    expect(patched.status).toBe(200)
    expect(patched.body.color).toMatchObject({ name: 'Roble del taller', lineIds: [] })
    expect(patched.body.color.priceFactor).toBeUndefined()
    expect(patched.body.color.code).toBeUndefined()
    expect((await agent.patch(`/api/catalog/colors/${id}`, { priceBaseColorId: 'no-existe' })).status).toBe(400)

    const archived = await agent.delete(`/api/catalog/colors/${id}`)
    expect(archived.body).toMatchObject({ color: { archived: true }, undo: { method: 'POST', path: `/api/catalog/colors/${id}/restore` } })
    const list = await agent.get<CatalogColorsResponse>('/api/catalog/colors')
    expect(list.body.items.find((c) => c.id === id)).toMatchObject({ archived: true })
    // Archivado: sigue en el catálogo (cotizaciones viejas) pero no en las líneas.
    const effective = (await agent.get<Catalog>('/api/catalog')).body
    expect(effective.colors.some((c) => c.id === id)).toBe(true)
    expect(effective.lines.some((l) => l.colorIds.includes(id))).toBe(false)
    expect((await agent.post(`/api/catalog/colors/${id}/restore`)).body.color.archived).toBe(false)

    // Colores base: solo la textura.
    const texture = await agent.patch(`/api/catalog/colors/${baseColor.id}`, { texture: { kind: 'builtin', id: 'nut_tree' } })
    expect(texture.status).toBe(200)
    expect(texture.body.color).toMatchObject({ source: 'base', textureOverridden: true, texture: { kind: 'builtin', id: 'nut_tree' } })
    expect((await agent.get<CatalogColorsResponse>('/api/catalog/colors')).body.overrides[baseColor.id]).toEqual({ kind: 'builtin', id: 'nut_tree' })
    expect((await agent.get<Catalog>('/api/catalog')).body.colors.find((c) => c.id === baseColor.id)!.texture).toEqual({ kind: 'builtin', id: 'nut_tree' })
    expect((await agent.patch(`/api/catalog/colors/${baseColor.id}`, { name: 'Otro nombre' })).status).toBe(400)
    expect((await agent.delete(`/api/catalog/colors/${baseColor.id}`)).status).toBe(400)
    const back = await agent.patch(`/api/catalog/colors/${baseColor.id}`, { texture: null })
    expect(back.body.color.textureOverridden).toBe(false)
    expect((await agent.patch('/api/catalog/colors/no-existe', { texture: null })).status).toBe(404)

    // Validación estricta (claves desconocidas, hex inválido, textura integrada inexistente).
    expect((await agent.post('/api/catalog/colors', { name: 'X', hex: 'rojo' })).status).toBe(400)
    expect((await agent.post('/api/catalog/colors', { name: 'X', hex: '#112233', price: 1 })).status).toBe(400)
    expect((await agent.post('/api/catalog/colors', { name: 'X', hex: '#112233', texture: { kind: 'builtin', id: 'madera_falsa' } })).status).toBe(400)
  })

  it('el PDF de una cotización con un color de textura propia lleva la tesela en línea, una sola vez (sin red)', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const settings = (await agent.get('/api/settings')).body
    const line = catalog.lines.find((l) => l.id === settings.defaults.lineId) ?? catalog.lines[0]!
    const preview = await agent.post<TexturePreviewResponse>('/api/textures', { dataUrl: dataUrl('image/jpeg', woodJpeg), preview: true, name: 'Roble del proveedor' })
    const commit = await agent.post<TextureCommitResponse>(`/api/textures/drafts/${preview.body.draft.id}/commit`, { color: { lineIds: [line.id] } })
    const colorId = commit.body.color!.id
    const tile = (await agent.get<TextureResolveResponse>(`/api/textures/resolve?ids=${commit.body.texture.id}`)).body.textures[commit.body.texture.id]!.dataUrl
    const design = (id: string, ref: string) => ({
      version: 1,
      lineId: line.id,
      width: 1200,
      height: 1000,
      colorId: id,
      glassId: settings.defaults.glassId ?? catalog.glass[0]!.id,
      root: { id: 'root', type: 'leaf', opening: { kind: 'fixed' } },
      ref,
    })
    const quote = await agent.post('/api/quotes', { title: 'Con foliado propio', items: [{ ref: 'V1', qty: 1, design: design(colorId, 'a') }, { ref: 'V2', qty: 2, design: design(colorId, 'b') }] })
    expect(quote.status).toBe(201)
    const html = await agent.request('GET', `/api/quotes/${quote.body.id}/pdf?format=html`)
    expect(html.status).toBe(200)
    const text = typeof html.body === 'string' ? html.body : JSON.stringify(html.body)
    // La tesela viaja como data URL, una sola vez aunque haya varios dibujos, y nunca por URL remota.
    expect(text.split(tile).length - 1).toBe(1)
    expect(text).not.toContain(`/api/textures/${commit.body.texture.id}`)
    // Una sola `<image>` compartida por todas las piezas: un `<pattern>` se rasteriza en el PDF.
    expect(text).toContain('<image')
    expect(text).not.toContain('<pattern')
  })

  it('un borrador con el color propio cotiza con el precio por factor', async () => {
    const { agent } = await signup(server)
    const catalog = (await agent.get<Catalog>('/api/catalog')).body
    const settings = (await agent.get('/api/settings')).body
    const line = catalog.lines.find((l) => l.id === settings.defaults.lineId) ?? catalog.lines[0]!
    const ref = line.colorIds[0]!
    const color = await agent.post('/api/catalog/colors', { name: 'Foliado premium', hex: '#6B4A2F', lineIds: [line.id], priceFactor: 1.5, priceBaseColorId: ref })
    const design = (colorId: string) => ({
      version: 1,
      lineId: line.id,
      width: 1200,
      height: 1000,
      colorId,
      glassId: settings.defaults.glassId ?? catalog.glass[0]!.id,
      root: { id: 'root', type: 'leaf', opening: { kind: 'fixed' } },
    })
    const plain = await agent.post('/api/quotes', { title: 'Base', items: [{ ref: 'V1', qty: 1, design: design(ref) }] })
    const custom = await agent.post('/api/quotes', { title: 'Propio', items: [{ ref: 'V1', qty: 1, design: design(color.body.color.id) }] })
    expect(plain.status).toBe(201)
    expect(custom.status).toBe(201)
    expect(custom.body.totals.total).toBeGreaterThan(plain.body.totals.total)
  })
})
