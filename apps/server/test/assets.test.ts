import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createDatabase, type Database } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { orgs, users } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { AssetStore, assetHttpHeaders, decodeImageDataUrl, sniffImage, toDataUrl } from '../src/services/assets'

let database: Database
let store: AssetStore
let png: Buffer
let jpeg: Buffer
let webp: Buffer

beforeAll(async () => {
  database = await createDatabase({ memory: true })
  await runMigrations(database.db)
  store = new AssetStore(database.db, { limits: { maxOrgBytes: 200_000 } })
  const base = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 167, g: 107, b: 50 } } })
  png = await base.clone().png().toBuffer()
  jpeg = await base.clone().jpeg({ quality: 80 }).toBuffer()
  webp = await base.clone().webp({ quality: 80 }).toBuffer()
})
afterAll(async () => {
  await database.close()
})

async function seedOrg() {
  const orgId = newId()
  const userId = newId()
  await database.db.insert(orgs).values({ id: orgId, name: 'Taller' })
  await database.db.insert(users).values({ id: userId, email: `${userId}@t.cl`, name: 'Ana', passwordHash: 'x' })
  return { orgId, userId }
}

describe('detección de imágenes por bytes', () => {
  it('reconoce PNG, JPEG y WebP con sus dimensiones', () => {
    expect(sniffImage(png)).toEqual({ mime: 'image/png', width: 64, height: 48, animated: false })
    expect(sniffImage(jpeg)).toEqual({ mime: 'image/jpeg', width: 64, height: 48, animated: false })
    expect(sniffImage(webp)).toMatchObject({ mime: 'image/webp', width: 64, height: 48, animated: false })
  })

  it('rechaza SVG, GIF, HTML disfrazado y basura', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a\x01\x00\x01\x00'))).toBeNull()
    expect(sniffImage(Buffer.from('<html><body>hola</body></html>'))).toBeNull()
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(sniffImage(new Uint8Array(0))).toBeNull()
  })

  it('detecta WebP animado (VP8X con bandera de animación)', () => {
    const header = Buffer.alloc(30)
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(22, 4)
    header.write('WEBP', 8, 'ascii')
    header.write('VP8X', 12, 'ascii')
    header.writeUInt32LE(10, 16)
    header[20] = 0x02 // animación
    header.writeUIntLE(63, 24, 3)
    header.writeUIntLE(47, 27, 3)
    expect(sniffImage(header)).toEqual({ mime: 'image/webp', width: 64, height: 48, animated: true })
  })

  it('decodifica data URL sin confiar en el tipo declarado', () => {
    const decoded = decodeImageDataUrl(toDataUrl('image/png', png))!
    expect(decoded.declared).toBe('image/png')
    expect(decoded.bytes.equals(png)).toBe(true)
    expect(decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
    expect(decodeImageDataUrl('https://x.test/a.png')).toBeNull()
  })
})

describe('almacén de assets por organización', () => {
  it('guarda, deduplica por sha256 y aísla por organización', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const first = await store.put({ orgId: a.orgId, kind: 'texture', bytes: png, name: '  Roble  ', createdBy: a.userId, meta: { finish: 'woodgrain' } })
    expect(first.duplicate).toBe(false)
    expect(first.asset).toMatchObject({ orgId: a.orgId, kind: 'texture', mime: 'image/png', width: 64, height: 48, byteSize: png.length, name: 'Roble', meta: { finish: 'woodgrain' } })
    expect(first.asset.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect((first.asset as unknown as Record<string, unknown>).bytes).toBeUndefined()

    const again = await store.put({ orgId: a.orgId, kind: 'texture', bytes: png })
    expect(again).toMatchObject({ duplicate: true, asset: { id: first.asset.id } })
    // Mismo archivo en otra organización: fila propia.
    const other = await store.put({ orgId: b.orgId, kind: 'texture', bytes: png })
    expect(other.duplicate).toBe(false)
    expect(other.asset.id).not.toBe(first.asset.id)

    expect(await store.get(b.orgId, first.asset.id)).toBeNull()
    expect(await store.getBytes(b.orgId, first.asset.id)).toBeNull()
    expect(await store.dataUrl(b.orgId, first.asset.id)).toBeNull()
    const bytes = await store.getBytes(a.orgId, first.asset.id)
    expect(bytes!.bytes.equals(png)).toBe(true)
    expect(await store.dataUrl(a.orgId, first.asset.id)).toBe(toDataUrl('image/png', png))
    const many = await store.dataUrls(a.orgId, [first.asset.id, other.asset.id, 'nada'])
    expect(Object.keys(many)).toEqual([first.asset.id])
    expect((await store.list(a.orgId, { kind: 'texture' })).total).toBe(1)
  })

  it('valida tipo real, tipo declarado, tamaño, píxeles y espacio total', async () => {
    const { orgId } = await seedOrg()
    await expect(store.put({ orgId, kind: 'texture', bytes: Buffer.from('<svg/>') })).rejects.toMatchObject({ status: 415, code: 'asset_unsupported' })
    await expect(store.put({ orgId, kind: 'texture', bytes: png, declaredMime: 'image/jpeg' })).rejects.toMatchObject({ code: 'asset_unsupported' })
    expect((await store.put({ orgId, kind: 'texture', bytes: jpeg, declaredMime: 'image/jpg' })).asset.mime).toBe('image/jpeg')
    const tiny = new AssetStore(database.db, { limits: { maxBytes: { texture_thumb: 10 } as never, maxPixels: 100 } })
    await expect(tiny.put({ orgId, kind: 'texture_thumb', bytes: png })).rejects.toMatchObject({ status: 413, code: 'asset_too_large' })
    await expect(tiny.put({ orgId, kind: 'texture', bytes: webp })).rejects.toMatchObject({ status: 413, code: 'asset_too_large' })
    await expect(store.put({ orgId, kind: 'logo' as never, bytes: png })).rejects.toMatchObject({ status: 400 })

    const big = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#7a5' } }).png({ compressionLevel: 0 }).toBuffer()
    const quota = new AssetStore(database.db, { limits: { maxOrgBytes: big.length + 10 } })
    const fresh = await seedOrg()
    await quota.put({ orgId: fresh.orgId, kind: 'document_image', bytes: big })
    await expect(quota.put({ orgId: fresh.orgId, kind: 'document_image', bytes: webp })).rejects.toMatchObject({ status: 409, code: 'asset_quota' })
  })

  it('borrado suave con deshacer (también de miniaturas) y revive al subir de nuevo', async () => {
    const { orgId } = await seedOrg()
    const texture = (await store.put({ orgId, kind: 'texture', bytes: webp })).asset
    const thumb = (await store.put({ orgId, kind: 'texture_thumb', bytes: jpeg, parentId: texture.id })).asset
    await expect(store.put({ orgId, kind: 'texture_thumb', bytes: png, parentId: 'ajeno' })).rejects.toMatchObject({ status: 404 })

    expect(await store.remove(orgId, texture.id)).toBe(true)
    expect(await store.remove(orgId, texture.id)).toBe(false)
    expect(await store.get(orgId, thumb.id)).toBeNull()
    expect(await store.get(orgId, texture.id, { includeDeleted: true })).toMatchObject({ id: texture.id })
    expect((await store.usage(orgId)).count).toBe(0)

    expect(await store.restore(orgId, texture.id)).toMatchObject({ id: texture.id, deletedAt: null })
    expect(await store.get(orgId, thumb.id)).toMatchObject({ id: thumb.id })

    await store.remove(orgId, texture.id)
    const revived = await store.put({ orgId, kind: 'texture', bytes: webp, name: 'Otra vez' })
    expect(revived).toMatchObject({ duplicate: true, asset: { id: texture.id, name: 'Otra vez', deletedAt: null } })

    expect(await store.update(orgId, texture.id, { meta: { scaleMm: 900 } })).toMatchObject({ meta: { scaleMm: 900 } })
    expect(await store.purge(orgId, texture.id)).toBe(true)
    expect(await store.get(orgId, thumb.id, { includeDeleted: true })).toBeNull()
  })

  it('cabeceras para servir una imagen: nosniff, CSP sandbox y caché inmutable', () => {
    const headers = assetHttpHeaders({ id: 'a1', mime: 'image/webp', byteSize: 10, sha256: 'f'.repeat(64) })
    expect(headers).toMatchObject({
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ETag: `"${'f'.repeat(64)}"`,
    })
    expect(headers['Cache-Control']).toMatch(/private.*immutable/)
  })
})
