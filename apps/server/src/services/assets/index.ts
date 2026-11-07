/**
 * Almacén de imágenes por organización (tabla `assets`, bytea en Postgres/PGlite).
 *
 * - Todo se filtra por org_id: un id de otra organización simplemente no existe.
 * - Solo PNG, JPEG y WebP reconocidos por sus bytes (sniff.ts); nunca SVG ni animaciones.
 * - Topes por tipo de asset, de píxeles y de espacio total por organización. El espacio cuenta
 *   también lo borrado que aún no se purga (sigue ocupando la base): al faltar sitio se purgan
 *   primero los borrados más viejos, y deshacer o revivir nunca deja lo vigente sobre el tope.
 * - Deduplicación por (org, tipo, sha256): subir dos veces la misma imagen devuelve la misma fila
 *   (y revive una borrada).
 * - Borrado suave con deshacer (`restore`); las borradas hace más de 30 días se purgan solas.
 * - `dataUrl(s)`: para documentos y Chromium (sin red) las imágenes viajan en línea.
 *
 * El pipeline de texturas (recorte, veta, costura, teselas WebP) vive en services/textures (TEXUP)
 * y guarda aquí su resultado.
 */
import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm'
import { ASSET_KINDS, ASSET_MIME_TYPES, type AssetKind, type AssetMimeType } from '@dekopen/shared'
import type { Db } from '../../db/client'
import { rowsOf } from '../../db/client'
import { assets, type AssetMeta } from '../../db/schema'
import { apiError, isUniqueViolation } from '../../lib/errors'
import { newId } from '../../lib/crypto'
import { sniffImage } from './sniff'

export { decodeImageDataUrl, sniffImage, type SniffedImage } from './sniff'

export interface AssetLimits {
  /** Bytes máximos por asset según su tipo (ya procesado). */
  maxBytes: Record<AssetKind, number>
  maxPixels: number
  /** Espacio total por organización (assets vigentes). */
  maxOrgBytes: number
  /** Días que se guarda un asset borrado antes de purgarlo. */
  purgeAfterDays: number
}

const MiB = 1024 * 1024

export const DEFAULT_ASSET_LIMITS: AssetLimits = {
  maxBytes: { texture: 2 * MiB, texture_thumb: 256 * 1024, document_image: 4 * MiB, avatar: 512 * 1024 },
  maxPixels: 24_000_000,
  maxOrgBytes: 200 * MiB,
  purgeAfterDays: 30,
}

/** Fila sin los bytes (lo que se lista y se devuelve). */
export interface AssetRecord {
  id: string
  orgId: string
  kind: AssetKind
  name: string | null
  mime: AssetMimeType
  byteSize: number
  width: number | null
  height: number | null
  sha256: string
  meta: AssetMeta
  parentId: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/** Columnas sin `bytes` (nunca traer megabytes en listados). */
export const assetColumns = {
  id: assets.id,
  orgId: assets.orgId,
  kind: assets.kind,
  name: assets.name,
  mime: assets.mime,
  byteSize: assets.byteSize,
  width: assets.width,
  height: assets.height,
  sha256: assets.sha256,
  meta: assets.meta,
  parentId: assets.parentId,
  createdBy: assets.createdBy,
  createdAt: assets.createdAt,
  updatedAt: assets.updatedAt,
  deletedAt: assets.deletedAt,
}

export interface PutAssetInput {
  orgId: string
  kind: AssetKind
  bytes: Uint8Array
  name?: string | null
  meta?: AssetMeta
  /** Miniatura → textura de origen (debe ser de la misma organización). */
  parentId?: string | null
  createdBy?: string | null
  /** Tipo declarado por quien sube: si no coincide con los bytes, se rechaza. */
  declaredMime?: string
}

export interface PutAssetResult {
  asset: AssetRecord
  /** Ya existía la misma imagen (mismo sha256) en esta organización y tipo. */
  duplicate: boolean
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`
}

export class AssetStore {
  readonly limits: AssetLimits

  constructor(
    private readonly db: Db,
    options: { limits?: Partial<AssetLimits>; now?: () => Date } = {},
  ) {
    this.limits = { ...DEFAULT_ASSET_LIMITS, ...options.limits, maxBytes: { ...DEFAULT_ASSET_LIMITS.maxBytes, ...options.limits?.maxBytes } }
    this.now = options.now ?? (() => new Date())
  }

  private readonly now: () => Date

  /** Valida y guarda una imagen. Lanza 415 asset_unsupported, 413 asset_too_large o 409 asset_quota. */
  async put(input: PutAssetInput): Promise<PutAssetResult> {
    if (!(ASSET_KINDS as readonly string[]).includes(input.kind)) throw apiError(400, 'invalid', { field: 'kind' })
    const bytes = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
    if (bytes.length === 0) throw apiError(415, 'asset_unsupported')
    const max = this.limits.maxBytes[input.kind]
    if (bytes.length > max) throw apiError(413, 'asset_too_large', { extra: { maxBytes: max } })
    const image = sniffImage(bytes)
    if (!image || image.animated || !(ASSET_MIME_TYPES as readonly string[]).includes(image.mime)) throw apiError(415, 'asset_unsupported')
    if (input.declaredMime && normalizeMime(input.declaredMime) !== image.mime) throw apiError(415, 'asset_unsupported')
    if (image.width * image.height > this.limits.maxPixels) throw apiError(413, 'asset_too_large', { extra: { maxPixels: this.limits.maxPixels } })
    if (input.parentId && !(await this.get(input.orgId, input.parentId))) throw apiError(404, 'not_found', { field: 'parentId' })

    const sha256 = sha256Hex(bytes)
    const existing = await this.findBySha(input.orgId, input.kind, sha256)
    if (existing) return { asset: await this.revive(existing, input), duplicate: true }

    await this.makeRoom(input.orgId, bytes.length)

    const now = this.now()
    const id = newId()
    try {
      await this.db.insert(assets).values({
        id,
        orgId: input.orgId,
        kind: input.kind,
        name: input.name?.trim().slice(0, 120) || null,
        mime: image.mime,
        bytes,
        byteSize: bytes.length,
        width: image.width,
        height: image.height,
        sha256,
        meta: input.meta ?? {},
        parentId: input.parentId ?? null,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
    } catch (error) {
      // Dos subidas idénticas a la vez: gana una y la otra recibe la misma fila.
      if (!isUniqueViolation(error)) throw error
      const raced = await this.findBySha(input.orgId, input.kind, sha256)
      if (!raced) throw error
      return { asset: await this.revive(raced, input), duplicate: true }
    }
    return { asset: (await this.get(input.orgId, id))!, duplicate: false }
  }

  /** Metadatos (sin bytes). Los borrados solo con `includeDeleted`. */
  async get(orgId: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<AssetRecord | null> {
    const where = [eq(assets.orgId, orgId), eq(assets.id, id)]
    if (!options.includeDeleted) where.push(isNull(assets.deletedAt))
    const [row] = await this.db.select(assetColumns).from(assets).where(and(...where)).limit(1)
    return (row as AssetRecord | undefined) ?? null
  }

  /** Metadatos + bytes de un asset vigente de la organización. */
  async getBytes(orgId: string, id: string): Promise<{ asset: AssetRecord; bytes: Buffer } | null> {
    const [row] = await this.db
      .select({ ...assetColumns, bytes: assets.bytes })
      .from(assets)
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id), isNull(assets.deletedAt)))
      .limit(1)
    if (!row) return null
    const { bytes, ...asset } = row
    return { asset: asset as AssetRecord, bytes }
  }

  async list(orgId: string, options: { kind?: AssetKind; limit?: number; offset?: number; includeDeleted?: boolean } = {}): Promise<{ items: AssetRecord[]; total: number }> {
    const where: SQL[] = [eq(assets.orgId, orgId)]
    if (options.kind) where.push(eq(assets.kind, options.kind))
    if (!options.includeDeleted) where.push(isNull(assets.deletedAt))
    const limit = Math.min(200, Math.max(1, options.limit ?? 50))
    const items = await this.db
      .select(assetColumns)
      .from(assets)
      .where(and(...where))
      .orderBy(desc(assets.createdAt))
      .limit(limit)
      .offset(Math.max(0, options.offset ?? 0))
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(assets).where(and(...where))
    return { items: items as AssetRecord[], total: Number(total) }
  }

  /** Cambia nombre o metadatos (se combinan con los existentes). */
  async update(orgId: string, id: string, patch: { name?: string | null; meta?: AssetMeta }): Promise<AssetRecord | null> {
    const current = await this.get(orgId, id)
    if (!current) return null
    await this.db
      .update(assets)
      .set({
        ...(patch.name !== undefined ? { name: patch.name?.trim().slice(0, 120) || null } : {}),
        ...(patch.meta ? { meta: { ...current.meta, ...patch.meta } } : {}),
        updatedAt: this.now(),
      })
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id)))
    return this.get(orgId, id)
  }

  /** Borrado suave (con sus miniaturas). Devuelve false si no existía. */
  async remove(orgId: string, id: string): Promise<boolean> {
    const now = this.now()
    const rows = await this.db
      .update(assets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id), isNull(assets.deletedAt)))
      .returning({ id: assets.id })
    if (!rows.length) return false
    await this.db
      .update(assets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(assets.orgId, orgId), eq(assets.parentId, id), isNull(assets.deletedAt)))
    return true
  }

  /** Deshace un borrado (con sus miniaturas). */
  async restore(orgId: string, id: string): Promise<AssetRecord | null> {
    await this.ensureRestorable(orgId, id)
    const now = this.now()
    const rows = await this.db
      .update(assets)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(assets.orgId, orgId), eq(assets.id, id)))
      .returning({ id: assets.id })
    if (!rows.length) return null
    await this.db.update(assets).set({ deletedAt: null, updatedAt: now }).where(and(eq(assets.orgId, orgId), eq(assets.parentId, id)))
    return this.get(orgId, id)
  }

  /** Borrado definitivo (sin deshacer). */
  async purge(orgId: string, id: string): Promise<boolean> {
    const rows = await this.db.delete(assets).where(and(eq(assets.orgId, orgId), eq(assets.id, id))).returning({ id: assets.id })
    return rows.length > 0
  }

  async dataUrl(orgId: string, id: string): Promise<string | null> {
    const found = await this.getBytes(orgId, id)
    return found ? toDataUrl(found.asset.mime, found.bytes) : null
  }

  /** Varias imágenes en línea de una vez (ids ajenos o borrados se omiten). */
  async dataUrls(orgId: string, ids: readonly string[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))].slice(0, 200)
    if (!unique.length) return {}
    const rows = await this.db
      .select({ id: assets.id, mime: assets.mime, bytes: assets.bytes })
      .from(assets)
      .where(and(eq(assets.orgId, orgId), inArray(assets.id, unique), isNull(assets.deletedAt)))
    const out: Record<string, string> = {}
    for (const row of rows) out[row.id] = toDataUrl(row.mime, row.bytes)
    return out
  }

  /** Espacio usado por los assets vigentes. */
  async usage(orgId: string): Promise<{ bytes: number; count: number }> {
    const result = await this.db.execute(
      sql`SELECT coalesce(sum(${assets.byteSize}), 0)::bigint AS bytes, count(*)::int AS count FROM ${assets} WHERE ${assets.orgId} = ${orgId} AND ${assets.deletedAt} IS NULL`,
    )
    const [row] = rowsOf<{ bytes: string | number; count: string | number }>(result)
    return { bytes: Number(row?.bytes ?? 0), count: Number(row?.count ?? 0) }
  }

  private async findBySha(orgId: string, kind: AssetKind, sha256: string): Promise<AssetRecord | null> {
    const [row] = await this.db
      .select(assetColumns)
      .from(assets)
      .where(and(eq(assets.orgId, orgId), eq(assets.kind, kind), eq(assets.sha256, sha256)))
      .limit(1)
    return (row as AssetRecord | undefined) ?? null
  }

  private async revive(existing: AssetRecord, input: PutAssetInput): Promise<AssetRecord> {
    if (!existing.deletedAt) return existing
    await this.ensureRestorable(existing.orgId, existing.id)
    const now = this.now()
    await this.db
      .update(assets)
      .set({
        deletedAt: null,
        updatedAt: now,
        ...(input.name ? { name: input.name.trim().slice(0, 120) } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
      })
      .where(and(eq(assets.orgId, existing.orgId), eq(assets.id, existing.id)))
    // Igual que deshacer: vuelven también sus miniaturas (la textura las sigue nombrando).
    await this.db.update(assets).set({ deletedAt: null, updatedAt: now }).where(and(eq(assets.orgId, existing.orgId), eq(assets.parentId, existing.id)))
    return (await this.get(existing.orgId, existing.id))!
  }

  /** Bytes vigentes y bytes guardados (vigentes + borrados aún no purgados). */
  private async footprint(orgId: string): Promise<{ live: number; stored: number }> {
    const result = await this.db.execute(
      sql`SELECT coalesce(sum(${assets.byteSize}) FILTER (WHERE ${assets.deletedAt} IS NULL), 0)::bigint AS live, coalesce(sum(${assets.byteSize}), 0)::bigint AS stored FROM ${assets} WHERE ${assets.orgId} = ${orgId}`,
    )
    const [row] = rowsOf<{ live: string | number; stored: string | number }>(result)
    return { live: Number(row?.live ?? 0), stored: Number(row?.stored ?? 0) }
  }

  private quotaError() {
    return apiError(409, 'asset_quota', { extra: { maxBytes: this.limits.maxOrgBytes } })
  }

  /**
   * Hace sitio para `incoming` bytes: lo vigente debe caber; si con lo borrado no cabe, se purgan
   * los borrados más viejos (sin hijos vigentes) hasta que quepa. Sin esto, borrar y volver a subir
   * acumulaba bytes sin límite durante los 30 días de deshacer.
   */
  private async makeRoom(orgId: string, incoming: number): Promise<void> {
    await this.purgeExpired(orgId)
    const max = this.limits.maxOrgBytes
    let { live, stored } = await this.footprint(orgId)
    if (live + incoming > max) throw this.quotaError()
    if (stored + incoming <= max) return
    const victims = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.orgId, orgId),
          isNotNull(assets.deletedAt),
          sql`NOT EXISTS (SELECT 1 FROM ${assets} AS child WHERE child.org_id = ${orgId} AND child.parent_id = ${assets.id} AND child.deleted_at IS NULL)`,
        ),
      )
      .orderBy(asc(assets.deletedAt), asc(assets.createdAt))
      .limit(500)
    for (const victim of victims) {
      await this.db.delete(assets).where(and(eq(assets.orgId, orgId), eq(assets.id, victim.id), isNotNull(assets.deletedAt)))
      ;({ live, stored } = await this.footprint(orgId))
      if (stored + incoming <= max) return
    }
    throw this.quotaError()
  }

  /** Deshacer un borrado (o revivir) no puede dejar lo vigente por encima del tope. */
  private async ensureRestorable(orgId: string, id: string): Promise<void> {
    const result = await this.db.execute(
      sql`SELECT coalesce(sum(${assets.byteSize}), 0)::bigint AS bytes FROM ${assets} WHERE ${assets.orgId} = ${orgId} AND ${assets.deletedAt} IS NOT NULL AND (${assets.id} = ${id} OR ${assets.parentId} = ${id})`,
    )
    const [row] = rowsOf<{ bytes: string | number }>(result)
    const extra = Number(row?.bytes ?? 0)
    if (extra <= 0) return
    const { live } = await this.footprint(orgId)
    if (live + extra > this.limits.maxOrgBytes) throw this.quotaError()
  }

  private async purgeExpired(orgId: string): Promise<void> {
    const cutoff = new Date(this.now().getTime() - this.limits.purgeAfterDays * 86_400_000)
    await this.db.delete(assets).where(and(eq(assets.orgId, orgId), lt(assets.deletedAt, cutoff)))
  }
}

/**
 * Cabeceras para servir los bytes de un asset: tipo exacto, nosniff, CSP que impide ejecutar o
 * incrustar nada, caché privada inmutable (el contenido nunca cambia para un id) y ETag = sha256.
 */
export function assetHttpHeaders(asset: Pick<AssetRecord, 'mime' | 'byteSize' | 'sha256' | 'id'>): Record<string, string> {
  return {
    'Content-Type': asset.mime,
    'Content-Length': String(asset.byteSize),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'private, max-age=31536000, immutable',
    ETag: `"${asset.sha256}"`,
    'Content-Disposition': `inline; filename="${asset.id}.${asset.mime.split('/')[1] === 'jpeg' ? 'jpg' : asset.mime.split('/')[1]}"`,
  }
}

function normalizeMime(value: string): string {
  const type = value.split(';')[0]!.trim().toLowerCase()
  return type === 'image/jpg' ? 'image/jpeg' : type
}

/** Almacén con la base de las dependencias de la app. */
export function assetStore(deps: { db: Db; now?: () => Date }, limits?: Partial<AssetLimits>): AssetStore {
  return new AssetStore(deps.db, { limits, now: deps.now })
}
