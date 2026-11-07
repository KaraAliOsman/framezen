/**
 * Texturas propias: subida (directa o con borrador y vista previa), consulta, cambios, borrado
 * con deshacer e imágenes en línea para dibujar. Guarda en `assets` (services/assets) la tesela
 * (kind 'texture', 512 px WebP) y su miniatura (kind 'texture_thumb', 128 px, hija de la tesela).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  type Locale,
  type ResolvedTexture,
  type TextureAsset,
  type TextureAssetMeta,
  type TextureAssetWithData,
  type TextureCommitResponse,
  type TextureDeleteResponse,
  type TextureDraftCommitBody,
  type TextureFinish,
  type TextureListResponse,
  type TexturePatchBody,
  type TexturePreview,
  type TexturePreviewResponse,
  type TextureProcessOptions,
  type TextureWarningCode,
  BUILTIN_TEXTURE_IDS,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { assets } from '../../db/schema'
import { HttpError, notFound } from '../../lib/errors'
import { firstName, logActivity } from '../activity'
import { assetColumns, assetStore, toDataUrl, type AssetRecord } from '../assets'
import { suggestTextureWithAi, type TextureAiRuntime } from './ai'
import { CustomColorService } from './color-service'
import { colorsUsingTexture } from './custom-colors'
import { TextureDraftStore, type TextureDraft } from './drafts'
import { defaultTextureName, similarBuiltinTextures } from './names'
import { TEXTURE_PIPELINE_REVISION, processTexture, sanitizeTextureSource, withPipelineSlot, type ProcessedTexture, type SanitizedSource } from './pipeline'

type Actor = Pick<AuthContext, 'org' | 'user'>

export interface TextureServiceOptions {
  /** IA por pedido (por defecto, variables AI_*). */
  ai?: () => TextureAiRuntime['ai']
  fetch?: typeof fetch
  drafts?: TextureDraftStore
}

/** Metadatos guardados en assets.meta de una tesela (contrato + extras propios). */
export type StoredTextureMeta = TextureAssetMeta & {
  hex: string
  thumbId?: string
  angleDeg?: number
  seam?: string
  coherence?: number
  crop?: { x: number; y: number; width: number; height: number }
}

const FINISHES: readonly TextureFinish[] = ['smooth', 'woodgrain', 'textured', 'metallic']

export function toTextureAsset(record: AssetRecord): TextureAsset {
  const meta = record.meta as Partial<StoredTextureMeta>
  const finish = FINISHES.includes(meta.finish as TextureFinish) ? (meta.finish as TextureFinish) : 'woodgrain'
  return {
    id: record.id,
    name: record.name ?? 'Textura',
    mime: record.mime,
    width: record.width ?? 0,
    height: record.height ?? 0,
    byteSize: record.byteSize,
    sha256: record.sha256,
    meta: {
      ...(meta as TextureAssetMeta),
      finish,
      scaleMm: typeof meta.scaleMm === 'number' ? meta.scaleMm : 900,
      palette: meta.palette ?? { base: '#808080', light: '#A0A0A0', dark: '#606060', average: '#808080' },
      seamless: meta.seamless ?? true,
      pipelineRevision: meta.pipelineRevision ?? TEXTURE_PIPELINE_REVISION,
    },
    ...(typeof meta.thumbId === 'string' ? { thumbId: meta.thumbId } : {}),
    createdAt: record.createdAt.toISOString(),
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
  }
}

export class TextureService {
  readonly drafts: TextureDraftStore
  private readonly colors: CustomColorService

  constructor(
    private readonly deps: AppDeps,
    private readonly options: TextureServiceOptions = {},
  ) {
    this.drafts = options.drafts ?? new TextureDraftStore({ now: () => deps.now().getTime() })
    this.colors = new CustomColorService(deps)
  }

  private store() {
    return assetStore(this.deps)
  }

  private aiRuntime(): TextureAiRuntime {
    return { ai: this.options.ai ? this.options.ai() : null, fetch: this.options.fetch }
  }

  // ── Subida ──────────────────────────────────────────────────────────────────

  /** Sube y procesa; con `preview` deja un borrador (sin guardar) para ajustar en vivo. */
  async upload(
    actor: Actor,
    locale: Locale,
    body: { bytes: Uint8Array; name?: string; useAi?: boolean; preview?: boolean } & TextureProcessOptions,
  ): Promise<TexturePreviewResponse | TextureCommitResponse> {
    const source = await withPipelineSlot(() => sanitizeTextureSource(body.bytes))
    const input = { orgId: actor.org.id, userId: actor.user.id, source, ...(body.name ? { name: body.name } : {}) }
    // Subida directa (API, asistente): sin borrador guardado, no desplaza los de la persona.
    const now = this.deps.now().getTime()
    const draft: TextureDraft = body.preview ? this.drafts.create(input) : { ...input, id: 'direct', createdAt: now, expiresAt: now }
    const processed = await withPipelineSlot(() => processTexture(source, body))
    let credits = 0
    if (body.useAi) credits = await this.askAi(actor, locale, draft, processed)
    if (body.preview) return { draft: { id: draft.id, expiresAt: new Date(draft.expiresAt).toISOString() }, preview: this.preview(draft, processed, locale), creditsUsed: credits }
    const saved = await this.save(actor, locale, draft, processed, { ...(body.name ? { name: body.name } : {}) })
    return { ...saved, creditsUsed: credits }
  }

  /** Vuelve a procesar el borrador con otros ajustes (giro, recorte, escala, costura, acabado). */
  async adjust(actor: Actor, locale: Locale, draftId: string, options: TextureProcessOptions & { useAi?: boolean }): Promise<TexturePreviewResponse> {
    const draft = this.draftOf(actor, draftId)
    const processed = await withPipelineSlot(() => processTexture(draft.source, options))
    let credits = 0
    if (options.useAi && !draft.ai) credits = await this.askAi(actor, locale, draft, processed)
    return { draft: { id: draft.id, expiresAt: new Date(draft.expiresAt).toISOString() }, preview: this.preview(draft, processed, locale), creditsUsed: credits }
  }

  /** Guarda el borrador con los ajustes finales (y crea el color propio si se pide). */
  async commit(actor: Actor, locale: Locale, draftId: string, body: TextureDraftCommitBody): Promise<TextureCommitResponse> {
    const draft = this.draftOf(actor, draftId)
    const processed = await withPipelineSlot(() => processTexture(draft.source, body))
    const saved = await this.save(actor, locale, draft, processed, { ...(body.name ? { name: body.name } : {}) })
    this.drafts.delete(draft.id, actor.org.id, actor.user.id)
    let color: TextureCommitResponse['color']
    if (body.color) {
      const created = await this.colors.create(actor, {
        name: body.color.name ?? saved.texture.name,
        hex: saved.texture.meta.palette.average,
        texture: { kind: 'upload', assetId: saved.texture.id, scaleMm: saved.texture.meta.scaleMm, finish: saved.texture.meta.finish },
        ...(body.color.lineIds ? { lineIds: body.color.lineIds } : {}),
        ...(body.color.priceFactor !== undefined ? { priceFactor: body.color.priceFactor } : {}),
        ...(body.color.priceBaseColorId ? { priceBaseColorId: body.color.priceBaseColorId } : {}),
      })
      color = created.color
    }
    return { ...saved, creditsUsed: 0, ...(color ? { color } : {}) }
  }

  discard(actor: Actor, draftId: string): boolean {
    return this.drafts.delete(draftId, actor.org.id, actor.user.id)
  }

  private draftOf(actor: Actor, id: string): TextureDraft {
    const draft = this.drafts.get(id, actor.org.id, actor.user.id)
    if (!draft) throw new HttpError(410, 'draft_expired', 'La vista previa venció. Vuelve a elegir la foto para seguir.')
    return draft
  }

  private async askAi(actor: Actor, locale: Locale, draft: TextureDraft, processed: ProcessedTexture): Promise<number> {
    const outcome = await suggestTextureWithAi(this.deps, actor, { imageDataUrl: toDataUrl('image/webp', processed.thumb), locale }, this.aiRuntime())
    if (outcome.ok) {
      draft.ai = outcome.suggestion
      delete draft.aiWarning
      return outcome.credits
    }
    draft.aiWarning = outcome.warning
    return 0
  }

  private preview(draft: TextureDraft, processed: ProcessedTexture, locale: Locale): TexturePreview {
    const warnings: TextureWarningCode[] = [...processed.warnings, ...(draft.aiWarning ? [draft.aiWarning] : [])]
    const finish = processed.finish
    return {
      tileDataUrl: toDataUrl('image/webp', processed.tile),
      thumbDataUrl: toDataUrl('image/webp', processed.thumb),
      beforeDataUrl: toDataUrl('image/webp', processed.before),
      finish,
      scaleMm: processed.scaleMm,
      name: draft.name ?? draft.ai?.name ?? defaultTextureName(finish, processed.analysis.palette, locale),
      hex: processed.hex,
      analysis: processed.analysis,
      ...(draft.ai ? { ai: draft.ai } : {}),
      similarBuiltin: draft.ai?.similarBuiltin?.length ? draft.ai.similarBuiltin : similarBuiltinTextures(finish, processed.analysis.palette),
      warnings,
    }
  }

  private async save(actor: Actor, locale: Locale, draft: TextureDraft, processed: ProcessedTexture, extra: { name?: string }): Promise<Omit<TextureCommitResponse, 'creditsUsed'>> {
    const store = this.store()
    const name = (extra.name ?? draft.name ?? draft.ai?.name ?? defaultTextureName(processed.finish, processed.analysis.palette, locale)).slice(0, 80)
    const meta = {
      finish: processed.finish,
      scaleMm: processed.scaleMm,
      palette: processed.analysis.palette,
      grainAngleDeg: processed.analysis.grainAngleDeg,
      rotatedDeg: processed.analysis.rotatedDeg,
      seamless: true,
      source: { width: draft.source.original.width, height: draft.source.original.height, mime: draft.source.original.mime, sha256: draft.source.original.sha256 },
      ...(draft.ai ? { ai: draft.ai } : {}),
      pipelineRevision: TEXTURE_PIPELINE_REVISION,
      hex: processed.hex,
      seam: processed.analysis.seam,
      coherence: processed.analysis.coherence,
      crop: processed.analysis.crop,
    } satisfies StoredTextureMeta
    const tile = await store.put({ orgId: actor.org.id, kind: 'texture', bytes: processed.tile, name, meta, createdBy: actor.user.id })
    let record = tile.asset
    let thumbId = (record.meta as Partial<StoredTextureMeta>).thumbId
    if (!tile.duplicate || !thumbId) {
      const thumb = await store.put({ orgId: actor.org.id, kind: 'texture_thumb', bytes: processed.thumb, parentId: record.id, createdBy: actor.user.id })
      thumbId = thumb.asset.id
      record = (await store.update(actor.org.id, record.id, { meta: { thumbId } })) ?? record
    }
    if (!tile.duplicate) {
      await logActivity(this.deps.db, {
        orgId: actor.org.id,
        actor: { userId: actor.user.id, name: actor.user.name },
        kind: 'texture.uploaded',
        text: `${firstName(actor.user.name)} subió la textura ${name}`,
        link: '/catalogo?tab=colores',
        meta: { textureId: record.id, finish: processed.finish, ai: Boolean(draft.ai) },
      })
    }
    const texture: TextureAssetWithData = {
      ...toTextureAsset(record),
      dataUrl: toDataUrl('image/webp', processed.tile),
      thumbDataUrl: toDataUrl('image/webp', processed.thumb),
    }
    return { texture, duplicate: tile.duplicate, warnings: [...processed.warnings, ...(draft.aiWarning ? [draft.aiWarning] : [])] }
  }

  // ── Consulta y cambios ──────────────────────────────────────────────────────

  async list(orgId: string, page: { limit: number; offset: number }): Promise<TextureListResponse> {
    const { items, total } = await this.store().list(orgId, { kind: 'texture', limit: page.limit, offset: page.offset })
    return { items: items.map(toTextureAsset), total, builtin: [...BUILTIN_TEXTURE_IDS] }
  }

  private async textureRecord(orgId: string, id: string): Promise<AssetRecord> {
    const record = await this.store().get(orgId, id)
    if (!record || record.kind !== 'texture') throw notFound('No encontramos esa textura.')
    return record
  }

  async get(orgId: string, id: string): Promise<TextureAssetWithData> {
    const record = await this.textureRecord(orgId, id)
    const asset = toTextureAsset(record)
    const urls = await this.store().dataUrls(orgId, [id, ...(asset.thumbId ? [asset.thumbId] : [])])
    if (!urls[id]) throw notFound('No encontramos esa textura.')
    return { ...asset, dataUrl: urls[id]!, ...(asset.thumbId && urls[asset.thumbId] ? { thumbDataUrl: urls[asset.thumbId] } : {}) }
  }

  /** Bytes de la tesela o de su miniatura (para <img>/CSS con caché del navegador). */
  async image(orgId: string, id: string, variant: 'tile' | 'thumb'): Promise<{ asset: AssetRecord; bytes: Buffer }> {
    const record = await this.textureRecord(orgId, id)
    const thumbId = (record.meta as Partial<StoredTextureMeta>).thumbId
    const target = variant === 'thumb' && thumbId ? thumbId : id
    const found = await this.store().getBytes(orgId, target)
    if (!found) throw notFound('No encontramos esa textura.')
    return found
  }

  async patch(actor: Actor, id: string, body: TexturePatchBody): Promise<TextureAsset> {
    const record = await this.textureRecord(actor.org.id, id)
    const meta: Partial<StoredTextureMeta> = {}
    if (body.scaleMm !== undefined) meta.scaleMm = Math.round(body.scaleMm)
    if (body.finish !== undefined) meta.finish = body.finish
    if (body.angleDeg !== undefined) meta.angleDeg = Math.round(body.angleDeg * 10) / 10
    const updated = await this.store().update(actor.org.id, record.id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    })
    if (!updated) throw notFound('No encontramos esa textura.')
    return toTextureAsset(updated)
  }

  async remove(actor: Actor, id: string): Promise<TextureDeleteResponse> {
    const record = await this.textureRecord(actor.org.id, id)
    await this.store().remove(actor.org.id, id)
    const state = await this.deps.catalogs.getOrgState(actor.org.id)
    const colors = colorsUsingTexture(state.custom, id).length
    await logActivity(this.deps.db, {
      orgId: actor.org.id,
      actor: { userId: actor.user.id, name: actor.user.name },
      kind: 'texture.deleted',
      text: `${firstName(actor.user.name)} borró la textura ${record.name ?? ''}`.trim(),
      link: '/catalogo?tab=colores',
      meta: { textureId: id, colors },
    })
    return { ok: true, colors, undo: { method: 'POST', path: `/api/textures/${encodeURIComponent(id)}/restore` } }
  }

  async restore(actor: Actor, id: string): Promise<TextureAsset> {
    const existing = await this.store().get(actor.org.id, id, { includeDeleted: true })
    if (!existing || existing.kind !== 'texture') throw notFound('No encontramos esa textura.')
    const restored = await this.store().restore(actor.org.id, id)
    if (!restored) throw notFound('No encontramos esa textura.')
    return toTextureAsset(restored)
  }

  /** Imágenes en línea de varias texturas (ids ajenos, borrados o que no son texturas se omiten). */
  async resolve(orgId: string, ids: readonly string[]): Promise<Record<string, ResolvedTexture>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64))].slice(0, 100)
    if (!unique.length) return {}
    const rows = await this.deps.db
      .select({ ...assetColumns, bytes: assets.bytes })
      .from(assets)
      .where(and(eq(assets.orgId, orgId), inArray(assets.id, unique), eq(assets.kind, 'texture'), isNull(assets.deletedAt)))
    const out: Record<string, ResolvedTexture> = {}
    for (const row of rows) {
      const asset = toTextureAsset(row as AssetRecord)
      const meta = row.meta as Partial<StoredTextureMeta>
      out[row.id] = {
        id: row.id,
        name: asset.name,
        dataUrl: toDataUrl(row.mime, row.bytes),
        scaleMm: asset.meta.scaleMm,
        finish: asset.meta.finish,
        hex: meta.hex ?? asset.meta.palette.average,
      }
    }
    return out
  }
}

/** Para documentos y PDF (Chromium sin red): data URLs de las texturas subidas que usan unos colores. */
export async function textureDataUrlsForColors(
  deps: Pick<AppDeps, 'db' | 'now'>,
  orgId: string,
  colors: readonly { texture?: { kind: string; assetId?: string } }[],
): Promise<Record<string, string>> {
  const ids = colors.map((c) => (c.texture?.kind === 'upload' ? c.texture.assetId : undefined)).filter((id): id is string => Boolean(id))
  if (!ids.length) return {}
  return assetStore(deps).dataUrls(orgId, ids)
}

export type { SanitizedSource }
