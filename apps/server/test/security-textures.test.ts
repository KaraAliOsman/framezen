/**
 * Revisión de seguridad de las imágenes subidas (texturas e imágenes de documentos).
 *
 * Cuota por organización: los assets borrados (suave) siguen ocupando la base hasta que se purgan,
 * y deshacer un borrado (o volver a subir la misma imagen) no puede saltarse el tope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createDatabase, type Database } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { orgs } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { AssetStore } from '../src/services/assets'

let database: Database
const images: Buffer[] = []
let size = 0

beforeAll(async () => {
  database = await createDatabase({ memory: true })
  await runMigrations(database.db)
  // Imágenes distintas del mismo tamaño (PNG sin compresión de colores lisos distintos).
  for (let i = 0; i < 8; i++) {
    images.push(await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 20 * i, g: 90, b: 200 - 10 * i } } }).png({ compressionLevel: 0 }).toBuffer())
  }
  size = Math.max(...images.map((b) => b.length))
})
afterAll(async () => {
  await database.close()
})

async function seedOrg(): Promise<string> {
  const orgId = newId()
  await database.db.insert(orgs).values({ id: orgId, name: 'Taller' })
  return orgId
}

/** Bytes guardados de verdad (vigentes + borrados aún no purgados). */
async function storedBytes(store: AssetStore, orgId: string): Promise<number> {
  const all = await store.list(orgId, { includeDeleted: true, limit: 200 })
  return all.items.reduce((sum, a) => sum + a.byteSize, 0)
}

describe('cuota de imágenes por organización', () => {
  it('borrar y volver a subir no acumula bytes sin límite (los borrados más viejos se purgan)', async () => {
    const orgId = await seedOrg()
    const store = new AssetStore(database.db, { limits: { maxOrgBytes: size * 2 + 10 } })
    for (let round = 0; round < 3; round++) {
      const a = await store.put({ orgId, kind: 'document_image', bytes: images[round * 2]! })
      const b = await store.put({ orgId, kind: 'document_image', bytes: images[round * 2 + 1]! })
      // Uso legítimo: subir tras borrar sigue funcionando.
      expect(a.duplicate || b.duplicate).toBe(false)
      await store.remove(orgId, a.asset.id)
      await store.remove(orgId, b.asset.id)
    }
    expect(await storedBytes(store, orgId)).toBeLessThanOrEqual(size * 2 + 10)
  })

  it('deshacer un borrado no permite pasar el tope', async () => {
    const orgId = await seedOrg()
    const store = new AssetStore(database.db, { limits: { maxOrgBytes: size * 2 + 10 } })
    const first = await store.put({ orgId, kind: 'document_image', bytes: images[0]! })
    const second = await store.put({ orgId, kind: 'document_image', bytes: images[1]! })
    await store.remove(orgId, first.asset.id)
    await store.remove(orgId, second.asset.id)
    await store.put({ orgId, kind: 'document_image', bytes: images[2]! })
    const kept = await store.put({ orgId, kind: 'document_image', bytes: images[3]! })
    // Ya hay dos vigentes: restaurar las borradas superaría el tope (se purgaron para hacer
    // espacio o la restauración se rechaza con 409; nunca quedan cuatro vigentes).
    for (const id of [first.asset.id, second.asset.id]) {
      const restored = await store.restore(orgId, id).catch((error: unknown) => error)
      if (restored) expect(restored).toMatchObject({ status: 409, code: 'asset_quota' })
    }
    expect((await store.usage(orgId)).bytes).toBeLessThanOrEqual(size * 2 + 10)
    // Con espacio libre, deshacer funciona como siempre.
    await store.remove(orgId, kept.asset.id)
    const again = await store.put({ orgId, kind: 'document_image', bytes: images[4]! })
    await store.remove(orgId, again.asset.id)
    expect(await store.restore(orgId, again.asset.id)).toMatchObject({ id: again.asset.id, deletedAt: null })
  })

  it('deshacer un borrado se rechaza si ya no cabe (datos guardados con un tope mayor)', async () => {
    const orgId = await seedOrg()
    const roomy = new AssetStore(database.db, { limits: { maxOrgBytes: size * 10 } })
    const strict = new AssetStore(database.db, { limits: { maxOrgBytes: size * 2 + 10 } })
    const a = await roomy.put({ orgId, kind: 'document_image', bytes: images[0]! })
    await roomy.remove(orgId, a.asset.id)
    await roomy.put({ orgId, kind: 'document_image', bytes: images[1]! })
    await roomy.put({ orgId, kind: 'document_image', bytes: images[2]! })
    await expect(strict.restore(orgId, a.asset.id)).rejects.toMatchObject({ status: 409, code: 'asset_quota' })
    expect(await strict.get(orgId, a.asset.id)).toBeNull()
  })

  it('volver a subir una imagen borrada (revivir) respeta el tope y revive su miniatura', async () => {
    const orgId = await seedOrg()
    const store = new AssetStore(database.db, { limits: { maxOrgBytes: size * 3 + 10 } })
    const tile = await store.put({ orgId, kind: 'texture', bytes: images[0]! })
    const thumb = await store.put({ orgId, kind: 'texture_thumb', bytes: images[1]!, parentId: tile.asset.id })
    await store.remove(orgId, tile.asset.id)
    const revived = await store.put({ orgId, kind: 'texture', bytes: images[0]! })
    expect(revived).toMatchObject({ duplicate: true, asset: { id: tile.asset.id, deletedAt: null } })
    expect(await store.get(orgId, thumb.asset.id)).toMatchObject({ id: thumb.asset.id })

    // Revivir (textura + miniatura) cuando lo vigente ya no deja sitio: 409, no se salta el tope.
    const roomy = new AssetStore(database.db, { limits: { maxOrgBytes: size * 10 } })
    await roomy.remove(orgId, tile.asset.id)
    await roomy.put({ orgId, kind: 'document_image', bytes: images[2]! })
    await roomy.put({ orgId, kind: 'document_image', bytes: images[3]! })
    await expect(store.put({ orgId, kind: 'texture', bytes: images[0]! })).rejects.toMatchObject({ status: 409, code: 'asset_quota' })
    expect(await store.get(orgId, tile.asset.id)).toBeNull()
  })
})
